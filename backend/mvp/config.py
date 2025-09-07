# -*- coding: utf-8 -*-
"""Configuration and tunables for the Blackboard orchestrator."""

from __future__ import annotations

import os
from dataclasses import dataclass


# Environment-driven defaults
GLOBAL_MAX_CONCURRENT = int(os.getenv("GLOBAL_MAX_CONCURRENT", "32"))
GLOBAL_QPS = int(os.getenv("GLOBAL_QPS", "16"))
GLOBAL_BURST_WINDOW_SEC = float(os.getenv("GLOBAL_BURST_WINDOW", "0.5"))

KLINE_EMBED_DIM = int(os.getenv("KLINE_EMBED_DIM", "512"))
KLINE_MAX_ENTRIES = int(os.getenv("KLINE_MAX_ENTRIES", "5000"))
AUDIT_MAX_CHARS = int(os.getenv("AUDIT_MAX_CHARS", "16384"))

# Tuning
CLUSTER_MIN_SIM = 0.4
CLUSTER_LINK_WEIGHT = 0.9
FORECAST_DEFAULT_TOKENS = 800
FORECAST_ALPHA = 0.25
FORECAST_BUFFER = 1.3

# Hedging
HEDGE_TOKEN_RESERVE = 200


@dataclass(slots=True)
class OrchestratorConfig:
    # Concurrency & limits
    concurrent: int = 8
    max_rounds: int = 4
    max_tokens_per_node: int = 4000
    max_tokens_per_run: int = 20000

    # Quality/QA
    min_score: float = 0.7
    qa_hard_fail: bool = False
    enable_llm_judge: bool = False

    # Timeouts
    node_timeout_sec: float = 80.0
    judge_timeout_sec: float = 10.0

    # Feature toggles
    apply_node_recs: bool = True
    apply_global_recs: bool = True
    hedge_enable: bool = True
    hedge_delay_sec: float = 0.8
    kline_enable: bool = True
    kline_top_k: int = 4
    kline_min_sim: float = 0.25
    kline_hint_tokens: int = 500
    use_cqap: bool = True
    use_llm_cqap: bool = True
    plan_from_meta: bool = True
    use_llm_classifier: bool = True
    ensemble_mode: bool = True
    forecast_enable: bool = True
    dense_final_enable: bool = True
    consistency_sampling_enable: bool = True
    consistency_samples: int = 4
    agreement_threshold: float = 0.6
