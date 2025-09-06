"""FastAPI server for the reasoning pipeline.

This module exposes a HTTP interface around the orchestrator.  The code favours
clarity and defensive checks over cleverness; every external boundary validates
inputs and fails closed.  The module is intentionally lean so each component is
auditable and easily testable.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import os
import re
import sys
import time
import uuid
import json
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Type, Callable, Awaitable

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, ValidationError, constr, field_validator


from pipeline import (
    LLM,
    MockLLM,
    Orchestrator,
    OrchestratorConfig,
    UtilityJudge,
    A_TEMPLATES,
    R_TEMPLATES,
    parse_json,
)
from adapters import build_pipeline_solver_and_planner

from backend.kern.src.kern.core import init_logging

try:
    init_logging()
except Exception as e:
    print(f"Failed to initialize production logging: {e}. Falling back to basic logging.")


log = logging.getLogger("server")
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    )
    log.addHandler(handler)
log.setLevel(os.getenv("LOG_LEVEL", "INFO"))


APP_NAME = os.getenv("APP_NAME", "Reasoning Pipeline API")
APP_VERSION = os.getenv("APP_VERSION", "1.0.0")
MAX_WORKERS = int(os.getenv("MAX_WORKERS", "4"))
REQUEST_TIMEOUT_SEC = float(os.getenv("REQUEST_TIMEOUT_SEC", "300"))
GUIDELINES = os.getenv(
    "GUIDELINES",
    "Be terse, precise, and fully actionable. Prefer explicit base conditions, tests, and complexity.",
)

CORS_ALLOW_ORIGINS = [
    o
    for o in os.getenv(
        "CORS_ALLOW_ORIGINS", "http://localhost,http://localhost:3000"
    ).split(",")
    if o
]

# Toggle streaming endpoint exposure; disabling avoids dangling routes when
# event-stream consumers are unwanted or unsupported in a deployment.
ENABLE_STREAM_ENDPOINT = bool(int(os.getenv("ENABLE_STREAM_ENDPOINT", "1")))


LLM_CLASS_PATH = os.getenv("LLM_CLASS", "").strip()
try:
    LLM_INIT_KW: Dict[str, Any] = parse_json(os.getenv("LLM_INIT_KW", "{}"), fallback={})
except Exception as e:
    log.critical("Invalid LLM_INIT_KW: %s", e)
    raise

class RunRequest(BaseModel):
    """Request payload for ``/v1/run``."""

    query: constr(min_length=1)

    @field_validator("query")
    @classmethod
    def _clean(cls, v: str) -> str:
        if len(v) > 4096:
            raise ValueError("Query too long; max 4096 chars")
        if re.search(r"[<>\r\t]", v):
            raise ValueError("Invalid control characters in query")
        return v.strip()

class RunResponse(BaseModel):
    """Response body for ``/v1/run``."""

    request_id: str
    duration_ms: int
    meta: Dict[str, Any]
    plan: Any
    artifacts: List[str]
    selected: List[str]
    final: str

class HealthResponse(BaseModel):
    """Simple health status."""

    status: str = "ok"
    version: str = APP_VERSION

class TemplatesResponse(BaseModel):
    """Available cognitive (A) and reasoning (R) templates."""

    A: List[str]
    A_details: Dict[str, Dict[str, Any]]
    R: List[str]
    R_details: Dict[str, Dict[str, Any]]

class ErrorResponse(BaseModel):
    """Standardised error payload."""

    detail: str
    correlation_id: str

class GenAIRequest(BaseModel):
    """Request payload for ``/v1/genai``."""

    prompt: constr(min_length=1)
    temperature: float = Field(0.0, ge=0.0, le=2.0)
    timeout: float = Field(30.0, ge=0.5, le=120.0)

class GenAIResponse(BaseModel):
    """Response body for ``/v1/genai``."""

    request_id: str
    duration_ms: int
    output: str


def _ensure_request_id(x_request_id: Optional[str] = Header(default=None)) -> str:
    """Return a request id, generating one when absent."""

    return x_request_id or str(uuid.uuid4())

def _load_llm_class(path: str) -> Optional[Type[Any]]:
    """Import and return a class from ``module:Class`` notation.

    Returns ``None`` when the environment variable is unset or malformed.  Any
    import error is logged and results in ``None`` so the caller can fall back to
    a default implementation.
    """

    if not path or ":" not in path:
        return None
    mod_name, class_name = path.split(":", 1)
    try:
        mod = importlib.import_module(mod_name)
        return getattr(mod, class_name)
    except Exception as e:  # pragma: no cover - best effort logging
        log.error("Failed to import LLM class '%s': %s", path, e)
        return None

def _instantiate_llm() -> LLM:
    """Instantiate the configured LLM or a ``MockLLM`` as fallback."""

    cls = _load_llm_class(LLM_CLASS_PATH)
    if cls is None:
        log.info("Using default MockLLM (set LLM_CLASS to override)")
        return MockLLM()
    try:
        obj = cls(**LLM_INIT_KW)  # type: ignore[call-arg]
        if not hasattr(obj, "complete"):
            raise TypeError("Provided LLM lacks 'complete' method")
        return obj  # type: ignore[return-value]
    except Exception as e:  # pragma: no cover - requires misconfiguration
        log.critical("LLM instantiation failed for %s: %s", cls, e)
        raise

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    responses={500: {"model": ErrorResponse}},
)

ORCH: Optional[Orchestrator] = None

@app.middleware("http")
async def request_context_mw(request: Request, call_next: Callable[[Request], Awaitable[Response]]):
    """Attach a request id and log timing for every request."""

    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    start = time.perf_counter()
    try:
        response: Response = await call_next(request)
    finally:
        dur_ms = int((time.perf_counter() - start) * 1000)
        log.info(
            "HTTP %s %s %dms rid=%s", request.method, request.url.path, dur_ms, request_id
        )
    response.headers["x-request-id"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialise and tear down the global orchestrator."""

    global ORCH
    llm = _instantiate_llm()

    mode = os.getenv("ORCH_MODE", "blackboard").lower()

    if mode == "pipeline":
        cfg = OrchestratorConfig()
        judges = [UtilityJudge()]
        ORCH = Orchestrator(
            llm=llm,
            guidelines=GUIDELINES,
            judges=judges,
            config=cfg,
        )
        log.info("Deterministic Pipeline orchestrator active")
    else:
        from blackboard import Orchestrator as BBOrchestrator, OrchestratorConfig as BBConfig, MemoryStore
        from pathlib import Path
        mem_path = Path(os.getenv("MEM_PATH", ".sovereign_memory.json"))
        solver, planner = await build_pipeline_solver_and_planner(llm=llm)
        ORCH = BBOrchestrator(
            solver=solver,
            planner_llm=planner,
            memory=MemoryStore(mem_path),
            config=BBConfig(concurrent=MAX_WORKERS, max_rounds=int(os.getenv("ROUNDS","3"))),
        )
        log.info("Blackboard orchestrator active")

    yield
    ORCH = None
    log.info("Orchestrator shutdown complete")

app.router.lifespan_context = lifespan


@app.exception_handler(ValidationError)
async def pydantic_exc_handler(request: Request, exc: ValidationError):
    """Return a structured error for Pydantic validation issues."""

    cid = request.headers.get("x-request-id") or str(uuid.uuid4())
    return JSONResponse(
        status_code=422,
        content=ErrorResponse(detail=str(exc), correlation_id=cid).model_dump(),
    )

@app.exception_handler(Exception)
async def global_exc_handler(request: Request, exc: Exception):
    """Catch-all exception handler returning a generic error payload."""

    cid = request.headers.get("x-request-id") or str(uuid.uuid4())
    log.error("Unhandled error rid=%s: %s", cid, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(detail=str(exc), correlation_id=cid).model_dump(),
    )


@app.get("/", include_in_schema=False)
async def root() -> Dict[str, Any]:
    """Basic service metadata."""

    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "docs": "/docs",
        "endpoints": [
            "/health",
            "/v1/templates",
            "/v1/run",
            *(["/v1/run/stream"] if ENABLE_STREAM_ENDPOINT else []),
            "/v1/genai",
        ],
    }

@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Liveness probe."""

    return HealthResponse(status="ok", version=APP_VERSION)

@app.get("/v1/templates", response_model=TemplatesResponse)
async def templates() -> TemplatesResponse:
    """Expose available templates to clients."""

    return TemplatesResponse(
        A=list(A_TEMPLATES.keys()),
        A_details=A_TEMPLATES,
        R=list(R_TEMPLATES.keys()),
        R_details=R_TEMPLATES,
    )

@app.post("/v1/run", response_model=RunResponse)
async def run_endpoint(
    req: RunRequest,
    x_request_id: str = Depends(_ensure_request_id),
) -> RunResponse:
    """Execute the reasoning pipeline for a query."""

    if ORCH is None:
        raise HTTPException(status_code=503, detail="Orchestrator not ready")
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(ORCH.run(req.query), timeout=REQUEST_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        log.error("rid=%s timed out after %.1fs", x_request_id, REQUEST_TIMEOUT_SEC)
        raise HTTPException(status_code=504, detail=f"Timeout after {REQUEST_TIMEOUT_SEC:.0f}s")
    except Exception as e:
        log.exception("rid=%s pipeline failure: %s", x_request_id, e)
        raise HTTPException(status_code=500, detail=f"Pipeline failure: {e}")
    dt_ms = int((time.perf_counter() - t0) * 1000)

    final_text = result.get("final_cohesive") or result.get("final", "")

    return RunResponse(
        request_id=x_request_id,
        duration_ms=dt_ms,
        meta=result.get("meta", {}),
        plan=result.get("plan", {}),
        artifacts=list(result.get("artifacts", [])),
        selected=list(result.get("selected", [])),
        final=final_text,
    )


@app.post("/v1/run/stream")
async def run_stream_endpoint(
    req: RunRequest,
    x_request_id: str = Depends(_ensure_request_id),
):
    """Stream milestone events for a query as newline-delimited JSON."""
    if not ENABLE_STREAM_ENDPOINT:
        raise HTTPException(status_code=404, detail="Streaming disabled")

    if ORCH is None:
        raise HTTPException(status_code=503, detail="Orchestrator not ready")

    async def event_gen():
        try:
            async for event in ORCH.run_stream(req.query):
                yield json.dumps(event) + "\n"
        except Exception as e:
            log.exception("rid=%s stream failure: %s", x_request_id, e)
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"

    return StreamingResponse(event_gen(), media_type="application/x-ndjson")

@app.post("/v1/genai", response_model=GenAIResponse)
async def genai_endpoint(
    req: GenAIRequest,
    x_request_id: str = Depends(_ensure_request_id),
) -> GenAIResponse:
    """Direct access to the underlying LLM/planner."""

    if ORCH is None:
        raise HTTPException(status_code=503, detail="Orchestrator not ready")
    t0 = time.perf_counter()
    try:
        if hasattr(ORCH, "planner_llm"):
            out = await asyncio.wait_for(
                ORCH.planner_llm.complete(
                    req.prompt, temperature=req.temperature, timeout=req.timeout
                ),
                timeout=req.timeout + 2.0,
            )
        else:
            out = await asyncio.wait_for(
                ORCH.solver.solve(req.prompt),
                timeout=req.timeout + 2.0,
            )
            out = out.text if hasattr(out, "text") else str(out)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail=f"LLM timeout after {req.timeout:.1f}s")
    except Exception as e:
        log.exception("rid=%s genai failure: %s", x_request_id, e)
        raise HTTPException(status_code=500, detail=f"LLM failure: {e}")
    dt_ms = int((time.perf_counter() - t0) * 1000)
    return GenAIResponse(request_id=x_request_id, duration_ms=dt_ms, output=out or "")

_ASCII = r"""
        ███████╗ ██████╗ ██╗   ██╗███████╗██████╗ ███████╗██╗ ██████╗ ███╗   ██╗
        ██╔════╝██╔═══██╗██║   ██║██╔════╝██╔══██╗██╔════╝██║██╔═══  ╗████╗  ██║
        ███████╗██║   ██║██║   ██║█████╗  ██████╔╝█████╗  ██║██║     ║██╔██╗ ██║
        ╚════██║██║   ██║ █║   █ ║██╔══╝  ██╔══██╗██╔══╝  ██║██║ ████║██║╚██╗██║
        ███████║╚██████╔╝╚ ████ ╔╝███████╗██║  ██║███████╗██║╚██████╔╝██║ ╚████║
        ╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
"""


def main() -> None:
    import uvicorn
    print(_ASCII)
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload_ = bool(int(os.getenv("RELOAD", "0")))
    uvicorn.run("server:app", host=host, port=port, reload=reload_)

if __name__ == "__main__":
    main()
