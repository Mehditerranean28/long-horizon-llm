# -*- coding: utf-8 -*-
"""Core types, protocols, and exceptions for the Blackboard orchestrator."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Protocol


# ----------------------------- Exceptions ------------------------------------


class BlackboardError(Exception):
    """Base for orchestrator errors."""


class PlanningError(BlackboardError):
    pass


class QAError(BlackboardError):
    pass


class ExecutionError(BlackboardError):
    pass


class CompositionError(BlackboardError):
    pass


# ----------------------------- Protocols -------------------------------------


class BlackBoxSolver(Protocol):
    async def solve(
        self, task: str, context: Optional[Mapping[str, Any]] = None
    ) -> "SolverResult | str": ...


class PlannerLLM(Protocol):
    async def complete(
        self, prompt: str, *, temperature: float = 0.0, timeout: float = 60.0
    ) -> str: ...


class Judge(Protocol):
    name: str

    async def critique(self, text: str, contract: "Contract") -> "Critique": ...


# ------------------------------ Dataclasses ----------------------------------


@dataclass(slots=True)
class SolverResult:
    text: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None


@dataclass(slots=True)
class TestSpec:
    kind: str
    arg: str | int


@dataclass(slots=True)
class Contract:
    format: Dict[str, Any] = field(default_factory=dict)
    tests: List[TestSpec] = field(default_factory=list)


@dataclass(slots=True)
class Node:
    name: str
    tmpl: str
    deps: List[str] = field(default_factory=list)
    contract: Contract = field(default_factory=Contract)
    role: str = "adjunct"
    prompt_override: Optional[str] = None  # Optional template override


@dataclass(slots=True)
class Plan:
    nodes: List[Node]


@dataclass(slots=True)
class Patch:
    kind: str
    arg: Dict[str, Any]


@dataclass(slots=True)
class Issue:
    code: str
    details: Dict[str, Any] = field(default_factory=dict)
    suggested: List[Patch] = field(default_factory=list)


@dataclass(slots=True)
class QAResult:
    ok: bool
    issues: List[Issue] = field(default_factory=list)


@dataclass(slots=True)
class Critique:
    score: float
    comments: str
    guidance: Dict[str, float]


@dataclass(slots=True)
class Artifact:
    node: str
    content: str
    qa: QAResult
    critiques: List[Critique] = field(default_factory=list)
    status: str = "ok"
    recommendations: List[str] = field(default_factory=list)


@dataclass(slots=True)
class Classification:
    kind: str  # "Atomic" | "Hybrid" | "Composite"
    score: float
