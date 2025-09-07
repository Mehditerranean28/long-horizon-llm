# -*- coding: utf-8 -*-
"""CLI demo runner for the MVP orchestrator."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path

from backend.kern.src.kern.core import init_logging
from config import OrchestratorConfig
from execution import Orchestrator
from memory import MemoryStore
from solver import build_default_solver_and_planner
from utils import LOG


async def main_async() -> None:
    p = argparse.ArgumentParser(description="Blackboard Orchestrator Demo (MVP)")
    p.add_argument("query", nargs="*", help="User query text")
    p.add_argument("--mem", default=".blackboard_memory.json", help="Path to memory file")
    p.add_argument("--concurrent", type=int, default=int(os.getenv("LOCAL_CONCURRENT", "4")))
    p.add_argument("--rounds", type=int, default=int(os.getenv("MAX_ROUNDS", "2")))
    p.add_argument("--verbose", action="store_true", help="Enable debug logging")
    p.add_argument("--mock", action="store_true", help="Force mock planner/solver")
    args = p.parse_args()

    init_logging()
    LOG.debug("Parsed arguments: %s", args)
    if args.verbose:
        LOG.setLevel(logging.DEBUG)
        LOG.debug("Verbose logging enabled")
    LOG.info("Using memory file %s", args.mem)

    query = " ".join(args.query).strip() or (
        "Design a secure CRUD API. Provide architecture, data model, and risks. "
        "Compare 2 frameworks and give a migration plan."
    )

    solver = planner = None
    LOG.info("Building solver and planner (mock=%s)", args.mock)
    if not args.mock:
        try:
            from ..adapters import build_pipeline_solver_and_planner  # optional external
            solver, planner = await build_pipeline_solver_and_planner(use_mock_llm=False)
            LOG.info("Loaded pipeline solver/planner")
        except Exception as e:
            LOG.error("Falling back to mock solver/planner: %s", e)
    if solver is None or planner is None:
        solver, planner = await build_default_solver_and_planner(use_mock_llm=True)
        LOG.info("Using default mock solver/planner")

    memory = MemoryStore(Path(args.mem))
    config = OrchestratorConfig(concurrent=args.concurrent, max_rounds=args.rounds)

    orch = Orchestrator(solver=solver, planner_llm=planner, memory=memory, config=config)

    LOG.info("Starting orchestrator run")
    result = await orch.run(query)
    LOG.info("Orchestrator run completed")

    LOG.info("===== 📝 FINAL (COHESIVE) =====\n%s", result["final"])

    LOG.info("===== 🧩 ARTIFACTS =====")
    for k, v in result["artifacts"].items():
        LOG.info("--- %s (%s) ---", k, v["status"])
        body = v["content"].strip()
        LOG.info("%s", body[:400] + ("..." if len(body) > 400 else ""))
        if v["recommendations"]:
            LOG.info("🔧 Recs: %s", ", ".join(v["recommendations"]))

    LOG.info("===== 🏷 METADATA =====")
    meta = {"classification": result["classification"], "run_id": result["run_id"]}
    LOG.info(json.dumps(meta, indent=2))


def main() -> None:
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        LOG.warning("Interrupted by user")


if __name__ == "__main__":
    main()
