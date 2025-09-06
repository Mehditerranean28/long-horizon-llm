# Patch Notes (Quality, Robustness, Metadata)

This patch focuses on: hardened JSON handling, refundable hedging, async-safe memory with batched I/O, reduced clustering overhead, structured decider gating (no substring early exits), richer prompts and mission metadata, and audit redaction.

## Highlights

1. **Structured Decider**  
   - `DECIDER_PROMPT` added; `blackboard_cycle` now respects `{ready, final_message_key}` JSON.
   - Removes brittle `"final answer"` substring early exit.

2. **Agent Generation & Control**  
   - Richer `AGENT_GENERATION_PROMPT` (description, keywords, capabilities, llm_hints).
   - `CONTROL_UNIT_PROMPT` returns `{chosen_agents, rationale}`.
   - `GENERIC_AGENT_PROMPT` clarifies IO contract (markdown **or** JSON with `output`).

3. **JSON Hardening**  
   - Agents: robust extraction via `_first_json_object` + safe parse; no `.get()` on `None`.

4. **Memory Store Reliability & Perf**  
   - Thread-safe saves; batched flush via `MEMSTORE_SAVE_EVERY`.
   - Deferred clustering via `KLINE_CLUSTER_EVERY` to avoid O(N²) on every upsert.

5. **Refundable Hedge**  
   - Reserve tokens only when backup executes; refund if backup wins with empty text.

6. **Audit Redaction**  
   - Basic masking for secrets, bearer tokens, and emails in audit logs.

7. **Verbose Mission Schema**  
   - `MISSION_PLAN_SCHEMA_HINT` for maximal metadata generation when used by planners.

8. **LLM Candidates**  
   - Centralized `LLM_CANDIDATES`; assigned if missing during agent generation.

## Env Toggles

```
KLINE_CLUSTER_EVERY=12       # cluster every N upserts
MEMSTORE_SAVE_EVERY=6        # flush memstore every N mutations
AUDIT_REDACT=1               # redact secrets in audit logs
```

## Backwards Compatibility

- Existing planner output still accepted. New metadata fields are optional.
- Agent outputs can remain plain markdown; JSON with `"output"` is supported.

## Known Limitations (for follow-ups)

- Concurrency changes by the Homeostat affect future task scheduling, not currently in-flight tasks.
- Contradiction detection retains naive heuristics (kept for scope); consider entailment models.

---

This patch is self-contained and does not introduce external dependencies.
