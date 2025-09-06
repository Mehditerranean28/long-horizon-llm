"""Tests for blackboard module.

Target features:
- _sanitize_text removes control chars and normalizes newlines.
- classify_query heuristic distinguishes Atomic/Hybrid/Composite.
- classify_query_llm falls back gracefully when LLM is None.
"""

from __future__ import annotations

import asyncio

import pytest

import blackboard  # import lightweight module directly


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("\x07bad\rtext", "bad\ntext"),
        ("line1\r\nline2\x0c", "line1\nline2"),
    ],
)
def test_sanitize_text(raw: str, expected: str) -> None:
    assert blackboard._sanitize_text(raw) == expected


@pytest.mark.parametrize(
    "query,kind",
    [
        ("Write a spec for the API", "Atomic"),
        ("Compare A and B then implement", "Hybrid"),
        (
            "Design architecture, spec, and roadmap; after implementing module A, then benchmark performance and compare options across phases.",
            "Composite",
        ),
    ],
)
def test_classify_query(query: str, kind: str) -> None:
    result = blackboard.classify_query(query)
    assert result.kind == kind


def test_classify_query_llm_fallback() -> None:
    result = asyncio.run(blackboard.classify_query_llm("Simple task", None))
    assert result.kind in {"Atomic", "Hybrid", "Composite"}
    assert 0.0 <= result.score <= 1.0
