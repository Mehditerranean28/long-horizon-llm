# -*- coding: utf-8 -*-
"""CLI demo runner for the MVP orchestrator."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path

try:
    from .constants import DEFAULT_DEMO_QUERY
    from .config import OrchestratorConfig
    from .execution import Orchestrator
    from .memory import MemoryStore
    from .solver import build_default_solver_and_planner
except ImportError:  # pragma: no cover - fallback for script usage
    from constants import DEFAULT_DEMO_QUERY  # type: ignore
    from config import OrchestratorConfig  # type: ignore
    from execution import Orchestrator  # type: ignore
    from memory import MemoryStore  # type: ignore
    from solver import build_default_solver_and_planner  # type: ignore


async def main_async() -> None:
    p = argparse.ArgumentParser(description="Blackboard Orchestrator Demo (MVP)")
    p.add_argument("query", nargs="*", help="User query text")
    p.add_argument("--mem", default=".blackboard_memory.json", help="Path to memory file")
    p.add_argument("--concurrent", type=int, default=int(os.getenv("LOCAL_CONCURRENT", "4")))
    p.add_argument("--rounds", type=int, default=int(os.getenv("MAX_ROUNDS", "2")))
    p.add_argument("--verbose", action="store_true", help="Enable debug logging")
    p.add_argument("--mock", action="store_true", help="Force mock planner/solver")
    args = p.parse_args()

    query = " ".join(args.query).strip() or DEFAULT_DEMO_QUERY

    solver = planner = None
    if not args.mock:
        try:
            from ..adapters import build_pipeline_solver_and_planner  # optional external
            solver, planner = await build_pipeline_solver_and_planner(use_mock_llm=False)
        except Exception:
            pass
    if solver is None or planner is None:
        solver, planner = await build_default_solver_and_planner(use_mock_llm=True)

    memory = MemoryStore(Path(args.mem))
    config = OrchestratorConfig(concurrent=args.concurrent, max_rounds=args.rounds)

    orch = Orchestrator(solver=solver, planner_llm=planner, memory=memory, config=config)

    result = await orch.run(query)

    print("\n===== 📝 FINAL (COHESIVE) =====\n")
    print(result["final"])

    print("\n===== 🧩 ARTIFACTS =====")
    for k, v in result["artifacts"].items():
        print(f"\n--- {k} ({v['status']}) ---")
        body = v["content"].strip()
        print(body[:400] + ("..." if len(body) > 400 else ""))
        if v["recommendations"]:
            print("🔧 Recs:", ", ".join(v["recommendations"]))

    print("\n===== 🏷 METADATA =====")
    meta = {"classification": result["classification"], "run_id": result["run_id"]}
    print(json.dumps(meta, indent=2))


def main() -> None:
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\n⏹️ Interrupted by user", flush=True)


if __name__ == "__main__":
    main()
