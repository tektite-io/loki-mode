"""tests/dashboard/test_migration_engine_bughunt_w4.py

W4 bug-hunt regression tests for dashboard/migration_engine.py and its
server endpoints (dashboard/server.py). Covers three confirmed defects:

  M1 (data integrity, race) -- every FastAPI endpoint builds a FRESH
      MigrationPipeline via load(), each with its own per-instance
      threading.Lock, so two concurrent manifest read-modify-writes for the
      SAME migration_id were NOT serialized: last-writer-wins dropped one
      update. The fix adds a cross-process OS file lock keyed on the migration
      directory. This test drives two threads through different manifest keys
      under a barrier and asserts BOTH updates survive (no lost update).

  M2 (API contract) -- advance_phase raises RuntimeError when the phase is no
      longer in_progress (e.g. already advanced); the server's advance endpoint
      let that hit the generic `except Exception -> 500`. The sibling
      start-phase endpoint already maps (ValueError, RuntimeError) -> 409. This
      test exercises the REAL advance_phase status-error path (gate passes,
      first advance succeeds, second advance on the same from_phase fails) and
      asserts 409 with the status message -- not a vacuous gate 409.

  M3 (data integrity, collision) -- _generate_migration_id used only
      second-resolution time + path basename, so two migrations of the same
      path started in the same second collided and the second overwrote the
      first. The fix appends a random hex suffix. This test generates two ids
      for the same path within the same second (clock patched) and asserts they
      differ, both still match the load() regex, and both dirs coexist.

HERMETICITY
-----------
MIGRATIONS_DIR is computed at import time from LOKI_DATA_DIR, but __init__ and
load() read migration_engine.MIGRATIONS_DIR at call time, so monkeypatching the
module attribute (saved/restored in setUp/tearDown) redirects all state into a
per-test tmp without touching ~/.loki and without importlib.reload (which caused
a release-gate isolation failure elsewhere).
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from dashboard import migration_engine as me
from dashboard.migration_engine import MigrationPipeline


MIGRATION_ID_RE = r'^mig_\d{8}_\d{6}_[a-zA-Z0-9_-]+$'


class _PinnedMigrationsDir:
    """Pin migration_engine.MIGRATIONS_DIR to a tmp for the test body."""

    def __init__(self, tmp_migrations: str):
        self.tmp = tmp_migrations
        self._orig = None

    def __enter__(self):
        self._orig = me.MIGRATIONS_DIR
        me.MIGRATIONS_DIR = self.tmp
        return self

    def __exit__(self, exc_type, exc, tb):
        me.MIGRATIONS_DIR = self._orig


class MigrationEngineBughuntW4(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="loki-mig-w4-")
        # A real codebase dir whose basename becomes the migration name.
        self.codebase = os.path.join(self.tmp, "legacy_app")
        os.makedirs(self.codebase, exist_ok=True)
        self.migrations_dir = os.path.join(self.tmp, "migrations")
        os.makedirs(self.migrations_dir, exist_ok=True)
        self._pin = _PinnedMigrationsDir(self.migrations_dir)
        self._pin.__enter__()

    def tearDown(self):
        self._pin.__exit__(None, None, None)
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- helpers ----------------------------------------------------------

    def _new_migration(self):
        """Create a migration whose 'understand' phase is in_progress."""
        pipeline = MigrationPipeline(codebase_path=self.codebase, target="fastapi")
        pipeline.create_manifest()
        return pipeline.migration_id

    def _pass_understand_gate(self, migration_id: str) -> None:
        """Write the artifacts the understand->guardrail gate requires."""
        mdir = Path(self.migrations_dir) / migration_id
        (mdir / "docs").mkdir(parents=True, exist_ok=True)
        (mdir / "docs" / "overview.md").write_text("overview\n", encoding="utf-8")
        (mdir / "seams.json").write_text("[]", encoding="utf-8")

    # -- M1: lost-update race --------------------------------------------

    def test_m1_concurrent_start_phase_no_lost_update(self):
        """Two threads start two DIFFERENT phases concurrently on the same id.

        Each thread builds its OWN pipeline via load() (mirroring how every
        FastAPI request constructs a fresh instance), then start_phase()s a
        distinct phase. The two writes touch different manifest keys, so a
        correct serialization preserves BOTH. Under the pre-fix per-instance
        lock the read-modify-write interleaves and one transition is clobbered
        (last writer wins). A barrier forces both threads into the RMW window
        together to make the race deterministic-ish.
        """
        migration_id = self._new_migration()

        barrier = threading.Barrier(2)
        errors: list[BaseException] = []

        def worker(phase: str):
            try:
                p = MigrationPipeline.load(migration_id)
                barrier.wait(timeout=10)
                p.start_phase(phase)
            except BaseException as exc:  # noqa: BLE001 - capture for assert
                errors.append(exc)

        # "guardrail" and "verify" are independent manifest keys; neither is the
        # already-in_progress "understand", so start_phase is not a no-op.
        t1 = threading.Thread(target=worker, args=("guardrail",))
        t2 = threading.Thread(target=worker, args=("verify",))
        t1.start()
        t2.start()
        t1.join(timeout=15)
        t2.join(timeout=15)

        # A hang here would indicate a deadlock introduced by the file lock.
        self.assertFalse(t1.is_alive(), "thread 1 hung (possible deadlock)")
        self.assertFalse(t2.is_alive(), "thread 2 hung (possible deadlock)")
        self.assertEqual(errors, [], f"worker raised: {errors}")

        manifest = MigrationPipeline.load(migration_id).load_manifest()
        self.assertEqual(
            manifest.phases["guardrail"]["status"], "in_progress",
            "guardrail transition lost (last-writer-wins clobber)",
        )
        self.assertEqual(
            manifest.phases["verify"]["status"], "in_progress",
            "verify transition lost (last-writer-wins clobber)",
        )

    # -- M2: 409 not 500 on advance of an already-advanced phase ---------

    def _migration_imports_available(self) -> bool:
        try:
            from fastapi.testclient import TestClient  # noqa: F401
            import httpx  # noqa: F401
        except Exception:
            return False
        return True

    def test_m2_advance_already_advanced_returns_409(self):
        """End-to-end via TestClient: advancing a completed phase -> 409, 500.

        First advance (understand->guardrail) succeeds after the gate is
        satisfied. The second advance with the same from_phase reaches
        advance_phase's status check (understand is now 'completed', not
        'in_progress') and raises RuntimeError. The endpoint must map that to
        409 with the status message, proving it is the advance_phase mapping
        rather than the pre-check gate (which would 409 for a different reason).
        """
        if not self._migration_imports_available():
            self.skipTest("fastapi TestClient / httpx not available")

        from fastapi.testclient import TestClient
        from dashboard.server import app

        migration_id = self._new_migration()
        self._pass_understand_gate(migration_id)

        client = TestClient(app, raise_server_exceptions=False)

        first = client.post(
            f"/api/migration/{migration_id}/advance",
            json={"from_phase": "understand", "to_phase": "guardrail"},
        )
        self.assertEqual(first.status_code, 200, first.text)

        second = client.post(
            f"/api/migration/{migration_id}/advance",
            json={"from_phase": "understand", "to_phase": "guardrail"},
        )
        self.assertEqual(
            second.status_code, 409,
            f"expected 409 on re-advance, got {second.status_code}: {second.text}",
        )
        detail = second.json().get("detail", "")
        # Prove this is the advance_phase status RuntimeError, not a vacuous
        # gate failure: the gate still passes (docs + seams exist), so the 409
        # must carry the status message.
        self.assertIn(
            "status is",
            detail,
            f"409 should come from the advance_phase status check, got: {detail!r}",
        )

    def test_m2_engine_raises_runtimeerror_directly(self):
        """Unit-level proof the engine raises RuntimeError (not a 500 cause).

        Guards against the engine behavior the server mapping depends on.
        """
        migration_id = self._new_migration()
        self._pass_understand_gate(migration_id)
        p = MigrationPipeline.load(migration_id)
        p.advance_phase("understand")  # understand -> completed, guardrail -> in_progress
        with self.assertRaises(RuntimeError):
            MigrationPipeline.load(migration_id).advance_phase("understand")

    # -- M3: id collision -------------------------------------------------

    def test_m3_same_second_same_path_ids_differ(self):
        """Two migrations of the same path in the same second get distinct ids.

        The clock is pinned so date_str/time_str are identical for both. Without
        the random suffix the ids would collide and the second create_manifest
        would overwrite the first. We assert: ids differ, both match the load()
        regex, and both directories coexist on disk.
        """
        fixed = me.datetime(2026, 6, 17, 14, 30, 52, tzinfo=me.timezone.utc)

        with mock.patch.object(me, "datetime") as mock_dt:
            mock_dt.now.return_value = fixed
            # _generate_migration_id uses strftime on the now() result; the real
            # datetime methods on the returned instance still work because it is
            # a genuine datetime object.
            p1 = MigrationPipeline(codebase_path=self.codebase, target="fastapi")
            p2 = MigrationPipeline(codebase_path=self.codebase, target="fastapi")

        self.assertNotEqual(
            p1.migration_id, p2.migration_id,
            "same-second same-path migrations must not collide",
        )
        for mid in (p1.migration_id, p2.migration_id):
            self.assertRegex(
                mid, MIGRATION_ID_RE,
                f"id {mid!r} no longer matches the load() validation regex",
            )
            self.assertTrue(
                (Path(self.migrations_dir) / mid).is_dir(),
                f"migration dir for {mid} missing",
            )
        # Shared timestamp prefix, distinct suffixes (proves the suffix is the
        # differentiator, not the clock).
        prefix = "mig_20260617_143052_legacy_app-"
        self.assertTrue(p1.migration_id.startswith(prefix), p1.migration_id)
        self.assertTrue(p2.migration_id.startswith(prefix), p2.migration_id)

    def test_m3_suffix_format_matches_regex(self):
        """A freshly generated id (real clock) matches the load() regex."""
        p = MigrationPipeline(codebase_path=self.codebase, target="fastapi")
        self.assertRegex(p.migration_id, MIGRATION_ID_RE)
        # And load() accepts it without raising the validation ValueError.
        p.create_manifest()
        MigrationPipeline.load(p.migration_id)  # must not raise


if __name__ == "__main__":
    unittest.main()
