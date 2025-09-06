"""Tests for pipeline orchestrator.

Target features:
- _extract_mission separates mission JSON from query.
- Orchestrator.run yields deterministic artifacts and final output with MockLLM.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import asyncio
import pytest

# Ensure backend and kern packages are importable
ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import backend.pipeline as pipeline  # noqa: E402


@pytest.mark.parametrize(
    "raw,clean,mission",
    [
        ("What is 2+2?", "What is 2+2?", None),
        (
            f"{pipeline.MISSION_START}\n{{\"query_context\":\"qc\"}}\n{pipeline.MISSION_END}\n\nWhat?",
            "What?",
            {"query_context": "qc"},
        ),
    ],
)
def test_extract_mission(raw: str, clean: str, mission) -> None:
    out_clean, out_mission = pipeline._extract_mission(raw)
    assert out_clean == clean
    assert out_mission == mission


@pytest.mark.parametrize(
    "query",
    [
        "Design robust wildcard matcher for '?' and '*'.",
        "Write a spec for quicksort.",
    ],
)
def test_orchestrator_run(query: str) -> None:
    orch = pipeline.Orchestrator(
        llm=pipeline.MockLLM(),
        guidelines="Be terse, precise, and fully actionable.",
    )
    result = asyncio.run(orch.run(query))
    assert "final" in result and result["final"].startswith("Final:")
    assert result["artifacts"], "Expected artifacts to be produced"
