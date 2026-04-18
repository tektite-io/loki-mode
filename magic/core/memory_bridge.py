"""Memory bridge for Magic Modules.

Feeds component-generation outcomes into Loki's memory system so agents
benefit from prior work across iterations and projects:

- Episodic memory: "Generated {name} on iteration N, debate score X, took Y seconds"
- Semantic memory: "Components tagged [form, button] pass debate with rounds=2"
- Procedural skills: "How to structure an accessible Button component" (successful patterns)

The memory system may or may not be available; every function here degrades
gracefully if memory imports fail.
"""

import json
import time
from pathlib import Path
from typing import Optional


def _try_import_memory():
    """Attempt to import the memory subsystem. Returns (MemoryEngine_class, err)."""
    try:
        from memory.engine import MemoryEngine
        return MemoryEngine, None
    except Exception as exc:
        return None, str(exc)


def _load_registry(project_dir: str) -> Optional[dict]:
    reg = Path(project_dir) / ".loki" / "magic" / "registry.json"
    if not reg.exists():
        return None
    try:
        return json.loads(reg.read_text())
    except Exception:
        return None


def capture_component_generation(
    project_dir: str,
    component_name: str,
    spec_path: str,
    targets: list,
    debate_result: Optional[dict] = None,
    iteration: int = 0,
    duration_seconds: float = 0,
) -> dict:
    """Record an episode for a single component generation event.

    Returns summary dict {stored: bool, reason: str}.
    """
    ME, err = _try_import_memory()
    if ME is None:
        return {"stored": False, "reason": f"memory unavailable: {err}"}

    try:
        engine = ME(project_dir=project_dir)
        # Episode content
        debate_summary = ""
        if debate_result:
            c_count = len(debate_result.get("critiques", []))
            consensus = debate_result.get("consensus", False)
            blocks = len(debate_result.get("blocks", []))
            debate_summary = (
                f" Debate: {c_count} personas, consensus={consensus}, "
                f"blocks={blocks}"
            )
        content = (
            f"Generated magic component '{component_name}' "
            f"(targets: {','.join(targets) if targets else 'unknown'}, "
            f"iteration {iteration}, {duration_seconds:.1f}s)."
            f"{debate_summary}"
        )
        # Try to store -- adapt to whichever API the memory engine exposes
        if hasattr(engine, "store_episode"):
            engine.store_episode(
                content=content,
                tags=["magic", "component", component_name] + (targets or []),
                metadata={
                    "component": component_name,
                    "spec_path": spec_path,
                    "targets": targets,
                    "iteration": iteration,
                    "debate": debate_result or {},
                },
            )
        elif hasattr(engine, "add_episode"):
            engine.add_episode(content=content, tags=["magic", component_name])
        else:
            return {"stored": False, "reason": "memory engine API unknown"}
        return {"stored": True, "reason": "episode saved"}
    except Exception as exc:
        return {"stored": False, "reason": f"store failed: {exc}"}


def capture_iteration_compound(project_dir: str, iteration: int = 0) -> dict:
    """Called in COMPOUND phase: aggregate component stats and record semantic pattern.

    Reads registry, computes per-tag pass rates, and stores as semantic memory.
    """
    data = _load_registry(project_dir)
    if not data:
        return {"recorded": False, "reason": "no registry"}

    components = data.get("components", [])
    if isinstance(components, dict):
        components = [{"name": k, **(v or {})} for k, v in components.items()]

    if not components:
        return {"recorded": False, "reason": "no components"}

    # Build per-tag pass rate
    tag_stats = {}
    for c in components:
        tags = c.get("tags", []) or []
        debate_passed = bool(c.get("debate_passed"))
        for tag in tags:
            bucket = tag_stats.setdefault(tag, {"total": 0, "passed": 0})
            bucket["total"] += 1
            if debate_passed:
                bucket["passed"] += 1

    # Derive patterns: tags with >=3 components and >=80% pass rate are "stable"
    stable_tags = [
        t for t, s in tag_stats.items()
        if s["total"] >= 3 and s["passed"] / s["total"] >= 0.8
    ]

    ME, err = _try_import_memory()
    if ME is None:
        return {
            "recorded": False,
            "reason": f"memory unavailable: {err}",
            "stable_tags": stable_tags,
            "tag_stats": tag_stats,
        }

    try:
        engine = ME(project_dir=project_dir)
        content = (
            f"Magic component patterns (iteration {iteration}): "
            f"{len(components)} total components; "
            f"stable tag clusters: {stable_tags if stable_tags else 'none yet'}. "
            f"Tag pass rates: {_format_tag_stats(tag_stats)}."
        )
        # Prefer semantic API if available; else episodic
        if hasattr(engine, "store_semantic_pattern"):
            engine.store_semantic_pattern(
                content=content,
                tags=["magic", "compound", "component-patterns"],
                metadata={"iteration": iteration, "tag_stats": tag_stats},
            )
        elif hasattr(engine, "store_pattern"):
            engine.store_pattern(content=content, tags=["magic", "compound"])
        elif hasattr(engine, "store_episode"):
            engine.store_episode(content=content, tags=["magic", "compound"])
        return {
            "recorded": True,
            "stable_tags": stable_tags,
            "component_count": len(components),
        }
    except Exception as exc:
        return {"recorded": False, "reason": f"store failed: {exc}"}


def recall_similar_components(project_dir: str, tags: list = None, query: str = "") -> list:
    """Query memory for similar prior components. Used at REASON phase to reuse patterns.

    Returns list of remembered components (possibly empty).
    """
    ME, err = _try_import_memory()
    if ME is None:
        return []
    try:
        engine = ME(project_dir=project_dir)
        results = []
        if hasattr(engine, "search"):
            results = engine.search(query=query or "magic component", tags=tags or []) or []
        elif hasattr(engine, "retrieve"):
            results = engine.retrieve(query=query or "magic component") or []
        # Normalize to list of dicts
        return [r if isinstance(r, dict) else {"content": str(r)} for r in results]
    except Exception:
        return []


def _format_tag_stats(stats: dict, limit: int = 8) -> str:
    items = sorted(stats.items(), key=lambda x: x[1]["total"], reverse=True)[:limit]
    parts = []
    for tag, s in items:
        pct = (s["passed"] / s["total"] * 100.0) if s["total"] else 0.0
        parts.append(f"{tag}={s['passed']}/{s['total']} ({pct:.0f}%)")
    return ", ".join(parts) if parts else "none"


if __name__ == "__main__":
    import sys
    project = sys.argv[1] if len(sys.argv) > 1 else "."
    print(json.dumps(capture_iteration_compound(project), indent=2))
