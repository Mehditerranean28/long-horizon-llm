"""
cli.py - CLI entrypoint & demo harness for Blackboard Orchestrator.

Responsibilities:
  - Provide lightweight mock/demo agents (EchoSolver, PromptLLM).
  - Parse CLI arguments for demo runs.
  - Construct Orchestrator + Memory + Planner/Solver wiring.
  - Print structured run results.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Dict

from .orchestrator import Orchestrator, OrchestratorConfig
from .memory import MemoryStore
from .core import Artifact, cognitive_query_analysis_protocol

_LOG = logging.getLogger("cli")



example_mission_plan = {
    "Example query": "Given an input string (s) and a pattern (p), implement wildcard pattern matching with support for '?' and '*' where: '?' Matches any single character, '*' Matches any sequence of characters (including the empty sequence). The matching should cover the entire input string (not partial). Example 1: Input: s = 'aa', p = 'a' Output: false Explanation: 'a' does not match the entire string 'aa'. Example 2: Input: s = 'aa', p = '*' Output: true Explanation: '*' matches any sequence. Example 3: Input: s = 'cb', p = '?a' Output: false Explanation: '?' matches 'c', but the second letter is 'a', which does not match 'b'. Constraints: 0 <= s.length, p.length <= 2000; s contains only lowercase English letters; p contains only lowercase English letters, ? or *",
    "Strategy": [
        {
            "O1": "Define the foundational constructs and rules for wildcard pattern matching",
            "queries": {
                "Q1": "What are the axiomatic constructs and universal principles that govern wildcard pattern matching with '?' and '*'?"
            },
            "tactics": [
                {
                    "t1": "Clearly define the behavior of '?' and '*' wildcards in different scenarios.",
                    "dependencies": [
                        "Reference documentation on wildcard matching principles"
                    ],
                    "expected_artifact": "Wildcard_Rules_Documentation.md",
                },
                {
                    "t2": "Define constraints for input strings and patterns, including length and character types.",
                    "dependencies": ["Wildcard_Rules_Documentation.md"],
                    "expected_artifact": "Constraints_Documentation.md",
                },
                {
                    "t3": "Document and categorize special scenarios and edge cases for pattern matching.",
                    "dependencies": ["Constraints_Documentation.md"],
                    "expected_artifact": "Edge_Cases_List.json",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O2": "Design an efficient algorithm for wildcard pattern matching",
            "queries": {
                "Q1": "How can dynamic programming be applied to solve the wildcard pattern matching problem?",
                "Q2": "What alternative algorithms can be considered, and how do they compare in terms of time and space complexity?",
            },
            "tactics": [
                {
                    "t1": "Implement a dynamic programming solution using a 2D boolean array.",
                    "dependencies": [
                        "datasets/sample_patterns.json",
                        "lib/numpy",
                        "lib/unittest",
                        "Edge_Cases_List.json",
                    ],
                    "expected_artifact": "DP_Solution_2D.py",
                },
                {
                    "t2": "Rework the DP solution to reduce space complexity using two 1D arrays.",
                    "dependencies": [
                        "DP_Solution_2D.py",
                        "Performance_Test_Framework.py",
                    ],
                    "expected_artifact": "Optimized_DP_Solution_1D.py",
                },
                {
                    "t3": "Develop and compare recursive and iterative solutions.",
                    "dependencies": [
                        "Optimized_DP_Solution_1D.py",
                        "datasets/benchmark_cases.json",
                        "Codebase for recursion and iteration benchmarks",
                    ],
                    "expected_artifact": "Recursive_vs_Iterative_Report.pdf",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O3": "Handle edge cases and optimize performance",
            "queries": {
                "Q1": "How can we efficiently handle patterns with multiple consecutive '*' characters?",
                "Q2": "What optimizations can be applied to improve performance for very long input strings or patterns?",
            },
            "tactics": [
                {
                    "t1": "Implement special logic for patterns with multiple consecutive '*' characters.",
                    "dependencies": ["Optimized_DP_Solution_1D.py"],
                    "expected_artifact": "Optimized_Star_Handling.py",
                },
                {
                    "t2": "Develop early termination conditions for impossible matches.",
                    "dependencies": ["Optimized_Star_Handling.py"],
                    "expected_artifact": "Early_Termination_Conditions.md",
                },
                {
                    "t3": "Improve performance for patterns with a high proportion of wildcards.",
                    "dependencies": [
                        "Early_Termination_Conditions.md",
                        "Benchmarking framework",
                    ],
                    "expected_artifact": "High_Wildcard_Optimization_Report.md",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O4": "Ensure correctness and robustness of the implementation",
            "queries": {
                "Q1": "How can we systematically test the wildcard pattern matching algorithm to ensure correctness?",
                "Q2": "What strategies can be employed to handle potential edge cases and ensure robustness?",
            },
            "tactics": [
                {
                    "t1": "Create a test suite covering various input scenarios.",
                    "dependencies": [
                        "High_Wildcard_Optimization_Report.md",
                        "datasets/test_scenarios.json",
                        "lib/pytest",
                    ],
                    "expected_artifact": "Test_Suite.py",
                },
                {
                    "t2": "Test the algorithm with large inputs approaching the 2000-character limit.",
                    "dependencies": ["Test_Suite.py", "Performance_Test_Framework.py"],
                    "expected_artifact": "Stress_Test_Report.md",
                },
                {
                    "t3": "Systematically validate the algorithm against known edge cases.",
                    "dependencies": ["Stress_Test_Report.md", "Edge_Cases_List.json"],
                    "expected_artifact": "Edge_Case_Validation_Results.json",
                },
            ],
            "tenant": [
                "E/// AI/ML Frameworks",
                "E/// R&D Knowledge Hub",
                "E/// Security Compliance",
            ],
        },
        {
            "O5": "Analyze and document the time and space complexity",
            "queries": {
                "Q1": "What is the time and space complexity of the implemented solution?",
                "Q2": "How does the complexity compare to alternative approaches, and what are the trade-offs?",
            },
            "tactics": [
                {
                    "t1": "Conduct a detailed analysis of the time and space complexity.",
                    "dependencies": ["Edge_Case_Validation_Results.json"],
                    "expected_artifact": "Complexity_Analysis.md",
                },
                {
                    "t2": "Compare the complexity with alternative solutions.",
                    "dependencies": [
                        "Complexity_Analysis.md",
                        "Alternative_Algorithms_Report.pdf",
                    ],
                    "expected_artifact": "Comparison_Report.md",
                },
                {
                    "t3": "Detail trade-offs between different approaches.",
                    "dependencies": ["Comparison_Report.md"],
                    "expected_artifact": "Trade_Off_Analysis.md",
                },
            ],
            "tenant": ["E/// AI/ML Frameworks", "E/// R&D Knowledge Hub"],
        },
        {
            "O6": "Consider future extensions and optimizations",
            "queries": {
                "Q1": "How can the current implementation be extended to support more complex pattern matching scenarios?",
                "Q2": "What potential optimizations or improvements could be made for specific use cases or larger scale applications?",
            },
            "tactics": [
                {
                    "t1": "Research extensions for case-insensitive matching and multi-character wildcards.",
                    "dependencies": [
                        "Wildcard_Rules_Documentation.md",
                        "Trade_Off_Analysis.md",
                    ],
                    "expected_artifact": "Extensions_Report.md",
                },
                {
                    "t2": "Explore parallelization strategies for large-scale pattern matching.",
                    "dependencies": [
                        "Extensions_Report.md",
                        "Parallel_Computing_Framework",
                    ],
                    "expected_artifact": "Parallelization_Strategy_Report.md",
                },
                {
                    "t3": "Research and prototype streaming algorithms for real-time pattern matching.",
                    "dependencies": [
                        "Parallelization_Strategy_Report.md",
                        "Large datasets for streaming scenarios",
                    ],
                    "expected_artifact": "Streaming_Algorithm_Prototype.py",
                },
            ],
            "tenant": [
                "E/// AI/ML Frameworks",
                "E/// R&D Knowledge Hub",
                "E/// Open APIs",
            ],
        },
    ],
}


# ============================================================
# Demo Agents
# ============================================================

class EchoSolver:
    """Trivial echo solver (for demo & testing)."""

    async def solve(self, task: str, context: Dict[str, str] | None = None) -> str:
        return f"[ECHO] {task}"


class PromptLLM:
    """Mock planner that returns a trivial plan in JSON."""

    async def complete(self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0) -> str:
        # Always return a trivial one-node atomic plan
        plan = {
            "triage": "atomic",
            "nodes": [],
            "stitch": {"sections": [{"title": "Answer", "requires": [], "must_contain": []}]},
        }
        return json.dumps(plan, ensure_ascii=False, indent=2)


# ============================================================
# Demo Run
# ============================================================

async def _demo() -> None:
    """Demo: dynamically compile a mission plan from the user query, then run the full pipeline."""

    p = argparse.ArgumentParser(description="Blackboard Orchestrator Demo")
    p.add_argument("query", nargs="*", help="User query text")
    p.add_argument("--mem", default=".blackboard_memory.json", help="Path to memory file")
    p.add_argument("--concurrent", type=int, default=int(os.getenv("LOCAL_CONCURRENT", "4")))
    p.add_argument("--rounds", type=int, default=int(os.getenv("MAX_ROUNDS", "2")))
    p.add_argument("--verbose", action="store_true", help="Enable debug logging")
    p.add_argument("--mock", action="store_true", help="Use mock LLM/planner")
    args = p.parse_args()

    if args.verbose:
        _LOG.setLevel(logging.DEBUG)

    query = " ".join(args.query).strip() or (
        "Design a secure CRUD API. Provide architecture, data model, and risks. "
        "Compare 2 frameworks and give a migration plan."
    )

    memory = MemoryStore(Path(args.mem))
    solver = EchoSolver()
    planner = PromptLLM()

    async def _on_start(n: str) -> None:
        _LOG.info("🚀 node start: %s", n)

    async def _on_node(a: Artifact) -> None:
        icon = "✅" if a.status == "ok" else "⚠️"
        _LOG.info("%s node complete: %s (status=%s, recs=%d)",
                  icon, a.node, a.status, len(a.recommendations))

    async def _on_pass(name: str, board: Dict[str, Artifact]) -> None:
        _LOG.info("📦 pass complete: %s (%d artifacts)", name, len(board))

    orch = Orchestrator(
        solver=solver,
        planner_llm=planner,
        memory=memory,
        mission_plan=example_mission_plan if args.mock else None,
        config=OrchestratorConfig(
            concurrent=args.concurrent,
            max_rounds=args.rounds,
            apply_node_recs=True,
            apply_global_recs=True,
            hedge_enable=True,
            hedge_delay_sec=0.5,
            enable_llm_judge=False,
            use_cqap=not args.mock,
        ),
        cqap=cognitive_query_analysis_protocol,
        on_node_start=_on_start,
        on_node_complete=_on_node,
        on_pass_complete=_on_pass,
    )

    result = await orch.run(query)

    # ========================================================
    # Print structured results
    # ========================================================
    print("\n===== 📝 FINAL (COHESIVE) =====\n")
    print(result["final"])

    print("\n===== 📋 PLAN =====")
    print(json.dumps(result["plan"], indent=2))

    print("\n===== 🧩 ARTIFACTS =====")
    for k, v in result["artifacts"].items():
        print(f"\n--- {k} ({v['status']}) ---")
        print(v["content"].strip()[:400] + ("..." if len(v["content"]) > 400 else ""))
        if v["recommendations"]:
            print("🔧 Recs:", ", ".join(v["recommendations"]))

    print("\n===== ⚖️ CONFLICTS =====")
    print(result["conflicts"] or "none")

    print("\n===== 🪄 RESOLUTION =====")
    print(result["resolution"] or "(none)")

    print("\n===== 🌐 GLOBAL RECOMMENDATIONS =====")
    for r in result["global_recommendations"]:
        print("-", r)

    print("\n===== 🏷 METADATA =====")
    meta = {"classification": result["classification"], "run_id": result["run_id"]}
    print(json.dumps(meta, indent=2))


# ============================================================
# Entrypoint
# ============================================================

_OCTO = r"""
	    ░░██╗  ░░░  ░░░  ██╗░░
	    ░██╔╝            ╚██╗░
	    ██╔╝░  ░░░  ░░░  ░╚██╗
	    ╚██╗░  ░░░  ░░░  ░██╔╝
	    ░╚██╗  ██╗  ██╗  ██╔╝░
	    ░░╚═╝  ╚═╝  ╚═╝  ╚═╝░░
        ░░██╗░░██╗░░██╗██╗░░██╗░░██╗░░
        ░██╔╝░██╔╝░██╔╝╚██╗░╚██╗░╚██╗░
        ██╔╝░██╔╝░██╔╝░░╚██╗░╚██╗░╚██╗
        ╚██╗░╚██╗░╚██╗░░██╔╝░██╔╝░██╔╝
        ░╚██╗░╚██╗░╚██╗██╔╝░██╔╝░██╔╝░
        ░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝░░╚═╝░░
"""


def main() -> None:
    try:
        asyncio.run(_demo())
    except KeyboardInterrupt:
        print("\n⏹️ Interrupted by user", flush=True)


if __name__ == "__main__":
    print(_OCTO)
    main()
