"""
orchestrator.py - Central engine for Blackboard orchestration.

Responsibilities:
  - Judge system (structure, consistency, brevity, optional LLM).
  - Cross-artifact contradiction detection and conflict resolution.
  - Orchestrator class: classification, planning, DAG execution, monitoring.
  - Audit, stability heuristics, and runtime metadata.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple

from blackboard.core import (
    Artifact,
    Contract,
    Node,
    Plan,
    SolverResult,
    BlackboardError,
    PlanningError,
    QAError,
    CompositionError,
    Patch,
    classify_query,
    make_plan,
    build_plan_from_cqap,
    build_plan_from_mission,
    _parse_contract,
    _validate_and_repair_plan,
    cognitive_query_analysis_protocol,
)
from .memory import MemoryStore

_LOG = logging.getLogger("orchestrator")


# ============================================================
# Judges
# ============================================================

@dataclass(slots=True)
class StructureJudge:
    name: str = "structure"

    async def critique(self, art: Artifact) -> "Critique":
        if not art.content.strip():
            return Critique(score=0.0, comments="empty artifact")
        if len(art.content.split()) < 5:
            return Critique(score=0.3, comments="too short")
        return Critique(score=0.9, comments="structure ok")


@dataclass(slots=True)
class ConsistencyJudge:
    name: str = "consistency"

    async def critique(self, art: Artifact) -> "Critique":
        if "error" in art.content.lower():
            return Critique(score=0.4, comments="contains error markers")
        return Critique(score=0.85, comments="consistent")


@dataclass(slots=True)
class BrevityJudge:
    name: str = "brevity"

    async def critique(self, art: Artifact) -> "Critique":
        if len(art.content.split()) > 400:
            return Critique(score=0.5, comments="too verbose")
        return Critique(score=0.9, comments="concise")


@dataclass(slots=True)
class Critique:
    score: float
    comments: str
    guidance: Dict[str, float] = None


@dataclass(slots=True)
class LLMJudge:
    """Optional judge that calls an LLM to assess artifacts."""

    name: str = "llm-judge"
    llm: Any = None  # PipelineLLM or similar

    async def critique(self, art: Artifact) -> Critique:
        if not self.llm:
            return Critique(score=0.7, comments="(no LLM provided)")
        try:
            q = f"Critique this output:\n\n{art.content}"
            resp = await self.llm.complete(q, temperature=0.0, timeout=30.0)
            return Critique(score=0.8, comments=resp.strip())
        except Exception as e:
            _LOG.warning("LLMJudge failed: %s", e)
            return Critique(score=0.7, comments="(llm-judge error)")


class JudgeRegistry:
    def __init__(self) -> None:
        self._judges: List[Any] = []

    def register(self, judge: Any) -> None:
        self._judges.append(judge)

    def get_all(self) -> List[Any]:
        return list(self._judges)


JUDGES = JudgeRegistry()
JUDGES.register(StructureJudge())
JUDGES.register(ConsistencyJudge())
JUDGES.register(BrevityJudge())


# ============================================================
# Cross-artifact contradiction detection
# ============================================================

def detect_cross_contradictions(artifacts: Sequence[Artifact]) -> List[Tuple[str, str, str]]:
    """Naive contradiction detection based on 'is' vs 'is not' phrases."""
    is_not = re.compile(r"\b([\w\- ]+?)\s+is\s+not\b", re.I)
    is_yes = re.compile(r"\b([\w\- ]+?)\s+is\b", re.I)
    facts_yes, facts_no = {}, {}
    for a in artifacts:
        for m in is_yes.finditer(a.content):
            subj = m.group(1).strip().lower()
            facts_yes[subj] = a.node
        for m in is_not.finditer(a.content):
            subj = m.group(1).strip().lower()
            facts_no[subj] = a.node
    out: List[Tuple[str, str, str]] = []
    for subj, n1 in facts_yes.items():
        if subj in facts_no:
            out.append((subj, n1, facts_no[subj]))
    return out


async def draft_resolution(solver: Any, conflicts: List[Tuple[str, str, str]]) -> str:
    """Use solver to draft conflict resolution report."""
    if not conflicts:
        return ""
    lines: List[str] = []
    for subj, n1, n2 in conflicts:
        q = f"Resolve contradiction: {subj!r} was {n1} vs {n2}"
        text = await solver.solve(q)
        lines.append(f"### {subj.title()}"); lines.append(text.strip()); lines.append("")
    return "\n".join(lines).strip()


# ============================================================
# Orchestrator
# ============================================================

@dataclass(slots=True)
class OrchestratorConfig:
    concurrent: int = int(os.getenv("LOCAL_CONCURRENT", "6"))
    max_rounds: int = int(os.getenv("MAX_ROUNDS", "3"))
    apply_node_recs: bool = True
    apply_global_recs: bool = True
    hedge_enable: bool = True
    hedge_delay_sec: float = 0.5
    enable_llm_judge: bool = False
    use_cqap: bool = False
    kline_enable: bool = True
    kline_top_k: int = 5
    kline_min_sim: float = 0.3
    kline_hint_tokens: int = 128


class Orchestrator:
    """Blackboard Orchestrator - coordinates planning, DAG execution, and synthesis."""

    def __init__(
        self,
        solver: Any,
        planner_llm: Any,
        memory: MemoryStore,
        *,
        mission_plan: Optional[Dict[str, Any]] = None,
        config: Optional[OrchestratorConfig] = None,
        cqap: Optional[Dict[str, Any]] = None,
        on_node_start=None,
        on_node_complete=None,
        on_pass_complete=None,
    ) -> None:
        self.solver = solver
        self.planner_llm = planner_llm
        self.memory = memory
        self.mission_plan = mission_plan
        self.config = config or OrchestratorConfig()
        self.cqap = cqap
        self.on_node_start = on_node_start
        self.on_node_complete = on_node_complete
        self.on_pass_complete = on_pass_complete
        self._tokens_used = 0
        self.run_id = uuid.uuid4().hex[:8]

    # ------------------------------
    # Planning
    # ------------------------------

    async def _generate_plan(self, query: str, cls: Any) -> Plan:
        hints = ""
        if self.config.kline_enable:
            try:
                nbrs = self.memory.query_klines(
                    query, top_k=self.config.kline_top_k, min_sim=self.config.kline_min_sim
                )
                hints_txt = self.memory.summarize_neighbors(
                    nbrs, char_budget=self.config.kline_hint_tokens * 4
                )
                if hints_txt:
                    hints = "\n\n" + hints_txt
            except Exception as e:
                _LOG.warning("kline hint retrieval failed: %s", e)
        try:
            if self.mission_plan:
                plan = build_plan_from_mission(self.mission_plan, query=query)
            elif self.config.use_cqap and self.cqap:
                plan = build_plan_from_cqap(query, self.cqap, cls)
            else:
                plan = await make_plan(self.planner_llm, query + hints, cls)
        except PlanningError:
            _LOG.warning("planner failed; fallback to atomic plan")
            plan = Plan(nodes=[
                Node(
                    name="answer",
                    prompt=query,
                    deps=[],
                    contract=_parse_contract({"format":{"markdown_section":"Answer"}}, "Answer"),
                    role="backbone",
                )
            ])
        _LOG.info("[run=%s] plan: %d nodes", self.run_id, len(plan.nodes))
        return plan

    # ------------------------------
    # Execution
    # ------------------------------

    async def _execute_dag_passes(self, plan: Plan) -> Dict[str, Artifact]:
        backbone_nodes, adjunct_nodes = self._partition_backbone(plan)
        bb_board = await self.adaptive_run_dag(backbone_nodes)
        if self.on_pass_complete:
            await self.on_pass_complete("backbone", bb_board)
        ad_board = await self.adaptive_run_dag(adjunct_nodes) if adjunct_nodes else {}
        if self.on_pass_complete:
            await self.on_pass_complete("adjuncts", ad_board)
        return {**bb_board, **ad_board}

    async def run(self, query: str) -> Dict[str, Any]:
        cls = classify_query(query)
        _LOG.info("[run=%s] classification: %s (score=%.3f)", self.run_id, cls.kind, cls.score)

        plan = await self._generate_plan(query, cls)
        blackboard = await self._execute_dag_passes(plan)

        conflicts = detect_cross_contradictions(list(blackboard.values()))
        resolution = await draft_resolution(self.solver, conflicts) if conflicts else ""

        return {
            "classification": {"kind": cls.kind, "score": cls.score},
            "plan": [
                {
                    "name": n.name,
                    "deps": n.deps,
                    "role": n.role,
                    "section": n.contract.format.get("markdown_section"),
                }
                for n in plan.nodes
            ],
            "artifacts": {k: v.to_dict() for k, v in blackboard.items()},
            "conflicts": conflicts,
            "resolution": resolution,
            "final": blackboard.get("final-answer").content if "final-answer" in blackboard else "",
            "global_recommendations": [],
            "run_id": self.run_id,
        }

    # ------------------------------
    # Helpers
    # ------------------------------

    def _partition_backbone(self, plan: Plan) -> Tuple[List[Node], List[Node]]:
        bb, ad = [], []
        for n in plan.nodes:
            (bb if n.role == "backbone" else ad).append(n)
        return bb, ad

    async def adaptive_run_dag(self, nodes: List[Node]) -> Dict[str, Artifact]:
        board: Dict[str, Artifact] = {}
        for n in nodes:
            if self.on_node_start:
                await self.on_node_start(n.name)
            try:
                result = await self.solver.solve(n.prompt)
                art = Artifact(
                    node=n.name,
                    content=result if isinstance(result, str) else str(result),
                )
                art.status = "ok"
            except Exception as e:
                art = Artifact(node=n.name, content=f"(error: {e})", status="error")
            board[n.name] = art
            if self.on_node_complete:
                await self.on_node_complete(art)
        return board
