"""Adapters bridging the pipeline orchestrator and blackboard solver.

The helpers in this module intentionally avoid clever abstractions.  Each
function validates inputs and keeps output predictable so higher layers can make
strict assumptions.  The goal is a minimal, well-commented surface area.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from blackboard import SolverResult
from pipeline import (
    Orchestrator as PipelineOrchestrator,
    OrchestratorConfig as PipelineConfig,
    UtilityJudge,
    LLM as PipelineLLM,
    MockLLM,
)

from constants import (
    DEFAULT_PIPELINE_GUIDELINES,
    MISSION_END_TOKEN,
    MISSION_PLANNER_PROMPT,
    MISSION_START_TOKEN,
    PLANNER_SYSTEM_PROMPT,
)

__all__ = ["PipelineSolver", "PlannerLLM", "build_pipeline_solver_and_planner"]

# --- mission embedding --------------------------------------------------------------------------

def _embed_mission(task: str, mission_obj: dict | None) -> str:
    """Embed a mission JSON blob inside the task string."""

    if not mission_obj:
        return task
    mission_json = json.dumps(mission_obj, ensure_ascii=False)
    return (
        f"{MISSION_START_TOKEN}\n{mission_json}\n{MISSION_END_TOKEN}\n\n{task}"
    )

# --- helpers ------------------------------------------------------------------------------------

def _first_json_object(text: str) -> Optional[str]:
    """Return the first JSON object found in ``text`` or ``None``."""

    start = text.find("{")
    if start < 0:
        return None
    depth, in_str, esc = 0, False, False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None

def _as_str_list(x: Any) -> List[str]:
    """Coerce ``x`` into a list of non-empty strings."""

    if isinstance(x, list):
        return [str(v).strip() for v in x if str(v).strip()]
    if isinstance(x, (str, int, float)):
        s = str(x).strip()
        return [s] if s else []
    return []

# --- logging ------------------------------------------------------------------------------------

from kern.src.kern.core import init_logging
try:
    init_logging()
except Exception as e:
    print(f"Failed to initialize production logging: {e}. Falling back to basic logging.")

log = logging.getLogger("adapters")
if not log.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    log.addHandler(h)
log.setLevel(os.getenv("LOG_LEVEL", "INFO"))

# --- Solver -------------------------------------------------------------------------------------

@dataclass(slots=True)
class PipelineSolver:
    """Light wrapper around the pipeline orchestrator to match solver API."""

    orch: PipelineOrchestrator
    planner: Optional["PlannerLLM"] = None
    timeout_sec: int = 120

    async def solve(self, task: str, context: Optional[Dict[str, Any]] = None) -> str | SolverResult:
        """Run the pipeline on ``task`` and return the final text."""

        if not task or not task.strip():
            raise ValueError("solve(): empty task")

        want_mission = True
        if context and "plan_mode" in context:
            want_mission = context.get("plan_mode") == "mission"

        enriched_task = task
        if want_mission and self.planner is not None:
            try:
                mission = await self.planner.plan(task, mode="mission")
            except Exception:
                mission = None
            enriched_task = _embed_mission(task, mission)

        cid = uuid.uuid4().hex[:8]
        log.info("PipelineSolver[%s]: run task len=%d", cid, len(enriched_task))
        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(
                self.orch.run(enriched_task), timeout=self.timeout_sec
            )
        except asyncio.TimeoutError as e:
            log.error(
                "PipelineSolver[%s]: timeout after %ss", cid, self.timeout_sec
            )
            raise RuntimeError(
                f"pipeline timeout after {self.timeout_sec}s"
            ) from e
        except Exception as e:
            log.exception("PipelineSolver[%s]: pipeline failure: %s", cid, e)
            raise RuntimeError(f"pipeline failure: {e}") from e

        final_field = result.get("final", "")
        if isinstance(final_field, SolverResult):
            final = (final_field.text or "").strip()
        elif isinstance(final_field, dict):
            final = str(
                final_field.get("text") or final_field.get("content") or ""
            ).strip()
        else:
            final = str(final_field or "").strip()
        if not final:
            raise RuntimeError("pipeline returned empty final")
        dt_ms = (time.perf_counter() - t0) * 1000.0
        log.info("PipelineSolver[%s]: ok in %.1fms", cid, dt_ms)
        return SolverResult(text=final, total_tokens=max(1, len(final) // 4))

# --- Planner ------------------------------------------------------------------------------------

def _heuristic_mission_from_query(query: str) -> Dict[str, Any]:
    """Fallback mission plan when the planner fails to produce one."""

    q = (query or "").strip()
    return {
        "query_context": q,
        "Strategy": [
            {
                "Objective": "Clarify intent, constraints, and success criteria",
                "queries": {
                    "Q1": "What are the hard requirements and definition of done?",
                    "Q2": "What context, assumptions, and existing systems impact the solution?"
                },
                "tactics": [
                    {"t1": "Draft a concise problem brief (scope, constraints, risks).",
                     "dependencies": [], "expected_artifact": "Problem_Brief.md"},
                    {"t2": "Define SLIs/SLOs and validation criteria.",
                     "dependencies": ["Problem_Brief.md"], "expected_artifact": "Success_Criteria.md"}
                ],
                "tenant": []
            },
            {
                "Objective": "Design and select an approach with explicit trade-offs",
                "queries": {"Q1": "What viable architectures exist?","Q2": "Key trade-offs vs cost/risk/operability?"},
                "tactics": [
                    {"t1": "Propose a primary design (components, interfaces, data).",
                     "dependencies": ["Success_Criteria.md"], "expected_artifact": "Design_Proposal.md"},
                    {"t2": "Compare 2–3 alternatives and justify selection.",
                     "dependencies": ["Design_Proposal.md"], "expected_artifact": "Tradeoffs.md"}
                ],
                "tenant": []
            },
            {
                "Objective": "Validate and prepare delivery",
                "queries": {"Q1": "How will we test, rollout, observe, and roll back safely?"},
                "tactics": [
                    {"t1": "Write a test plan and rollout/canary/rollback playbook.",
                     "dependencies": ["Tradeoffs.md"], "expected_artifact": "Test_and_Rollback_Plan.md"},
                    {"t2": "Synthesize a final deliverable tying everything together.",
                     "dependencies": ["Design_Proposal.md","Test_and_Rollback_Plan.md"], "expected_artifact": "Final_Report.md"}
                ],
                "tenant": []
            }
        ]
    }

def _normalize_mission(obj: Dict[str, Any], query: str) -> Dict[str, Any]:
    """Normalize mission JSON to the expected shape."""

    if not isinstance(obj, dict):
        return _heuristic_mission_from_query(query)

    strat_in = obj.get("Strategy")
    if not isinstance(strat_in, list) or not strat_in:
        return _heuristic_mission_from_query(query)

    out_strat: List[Dict[str, Any]] = []
    for s in strat_in:
        if not isinstance(s, dict):
            continue
        objective = s.get("Objective") or s.get("objective") or s.get("O1") or s.get("o1") or ""
        objective = str(objective).strip() or "Objective"

        q_raw = s.get("queries")
        queries: Dict[str, str] = {}
        if isinstance(q_raw, dict):
            i = 1
            for _, v in q_raw.items():
                val = str(v).strip()
                if val:
                    queries[f"Q{i}"] = val
                    i += 1
        elif isinstance(q_raw, list):
            for i, v in enumerate(q_raw, start=1):
                val = str(v).strip()
                if val:
                    queries[f"Q{i}"] = val
        elif isinstance(q_raw, (str, int, float)):
            val = str(q_raw).strip()
            if val:
                queries["Q1"] = val

        t_raw = s.get("tactics") or []
        tactics: List[Dict[str, Any]] = []
        for i, t in enumerate(t_raw, start=1):
            if not isinstance(t, dict):
                desc = str(t).strip()
                if desc:
                    tactics.append({"t"+str(i): desc, "dependencies": [], "expected_artifact": f"O{i}_T{i}_Artifact"})
                continue
            desc_key = next((k for k in t.keys() if isinstance(k, str) and k.lower().startswith("t")), None)
            if desc_key:
                desc = str(t.get(desc_key, "")).strip()
                deps = _as_str_list(t.get("dependencies"))
                art  = (str(t.get("expected_artifact") or "").strip()
                        or f"{desc_key.upper()}_Artifact")
                tactics.append({desc_key: desc, "dependencies": deps, "expected_artifact": art})
                continue
            tid = str(t.get("id") or "").strip().lower()
            if not tid.startswith("t"):
                tid = f"t{i}"
            desc = str(t.get("description") or "").strip() or f"Tactic {tid.upper()}"
            deps = _as_str_list(t.get("dependencies"))
            art  = (str(t.get("expected_artifact") or "").strip()
                    or f"O{i}_{tid.upper()}_Artifact")
            tactics.append({tid: desc, "dependencies": deps, "expected_artifact": art})

        out_strat.append({
            "Objective": objective,
            "queries": queries,
            "tactics": tactics,
            "tenant": _as_str_list(s.get("tenant"))
        })

    return {"query_context": obj.get("query_context") or query, "Strategy": out_strat}

@dataclass(slots=True)
class PlannerLLM:
    """
    Uses a pipeline-compatible LLM to perform triage and decomposition.
    - 'dag' mode: generic planning JSON (self-normalized)
    - 'mission' mode: returns a mission JSON normalized to blackboard's expected shape
    """
    llm: PipelineLLM
    timeout_sec: int = 45

    async def _ask(self, content: str, temperature: float = 0.0) -> str:
        """Call the underlying LLM with a firm timeout."""

        return await asyncio.wait_for(
            self.llm.complete(content, temperature=temperature, timeout=self.timeout_sec),
            timeout=self.timeout_sec + 5,
        )

    def _normalize_dag(self, obj: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize a planner DAG structure into canonical form."""

        triage = str(obj.get("triage", "")).strip().lower()
        if triage not in {"atomic", "composite", "hybrid"}:
            triage = "atomic"

        nodes: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for n in (obj.get("nodes") or []):
            try:
                nid = re.sub(r"[^a-z0-9\-]+", "-", str(n.get("id", "")).strip().lower()).strip("-")
                text = str(n.get("text", "")).strip()
                deps = [str(d).strip().lower() for d in (n.get("deps") or []) if str(d).strip()]
                if not nid or not text:
                    continue
                if nid in seen:
                    nid = f"{nid}-{uuid.uuid4().hex[:4]}"
                seen.add(nid)
                deps = [d for d in deps if d and d != nid]
                nodes.append({"id": nid, "text": text, "deps": deps})
            except Exception:
                continue

        sections_in = (((obj.get("stitch") or {}).get("sections")) or [])
        sections: List[Dict[str, Any]] = []
        for s in sections_in:
            try:
                title = str(s.get("title", "")).strip() or "Answer"
                req = [str(r).strip().lower() for r in (s.get("requires") or []) if str(r).strip()]
                mc  = [str(m).strip() for m in (s.get("must_contain") or []) if str(m).strip()]
                sections.append({"title": title, "requires": req, "must_contain": mc})
            except Exception:
                continue

        if triage == "atomic":
            sections = sections or [{"title": "Answer", "requires": [], "must_contain": []}]
            nodes = []
        else:
            if not nodes:
                nodes = [{"id": "main", "text": "Produce a complete answer to the query.", "deps": []}]
                sections = sections or [{"title": "Answer", "requires": ["main"], "must_contain": []}]

        return {"triage": triage, "nodes": nodes, "stitch": {"sections": sections}}

    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0) -> str:
        """Proxy to the underlying LLM with bounded timeout."""

        return await asyncio.wait_for(
            self.llm.complete(
                prompt, temperature=temperature, timeout=min(timeout, self.timeout_sec)
            ),
            timeout=(min(timeout, self.timeout_sec) + 5),
        )

    async def plan(self, query: str, mode: str = "dag") -> Dict[str, Any]:
        """Plan ``query`` into a DAG or mission-plan."""

        prompt = (
            MISSION_PLANNER_PROMPT if mode == "mission" else PLANNER_SYSTEM_PROMPT
        ) + "\n\nQUERY:\n" + query
        raw = await self._ask(prompt, temperature=0.0)

        try:
            payload = _first_json_object(raw) or raw
            obj = json.loads(payload)
        except Exception:
            obj = {}

        if mode == "mission":
            if not isinstance(obj, dict) or not (obj.get("Strategy") or []):
                return _heuristic_mission_from_query(query)
            return _normalize_mission(obj, query)
        else:
            return self._normalize_dag(obj)

# --- Factory ------------------------------------------------------------------------------------

async def build_pipeline_solver_and_planner(
    *,
    guidelines: Optional[str] = None,
    use_mock_llm: bool = False,
    llm: Optional[PipelineLLM] = None,
) -> Tuple[PipelineSolver, PlannerLLM]:
    """
    Construct a (solver, planner) pair.
    - solver: delegates sub-tasks to a PipelineOrchestrator (black-box)
    - planner: uses the same LLM to produce triage + DAG or normalized mission plans
    """
    judges = [UtilityJudge()]
    cfg = PipelineConfig()

    # choose the LLM once, reuse for both orchestrator and planner
    if llm is not None:
        llm_for_pipeline: PipelineLLM = llm
    elif use_mock_llm:
        llm_for_pipeline = MockLLM()
    else:
        from pipeline import OpenAILLM
        llm_for_pipeline = OpenAILLM()

    orch = PipelineOrchestrator(
        llm=llm_for_pipeline,
        guidelines=guidelines or DEFAULT_PIPELINE_GUIDELINES,
        judges=judges,
        config=cfg,
    )

    planner = PlannerLLM(llm=llm_for_pipeline)
    solver = PipelineSolver(orch=orch, planner=planner)
    return solver, planner
