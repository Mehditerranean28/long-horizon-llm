# -*- coding: utf-8 -*-
"""Default mock solver & planner for MVP/demo; swap with real backends easily."""

from __future__ import annotations

from typing import Mapping, Optional

from .constants import ANALYSIS_NODE_PROMPT, ANSWER_NODE_PROMPT, EXAMPLES_NODE_PROMPT
from .bb_types import PlannerLLM, SolverResult


class EchoSolver:
    """Echo back the prompt wrapped under an H2 header (safe, deterministic)."""

    async def solve(self, task: str, context: Optional[Mapping[str, object]] = None) -> SolverResult:
        section = str((context or {}).get("node", "Answer")).replace("-", " ").title()
        text = f"## {section}\n\n{task.strip()}\n"
        return SolverResult(text=text, total_tokens=len(text) // 4)


class PromptLLM:
    """Returns a tiny plan JSON deterministically."""

    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0) -> str:
        import json

        plan = {
            "nodes": [
                {
                    "name": "analysis",
                    "prompt": ANALYSIS_NODE_PROMPT,
                    "deps": [],
                    "role": "backbone",
                    "contract": {
                        "format": {"markdown_section": "Analysis"},
                        "tests": [{"kind": "nonempty", "arg": ""}, {"kind": "word_count_min", "arg": 100}],
                    },
                },
                {
                    "name": "answer",
                    "prompt": ANSWER_NODE_PROMPT,
                    "deps": ["analysis"],
                    "role": "backbone",
                    "contract": {
                        "format": {"markdown_section": "Final Answer"},
                        "tests": [{"kind": "nonempty", "arg": ""}, {"kind": "contains", "arg": "analysis"}],
                    },
                },
                {
                    "name": "examples",
                    "prompt": EXAMPLES_NODE_PROMPT,
                    "deps": ["answer"],
                    "role": "adjunct",
                    "contract": {"format": {"markdown_section": "Examples"}, "tests": [{"kind": "nonempty", "arg": ""}]},
                },
            ]
        }
        return json.dumps(plan, ensure_ascii=False, indent=2)


async def build_default_solver_and_planner(use_mock_llm: bool = True):
    """Factory for demo fallbacks."""
    solver = EchoSolver()
    planner = PromptLLM()
    return solver, planner
