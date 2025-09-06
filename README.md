# Reasoning Pipeline API
Building a custom, template-driven AI reasoning "black box" for structured problem-solving

A prompt-orchestrated LLM controller: reasoning happens through language outputs plus structured JSON, not learned recurrent state.

A policy-driven reasoning orchestrator that takes any query and runs it through a repeatable pipeline:

> Analyze → Plan. Use metadata (Goal/Priority/Precision/etc.) to produce a structured plan (frames → tactics with deps).

> Execute per tactic with template packs (your A* cognitive + R* reasoning + “subconscious”) to generate a candidate,

> Self-critique & improve in short loops,

> Judge & select the most useful artifacts,

> Synthesize & polish a final answer.

> Core design values: explainability (meta, plan, artifacts), quality gating (critics/judges), parallelism (layered topo), policy control (selectors & precision), and eventually auditability (provenance, budgets, logs).

## Repository layout

- `backend/`: FastAPI server, pipeline logic, and a lean `blackboard.py` module used in tests and production.
- `backend/blackboard_pkg/`: experimental, feature-rich blackboard engine kept for reference.
- `frontend/`: Next.js client that communicates with the backend API.


# Blackboard

It’s a self-contained “blackboard” orchestration engine for multi-step LLM work. You give it a query; it:

1. classifies the query’s complexity,
2. plans a DAG of “nodes” (subtasks with contracts/tests),
3. executes nodes concurrently with rate limits and token budgets, iteratively improving each node’s content via QA + “judges”,
4. detects/tries to resolve contradictions across nodes,
5. performs a global cohesion rewrite,
6. persists run metadata into a lightweight “kline” memory store with approximate embeddings, and
7. returns the composed final document plus diagnostics.

## Core plumbing

### Rate limiting & concurrency

* **GlobalRateLimiter**: bounds QPS (sliding window) and concurrent tasks (semaphore). `slot()` wraps any awaited call.
* Orchestrator adds another semaphore for node execution concurrency.

**Pros**

* Protects upstream LLMs/APIs and your runtime from thundering herds.
* QPS + concurrency dual control is pragmatic for bursty pipelines.

**Cons**

* Single global limiter; no per-service/priority lanes.
* No dynamic adaptation (e.g., backoff based on error rate/latency).

### Token budgeting & hedging

* Tracks tokens across the whole run and per node.
* “Hedged” LLM calls: launch a backup after a delay; take the first to complete.

**Pros**

* Prevents unbounded spend.
* Hedging mitigates tail latency.

**Cons**

* Budgeting is approximate (`len(text)//4` fallback).
* Hedging can increase load if timeouts are systemic (no adaptive cutover).
* `_reserve_tokens` exists but isn’t used to pre-admit/deny work.

### Auditing

* Emits JSON audit events to `_AUDIT`.
* Caps large payloads (`AUDIT_MAX_CHARS`) with a preview.

**Pros**

* Useful, structured trace of what happened without exploding logs.
* Truncation guards log ingestion costs.

**Cons**

* No PII scrubbing; content can be sensitive.
* No correlation fields beyond `run_id`.

---

## Memory & retrieval (“kline” store)

### MemoryStore

* JSON file on disk with sections for `judges` (weights), `patch_stats`, and `klines`.
* Kline entries store: nodes summary, ok\_nodes, global recs, classification, timestamps, and **embeddings**.

### Embeddings (dependency-free)

* `_hash_embed`: deterministic, token unigram+bigram feature hashing into a fixed dim, ±1 signs, L2-normalized.
* Supports quantization to int8 (`_quantize`/`_dequantize`).
* On read: `_ensure_entry_embedding` reconstructs from quantized vector or re-embeds from stored `query` if needed.
* `query_klines`: ANN via brute-force cosine over embeddings; prunes floats if quantized present; `prune_klines` trims oldest beyond cap.

**Pros**

* No external model or service; fully deterministic and fast.
* Quantization keeps persisted storage small; avoids FP drift.
* Fallbacks ensure older entries are still comparable.

**Cons**

* Hash embeddings are coarse; high collision rate, weaker semantic recall vs. modern embeddings.
* Linear scan (no index); may get slow as `KLINE_MAX_ENTRIES` grows.
* No TTL/decay beyond hard cap; no namespacing per domain/task.

### Neighbor summarization

* Aggregates shapes of prior plans, weak nodes, common recommendations, and class mix into a short hint block fed to planning.

**Pros**

* Simple relevance feedback that can meaningfully guide planning.
* Cheap to compute; human-interpretable heuristics.

**Cons**

* Heuristics only; no guarantee hints actually improve outcomes.
* Frequency counts can encode historical bias.

---

## Query understanding & planning

### Classification

* Heuristic score from cues (deliverable terms, dependency words, bullets, length, verb forms) → Atomic/Hybrid/Composite.

**Pros**

* Lightweight routing signal to size the plan.

**Cons**

* Brittle heuristics; domain- and style-dependent.

### Planner

* `PlannerLLM` asked to return strict JSON of nodes (name, prompt, deps, role, contract).
* Repairs: unique slugs, prune forward deps, cycle detection (clears deps in cycles).
* Enforces node count bounds based on classification; falls back to a single “answer” node if planning fails.

**Pros**

* Strong guardrails (strict JSON, repairs, fallback) keep the pipeline moving.
* Contracts per node make expectations explicit.

**Cons**

* No semantic validation of deps beyond topological sanity.
* If planner drifts, repair can over-truncate useful structure.

---

## Node execution & quality loop

### Contract & tests

* Each node has a `Contract` with a target markdown header and tests: `nonempty`, `regex`, `contains`, `word_count_min`, `header_present`.
* `run_tests` yields `Issue`s; `apply_patches` can auto-fix via header insertion, regex subs, or append/prepend text.

**Pros**

* Cheap, deterministic QA gate before model re-calls.
* Auto-patches reduce round-trips and nudge outputs toward shape.

**Cons**

* Tests are shallow: no semantic correctness or schema validation.
* Regex-based checks are fragile.

### Judges

* Built-in:

  * **StructureJudge**: header presence, thinness.
  * **ConsistencyJudge**: naive contradiction within a section via “X is \[not]”.
  * **BrevityJudge**: discourages overly long/short text.
* Optional **LLMJudge**: returns a score and guidance JSON.
* Judge weights are adapted over time (reinforcement around 0.7 baseline).

**Pros**

* Multiple cheap signals; reduces reliance on a single score.
* Weight adaptation lets the system “learn” which judges correlate with success.

**Cons**

* Consistency regex will generate false positives/negatives (“is” in other contexts).
* 0.7 baseline and increments are arbitrary; weight drift isn’t bounded beyond min/max.
* No gold truth; “min\_score” gate may filter good but unusual answers.

### Iterative improvement

* For each node:

  1. initial solve (optionally with dep context),
  2. QA; if OK, judge; if score high enough → accept,
  3. else: apply suggested patches, generate an improvement prompt with constraints, and re-solve (bounded by rounds and tokens).
  4. Per-node recommendations are requested (JSON list) and can be auto-applied by another model pass.

**Pros**

* Tight loop with concrete constraints tends to converge to better structure quickly.
* Patch-then-prompt reduces wasteful re-generation.

**Cons**

* Can still oscillate; guidance remains superficial.
* Applying model-generated “recommendations” risks factual drift.

---

## Cross-artifact coherence

### Contradiction detection & resolution

* Cross-node scan for “X is” vs “X is not” mentions → pair conflicts.
* If conflicts exist, ask the solver to produce a reconciliation block.

**Pros**

* Captures a common failure mode in multi-agent pipelines.
* Human-readable resolution section is auditable.

**Cons**

* Extremely naive NLP; misses nuanced conflicts and yields false alarms.
* Reconciliation isn’t fed back into nodes (it’s appended), so upstream inconsistency can remain.

### Composition & cohesion pass

* Compose all node sections (ensuring headers).
* Cohesion pass asks a model for `{"recommendations":[], "revised": "..."};` can auto-apply a rewrite over the whole document.

**Pros**

* Last-mile unification: headings, tense, glossary, coverage.
* Keeps per-node factual content while harmonizing style.

**Cons**

* Global rewrite can regress previously “OK” sections (no granular diff/guard).
* Size-based truncation only; no semantic partitioning to keep sections intact.

---

## Persistence & feedback

* After a run, it writes a kline entry: plan shape, which nodes were OK, global recs, classification, and a quantized query embedding; prunes oldest beyond cap.
* Judge weights are nudged based on scores.

**Pros**

* Builds a memory that can inform future plans (via neighbor hints).
* Keeps storage tiny with quantized embeddings.

**Cons**

* JSON file concurrency hazards if multiple processes write (no locking).
* No deduplication or per-task segmentation; topic bleed is possible.

---

## Demo scaffolding

* `EchoSolver` and `PromptLLM` provide a no-dependency demo path.
* CLI demo runs the full pipeline with logs and prints artifacts.

**Pros**

* Easy to test end-to-end without external services.

**Cons**

* Demo behavior isn’t representative of real LLM variability/latency.

---

# Overall assessment

**Functionally**, this is a robust, production-leaning orchestration layer that wraps an LLM with: planning, DAG execution, iterative QA/judging, cross-artifact reconciliation, and persistence with lightweight retrieval. It deliberately trades state-of-the-art semantics (e.g., dense embeddings, knowledge graphs) for **deterministic, dependency-free** primitives and strong operational guardrails (timeouts, budgets, rate limits, audits).

**Key strengths**

* Clear separation of concerns (plan → execute → QA → compose).
* Guardrails everywhere (budgets, retries/hedging, fallbacks, audits).
* Memory that’s cheap and usable for retrieval hints.
* Extensible: add judges, swap solver/planner.

**Key weaknesses**

* Heuristic QA and contradiction checks; shallow semantics.
* Retrieval quality limited by hash embeddings + linear scan.
* Risk of model drift in apply phases (node and global rewrites).
* File-based memory; no atomicity/locking; potential write races.
* Token budgeting is approximate; `_reserve_tokens` not integrated into admission control.

If you want, I can suggest targeted upgrades (e.g., pluggable vector store, safer contradiction detection, admission control using `_reserve_tokens`, per-service rate limiters), but functionally, that’s the system in a nutshell.
