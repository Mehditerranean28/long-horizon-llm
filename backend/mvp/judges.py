# -*- coding: utf-8 -*-
"""Judges & registry."""

from __future__ import annotations

import re
from dataclasses import asdict
from typing import Dict, List

try:
    from .bb_types import Contract, Critique, Judge
    from .utils import ensure_header
except ImportError:  # pragma: no cover - fallback for script usage
    from bb_types import Contract, Critique, Judge  # type: ignore
    from utils import ensure_header  # type: ignore


class JudgeRegistry:
    def __init__(self) -> None:
        self._judges: List[Judge] = []

    def register(self, j: Judge) -> None:
        self._judges.append(j)

    def get_all(self) -> List[Judge]:
        return list(self._judges)


# -------------------------- Built-in lightweight judges ----------------------


class StructureJudge:
    name: str = "structure"

    async def critique(self, text: str, contract: Contract) -> Critique:
        desired = contract.format.get("markdown_section", "").strip()
        score = 0.85
        comments = []
        guidance: Dict[str, float] = {"structure": 0.0, "brevity": 0.0, "evidence": 0.0}
        if desired:
            hdr_ok, _ = ensure_header(text, desired)
            if not hdr_ok:
                score -= 0.2
                guidance["structure"] += 0.2
                comments.append(f"Missing header: '{desired}'.")
        if len(text.strip()) < 50:
            score -= 0.15
            guidance["evidence"] += 0.15
            comments.append("Thin content; add details.")
        return Critique(score, " ".join(comments), guidance)


class BrevityJudge:
    name: str = "brevity"

    async def critique(self, text: str, contract: Contract) -> Critique:
        words = len(re.findall(r"\b\w+\b", text))
        score = 0.9 if 80 <= words <= 1200 else 0.72
        return Critique(score, "", {"brevity": abs(words - 400) / 400})


class ConsistencyJudge:
    name: str = "consistency"

    async def critique(self, text: str, contract: Contract) -> Critique:
        headers = re.findall(r"^##\s+.+$", text, re.M)
        score = 0.85 if headers else 0.7
        return Critique(score, "", {"structure": 0.1 if not headers else 0.0})


# ---------------------------- Optional LLM judge -----------------------------


class LLMJudge:
    name: str = "llm-judge"

    def __init__(self, solver=None) -> None:
        self.solver = solver

    async def critique(self, text: str, contract: Contract, *, temperature: float = 0.0, seed=None) -> Critique:
        if not self.solver:
            return Critique(0.7, "LLM judge unavailable.", {})
        from .constants import LLM_JUDGE_PROMPT  # lazy import to avoid hard dep

        prompt = LLM_JUDGE_PROMPT.format(text=text, contract=str(asdict(contract)))
        try:
            res = await self.solver.solve(prompt, {"mode": "judge"})
            import json
            from .utils import first_json_object, safe_json_loads

            data = safe_json_loads(first_json_object(res.text) or "{}") or {}
            score = float(data.get("score", 0.72))
            comments = str(data.get("comments", ""))
            guidance = data.get("guidance", {}) if isinstance(data.get("guidance", {}), dict) else {}
            return Critique(score, comments, guidance)
        except Exception:
            return Critique(0.68, "LLM judge error.", {})


# Default registry with lightweight judges
JUDGES = JudgeRegistry()
JUDGES.register(StructureJudge())
JUDGES.register(BrevityJudge())
JUDGES.register(ConsistencyJudge())
