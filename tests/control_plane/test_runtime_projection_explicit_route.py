from pathlib import Path

import pytest

from canonical_authority_fixture import promoted_create_fixture
from loopx import paths
from loopx.control_plane.effect_runtime import restart_effect_runtime
from loopx.control_plane.runtime import runtime_projection_route
from loopx.control_plane.runtime.runtime_projection_route import (
    runtime_projection_candidate_roots,
)
from loopx.status import collect_status


def test_explicit_status_survives_conflicting_defaults(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    current, legacy = tmp_path / "current", tmp_path / "legacy"
    for root in (current, legacy):
        root.mkdir()
        (root / "machine.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(paths, "DEFAULT_RUNTIME_ROOT", current)
    monkeypatch.setattr(paths, "LEGACY_RUNTIME_ROOT", legacy)
    registry, runtime, _state = promoted_create_fixture(tmp_path / "fixture")
    try:
        projection = collect_status(
            registry_path=registry,
            runtime_root_override=str(runtime),
            scan_roots=[],
            limit=10,
            goal_id="goal-a",
            include_public_boundary_scan=False,
        )
        assert any(goal["id"] == "goal-a" for goal in projection["run_history"]["goals"])
        assert set(runtime_projection_candidate_roots(source_runtime_root=runtime)) == {
            current, legacy, runtime,
        }
        # Diagnostic discovery never authorizes implicit execution or migration.
        with pytest.raises(ValueError, match="Both default LoopX runtime roots"):
            paths.select_default_runtime_root()
        assert (current / "machine.json").read_text() == "{}"
        assert (legacy / "machine.json").read_text() == "{}"
    finally:
        restart_effect_runtime()


def test_explicit_candidates_do_not_discover_other_roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    def unexpected_read():
        pytest.fail("Explicit candidate roots must remain isolated")

    monkeypatch.setattr(runtime_projection_route, "default_runtime_route", unexpected_read, raising=False)
    root = tmp_path / "explicit"
    assert runtime_projection_candidate_roots(
        source_runtime_root=root, candidate_roots=[root, root],
    ) == [root]


def test_invalid_default_root_is_not_treated_as_a_conflict(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    current = tmp_path / "invalid"
    current.write_text("not a directory", encoding="utf-8")
    monkeypatch.setattr(paths, "DEFAULT_RUNTIME_ROOT", current)
    monkeypatch.setattr(paths, "LEGACY_RUNTIME_ROOT", tmp_path / "absent")
    with pytest.raises(ValueError):
        runtime_projection_candidate_roots(source_runtime_root=tmp_path / "explicit")
