"""
Loki Managed Agents Memory - Event emission (v6.83.0 Phase 1).

Appends structured JSONL events to .loki/managed/events.ndjson. Single-writer
convention: only code in memory/managed_memory/ writes to this file. Rotates
when the file exceeds 10MB.

Events are used to record fallbacks, shadow-write successes/failures, and
retrieve hits. The file is safe to tail for observability during development.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# 10 MB rotation threshold. Keeping rotation simple: rename to .<YYYYMMDD>.
_ROTATE_BYTES = 10 * 1024 * 1024


def _events_dir(target_dir: Optional[str] = None) -> Path:
    base = target_dir or os.environ.get("LOKI_TARGET_DIR") or os.getcwd()
    return Path(base) / ".loki" / "managed"


def _maybe_rotate(path: Path) -> None:
    """Rotate the events file if it has exceeded the size threshold."""
    try:
        if path.exists() and path.stat().st_size >= _ROTATE_BYTES:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            rotated = path.with_suffix(path.suffix + f".{stamp}")
            # Best-effort rename; if another writer got there first, move on.
            try:
                path.rename(rotated)
            except OSError:
                pass
    except OSError:
        # If stat fails, skip rotation; next write will retry.
        pass


def emit_managed_event(
    event_type: str,
    payload: Dict[str, Any],
    target_dir: Optional[str] = None,
) -> None:
    """
    Append a managed-memory event to .loki/managed/events.ndjson.

    Never raises: on any I/O error the function silently returns. Callers
    rely on this to keep the main RARV-C loop unblocked.

    Args:
        event_type: short tag, e.g. "managed_agents_fallback",
            "managed_memory_retrieve", "managed_memory_shadow_write".
        payload: JSON-serializable context for the event.
        target_dir: optional project root override. Defaults to
            LOKI_TARGET_DIR env or cwd.
    """
    try:
        dir_path = _events_dir(target_dir)
        dir_path.mkdir(parents=True, exist_ok=True)
        path = dir_path / "events.ndjson"
        _maybe_rotate(path)

        record = {
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "type": event_type,
            "payload": payload,
        }
        # Line-buffered append; JSONL.
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")
    except Exception:
        # Never raise from the event emitter.
        return
