# -*- coding: utf-8 -*-
"""Execution engine: DAG orchestration, hedged LLM calls, cohesion, beliefs."""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import asdict
from typing import Any, Dict, List, Mapping, Optional, Tuple

try:
    from .config import (
        FORECAST_ALPHA,
        FORECAST_BUFFER,
        FORECAST_DEFAULT_TOKENS,
        OrchestratorConfig,
    )
    from .constants import (
        CLAIMS_EXTRACT_PROMPT,
        COHESION_APPLY_PROMPT,
        COHESION_PROMPT,
        DENSE_FINAL_ANSWER_PROMPT,
        NODE_APPLY_PROMPT,
        NODE_RECOMMEND_PROMPT,
    )
    from .judges import JUDGES
    from .memory import MemoryStore
    from .planning import classify_query_llm, make_plan
    from .bb_types import (
        Artifact,
        BlackBoxSolver,
        Contract,
        Critique,
        Node,
        Plan,
        QAResult,
    )
    from .utils import (
        AUDIT,
        GLOBAL_LIMITER,
        LOG,
        approx_tokens,
        clip_chars,
        first_json_object,
        fmt,
        run_tests,
        safe_json_loads,
        sanitize_text,
    )
except ImportError:  # pragma: no cover - fallback for script usage
    from config import (
        FORECAST_ALPHA,
        FORECAST_BUFFER,
        FORECAST_DEFAULT_TOKENS,
        OrchestratorConfig,
    )  # type: ignore
    from constants import (
        CLAIMS_EXTRACT_PROMPT,
        COHESION_APPLY_PROMPT,
        COHESION_PROMPT,
        DENSE_FINAL_ANSWER_PROMPT,
        NODE_APPLY_PROMPT,
        NODE_RECOMMEND_PROMPT,
    )  # type: ignore
    from judges import JUDGES  # type: ignore
    from memory import MemoryStore  # type: ignore
    from planning import classify_query_llm, make_plan  # type: ignore
    from bb_types import (
        Artifact,
        BlackBoxSolver,
        Contract,
        Critique,
        Node,
        Plan,
        QAResult,
    )  # type: ignore
    from utils import (
        AUDIT,
        GLOBAL_LIMITER,
        LOG,
        approx_tokens,
        clip_chars,
        first_json_object,
        fmt,
        run_tests,
        safe_json_loads,
        sanitize_text,
    )  # type: ignore


class Orchestrator:
    """Coordinates plan creation, node execution (hedged + sampled), QA, and synthesis."""

    def __init__(
        self,
        *,
        solver: BlackBoxSolver,
        planner_llm,
        memory: MemoryStore,
        config: OrchestratorConfig = OrchestratorConfig(),
        judges=None,
        mission_plan: Optional[Mapping[str, Any]] = None,
        cqap: Optional[Mapping[str, Any]] = None,
        on_node_start=None,
        on_node_complete=None,
        on_pass_complete=None,
    ) -> None:
        self.solver = solver
        self.planner_llm = planner_llm
        self.memory = memory
        self.config = config
        self.judges = judges or JUDGES.get_all()
        self.mission_plan = mission_plan
        self.cqap = cqap
        self.on_node_start = on_node_start
        self.on_node_complete = on_node_complete
        self.on_pass_complete = on_pass_complete

        self._tokens_used = 0
        self._token_lock = asyncio.Lock()
        self.run_id: Optional[str] = None
        self._score_history: List[float] = []
        self._last_energy: Optional[float] = None
        self._current_sig: Optional[str] = None
        self._current_query: str = ""
        self._last_artifacts: Dict[str, Artifact] = {}
        LOG.debug("Orchestrator initialized with config %s", config)

    # ------------------------------- Utilities --------------------------------

    def _sig(self, query: str, cls_kind: str = "Composite") -> str:
        import hashlib, re

        key = cls_kind + ":" + re.sub(r"\s+", " ", query.strip().lower())[:512]
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:16]

    async def _reserve_tokens(self, n: int) -> bool:
        async with self._token_lock:
            ok = self._tokens_used + n <= self.config.max_tokens_per_run
            if ok:
                self._tokens_used += n
            LOG.debug("Reserve %d tokens -> %s (used=%d)", n, ok, self._tokens_used)
            return ok

    def _add_tokens(self, used: int) -> None:
        self._tokens_used += used
        LOG.debug("Add tokens %d total=%d", used, self._tokens_used)

    def forecast_tokens(self, remaining_nodes: int) -> int:
        rates = [approx_tokens(art.content) for art in self._last_artifacts.values()][-12:]
        if not rates:
            LOG.debug("No history for forecast; using default")
            return FORECAST_DEFAULT_TOKENS
        s = rates[0]
        for r in rates[1:]:
            s = FORECAST_ALPHA * r + (1 - FORECAST_ALPHA) * s
        forecast = int(s * remaining_nodes * FORECAST_BUFFER)
        LOG.debug("Forecast tokens for %d nodes -> %d", remaining_nodes, forecast)
        return forecast

    # ------------------------------- Hedging ----------------------------------

    async def _hedged_solve(self, task: str, context: Mapping[str, Any], timeout: float) -> str:
        """Dual-shot hedged call; returns winning text or raises on both failure."""
        LOG.debug("Hedged solve start mode=%s", context.get("mode"))
        async def _call():
            async with GLOBAL_LIMITER.slot():
                res = await asyncio.wait_for(self.solver.solve(task, context), timeout=timeout)
                return res.text if hasattr(res, "text") else str(res)

        primary = asyncio.create_task(_call())

        async def _delayed_call():
            await asyncio.sleep(self.config.hedge_delay_sec)
            return await _call()

        backup = asyncio.create_task(_delayed_call())

        start = time.time()
        done, pending = await asyncio.wait({primary, backup}, return_when=asyncio.FIRST_COMPLETED)
        winner = next(iter(done))
        result = await winner
        for p in pending:
            p.cancel()
        LOG.debug("Hedged solve finished in %.2fs", time.time() - start)
        return result

    # ---------------------------- Judges orchestration ------------------------

    async def _run_judges(self, text: str, contract: Contract) -> List[Critique]:
        LOG.debug("Running %d judges", len(self.judges))
        async def _one(j) -> Critique:
            return await j.critique(text, contract)

        results = await asyncio.gather(*[_one(j) for j in self.judges], return_exceptions=True)
        crits = [r for r in results if isinstance(r, Critique)]
        for j, c in zip(self.judges, crits):
            delta = (c.score - 0.7) * 0.12
            LOG.info("Judge %s score=%.2f", j.name, c.score)
            self.memory.bump_judge(j.name, delta)
        self.memory.save()
        return crits

    # ------------------------------- Node exec --------------------------------

    def _build_context(self, node: Node, blackboard: Dict[str, Artifact], token_budget: int = 1000) -> str:
        LOG.debug("Building context for node %s", node.name)
        parts: List[str] = []
        used = 0
        for d in node.deps:
            a = blackboard.get(d)
            if not a:
                continue
            head = f"### {d}\n"
            body = sanitize_text(a.content).strip()
            room = token_budget - used
            if room <= 0:
                break
            max_chars = room * 4
            snippet = body[:max_chars]
            parts.append(head + snippet)
            used += len(snippet) // 4
        return ("## Context (deps)\n" + "\n\n".join(parts)).strip() if parts else ""

    def _deps_bullets(self, context_text: str, node: Node, blackboard: Dict[str, Artifact]) -> str:
        if context_text:
            _hdr = re.compile(r"^###\s+(.+?)\s*$", re.M)
            bullets: List[str] = []
            last = None
            for m in _hdr.finditer(context_text):
                if last:
                    body = context_text[last.end() : m.start()].strip().replace("\n", " ")[:150]
                    bullets.append(f"- {last.group(1)}: {body}")
                last = m
            if last:
                body = context_text[last.end() :].strip().replace("\n", " ")[:150]
                bullets.append(f"- {last.group(1)}: {body}")
            if bullets:
                return "\n".join(bullets)
        previews = []
        for d in node.deps:
            a = blackboard.get(d)
            if a:
                previews.append(f"- {d}: {a.content[:150].replace(chr(10), ' ')}")
        return "\n".join(previews) if previews else ""

    async def _recommend_node(self, node: Node, content: str) -> Tuple[str, List[str], QAResult, List[Critique]]:
        LOG.debug("Recommendation step for node %s", node.name)
        prompt = fmt(NODE_RECOMMEND_PROMPT, section=node.contract.format.get("markdown_section"), content=content)
        rec_json = await self._hedged_solve(prompt, {"mode": "node_recommend", "node": node.name}, timeout=12.0)
        data = safe_json_loads(first_json_object(rec_json) or "{}")
        recommendations = [str(x) for x in data.get("recommendations", [])][:10]
        LOG.info("Node %s got %d recommendations", node.name, len(recommendations))
        if recommendations and self.config.apply_node_recs:
            apply_prompt = fmt(NODE_APPLY_PROMPT, recs="\n- ".join(recommendations), content=content)
            revised = await self._hedged_solve(apply_prompt, {"mode": "node_apply", "node": node.name}, timeout=25.0)
            qa = run_tests(revised, node.contract)
            critiques = await self._run_judges(revised, node.contract)
            return revised, recommendations, qa, critiques
        qa = run_tests(content, node.contract)
        critiques = await self._run_judges(content, node.contract)
        return content, recommendations, qa, critiques

    async def _execute_node(self, node: Node, blackboard: Dict[str, Artifact]) -> Artifact:
        LOG.info("Executing node %s", node.name)
        if self.on_node_start:
            try:
                await self.on_node_start(node.name)
            except Exception as e:
                LOG.error("on_node_start hook failed: %s", e)

        # Create prompt
        context_txt = self._build_context(node, blackboard, token_budget=min(1000, self.config.kline_hint_tokens))
        deps_preview = self._deps_bullets(context_txt, node, blackboard)
        template = node.prompt_override or ""
        if not template:
            from .constants import TEMPLATE_REGISTRY
            template = TEMPLATE_REGISTRY.get(node.tmpl, TEMPLATE_REGISTRY["GENERIC"])
        section = node.contract.format.get("markdown_section") or node.name.title()
        base = fmt(template, section=section, deps_bullets=deps_preview, query=self._current_query)
        full_prompt = clip_chars(((context_txt + "\n\n") if context_txt else "") + base, self.config.max_tokens_per_node)

        # Generate content
        text = await self._hedged_solve(full_prompt, {"mode": "node", "node": node.name}, timeout=self.config.node_timeout_sec)

        # QA + judges + recs
        content, recs, qa, critiques = await self._recommend_node(node, text)
        status = "ok" if qa.ok else "needs_more_depth"

        art = Artifact(node=node.name, content=content, qa=qa, critiques=critiques, status=status, recommendations=recs)

        if self.on_node_complete:
            try:
                await self.on_node_complete(art)
            except Exception as e:
                LOG.error("on_node_complete hook failed: %s", e)
        LOG.info("Node %s completed with status=%s", node.name, status)
        return art

    async def adaptive_run_dag(self, nodes: List[Node]) -> Dict[str, Artifact]:
        LOG.info("Starting adaptive DAG run with %d nodes", len(nodes))
        name_to = {n.name: n for n in nodes}
        indeg: Dict[str, int] = {n.name: 0 for n in nodes}
        succ: Dict[str, List[str]] = {n.name: [] for n in nodes}
        for n in nodes:
            for d in n.deps:
                if d in name_to:
                    indeg[n.name] += 1
                    succ[d].append(n.name)

        blackboard: Dict[str, Artifact] = {}
        in_flight: Dict[str, asyncio.Task[Artifact]] = {}

        async def _start(n: Node):
            in_flight[n.name] = asyncio.create_task(self._execute_node(n, blackboard))

        for n in nodes:
            if indeg[n.name] == 0:
                await _start(n)

        while in_flight:
            done, _ = await asyncio.wait(in_flight.values(), return_when=asyncio.FIRST_COMPLETED)
            for t in done:
                node_name = next((k for k, v in in_flight.items() if v is t), None)
                if node_name:
                    in_flight.pop(node_name, None)
                try:
                    art = await t
                except Exception as e:
                    LOG.error("Node %s failed: %s", node_name, e)
                    art = Artifact(
                        node=node_name or "unknown",
                        content=f"(no content)\n\nError: {e}",
                        qa=QAResult(ok=False, issues=[]),
                        critiques=[],
                        status="failed",
                    )
                blackboard[art.node] = art
                LOG.info("Node %s finished", art.node)
                for m in succ.get(art.node, []):
                    indeg[m] -= 1
                    if indeg[m] == 0 and m not in in_flight and m not in blackboard:
                        await _start(name_to[m])

        return blackboard

    # ---------------------------- Beliefs extraction --------------------------

    async def _extract_and_store_claims(self, *, node: Node, content: str) -> None:
        LOG.debug("Extracting claims for node %s", node.name)
        base = fmt(CLAIMS_EXTRACT_PROMPT, content=sanitize_text(content))
        raw = await self.planner_llm.complete("SYSTEM: EXTRACT_CLAIMS\nReturn ONLY JSON.\n" + base, temperature=0.0, timeout=25.0)
        data = safe_json_loads(first_json_object(raw) or "{}") or {}
        claims = data.get("claims", [])
        if claims and self._current_sig and self.run_id:
            self.memory.add_beliefs(sig=self._current_sig, node=node.name, run_id=self.run_id, claims=claims)
            LOG.info("Stored %d claims for node %s", len(claims), node.name)

    # ---------------------------- Composition & cohesion ----------------------

    @staticmethod
    def _strip_internal_markers(text: str) -> str:
        CTXT_BLOCK = re.compile(r"(?ms)^\s*##\s*Context\s*\(deps\)\s*.*?(?=^\s*##\s|\Z)")
        CONS_BLOCK = re.compile(r"(?ms)\n+Constraints:\n(?:\s*-\s.*\n)+")
        t = sanitize_text(text)
        t = CTXT_BLOCK.sub("", t)
        t = CONS_BLOCK.sub("\n", t)
        t = re.sub(r"\n{3,}", "\n\n", t).strip()
        return t

    @staticmethod
    def _compose(plan: Plan, blackboard: Dict[str, Artifact], include_resolution: str = "") -> str:
        parts: List[str] = []
        for n in plan.nodes:
            art = blackboard.get(n.name)
            sec = n.contract.format.get("markdown_section") or n.name.title()
            cleaned = Orchestrator._strip_internal_markers(art.content if art else "(no content)")
            if f"## {sec}" not in cleaned:
                cleaned = f"## {sec}\n\n{cleaned.strip()}"
            parts.append(cleaned)
        if include_resolution:
            parts.append(include_resolution)
        return "\n\n---\n\n".join(parts).strip() + "\n"

    async def _cohesion_pass(
        self, query: str, composed: str, conflicts: List[Tuple[str, str, str]], resolution: str
    ) -> Tuple[List[str], str]:
        LOG.debug("Cohesion pass with %d conflicts", len(conflicts))
        prompt = fmt(COHESION_PROMPT, query=query, conflicts=json.dumps(conflicts), resolution=resolution, document=composed)
        res_json = await self._hedged_solve(prompt, {"mode": "cohesion"}, timeout=50.0)
        data = safe_json_loads(first_json_object(res_json) or "{}")
        recs = data.get("recommendations", [])[:14]
        revised = data.get("revised", composed)
        if self.config.apply_global_recs and recs:
            apply_prompt = fmt(COHESION_APPLY_PROMPT, recs="\n- ".join(recs), document=revised)
            revised = await self._hedged_solve(apply_prompt, {"mode": "cohesion_apply"}, timeout=50.0)
        LOG.info("Cohesion produced %d recommendations", len(recs))
        return recs, revised

    # --------------------------------- Run ------------------------------------

    async def run(self, query: str) -> Dict[str, Any]:
        LOG.info("Run starting for query: %s", query)
        self._tokens_used = 0
        run_id = uuid.uuid4().hex[:8]
        self.run_id = run_id
        AUDIT.info(json.dumps({"orchestrator_start": {"run_id": run_id, "query": query}}, ensure_ascii=False))

        cls = await classify_query_llm(query, self.planner_llm)
        LOG.info("Query classified kind=%s score=%.3f", cls.kind, cls.score)
        sig = self._sig(query, cls.kind)
        self._current_sig = sig
        self._current_query = query

        plan = await make_plan(self.planner_llm, query, cls)
        LOG.info("Plan generated with %d nodes", len(plan.nodes))

        monitor = asyncio.create_task(self._monitor_homeostat())
        try:
            blackboard = await self.adaptive_run_dag(plan.nodes)
            self._last_artifacts = blackboard

            for n in plan.nodes:
                a = blackboard.get(n.name)
                if a:
                    await self._extract_and_store_claims(node=n, content=a.content)

            bconf = self.memory.detect_belief_conflicts(scope_sig=sig)
            resolution = ""
            if bconf:
                self.memory.penalize_kline(sig)
                resolution = "## Contradiction Resolution\n\n- Conflicts detected and recorded."

            composed = self._compose(plan, blackboard, resolution)
            global_recs, final_cohesive = await self._cohesion_pass(query, composed, [], resolution)

            if self.config.dense_final_enable:
                enriched = await self._hedged_solve(fmt(DENSE_FINAL_ANSWER_PROMPT, document=final_cohesive), {"mode": "dense_final"}, timeout=50.0)
                final_cohesive = enriched or final_cohesive

            try:
                obs = {"run_id": run_id, "classification": asdict(cls), "global_recs": global_recs, "energy": self._last_energy}
                raw = await self.planner_llm.complete("Update self model:\n" + json.dumps(obs, ensure_ascii=False), temperature=0.0, timeout=15.0)
                model = safe_json_loads(first_json_object(raw) or "{}") or {}
                if model:
                    self.memory.store_self_model(sig, model)
            except Exception as e:
                LOG.error("Self-model update failed: %s", e)

            self.memory.upsert_kline(sig, {"global_recs": global_recs[:10], "run": run_id}, query=query, classification={"kind": cls.kind, "score": cls.score})

            result = {
                "classification": {"kind": cls.kind, "score": cls.score},
                "artifacts": {k: {"content": v.content, "status": v.status, "recommendations": v.recommendations} for k, v in blackboard.items()},
                "belief_conflicts": bconf,
                "resolution": resolution,
                "final_pre_cohesion": composed,
                "final": final_cohesive,
                "global_recommendations": global_recs,
                "run_id": run_id,
            }
            LOG.info("Run %s completed", run_id)
            return result
        finally:
            monitor.cancel()

    # ------------------------------- Homeostat --------------------------------

    async def _monitor_homeostat(self) -> None:
        """Simple adaptive loop to adjust rounds/concurrency based on quality."""
        try:
            while True:
                await asyncio.sleep(1.2)
                scores = [c.score for a in self._last_artifacts.values() for c in a.critiques]
                avg_score = sum(scores) / len(scores) if scores else 0.0
                failures = sum(1 for a in self._last_artifacts.values() if a.status != "ok")
                LOG.debug("Homeostat avg_score=%.2f failures=%d", avg_score, failures)
                if failures > 3:
                    self.config.max_rounds += 1
                    LOG.info("Increasing max_rounds to %d", self.config.max_rounds)
                elif avg_score > 0.92:
                    self.config.max_rounds = max(1, self.config.max_rounds - 1)
                    LOG.info("Decreasing max_rounds to %d", self.config.max_rounds)
        except asyncio.CancelledError:
            return
