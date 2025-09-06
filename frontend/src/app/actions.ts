// action.ts
"use server";

import type { CognitiveQueryAnalysisProtocol } from '@/types/cognitive-protocol';
import type { EvidenceSegment, EvidenceReference } from '@/types';
import type {
  AnswerQuestionInput, AnswerQuestionOutput,
  GenerateClarificationInput, GenerateClarificationOutput,
  DeepResearchInput, DeepResearchOutput
} from '@/types/action-io-types';
import { v4 as uuidv4 } from 'uuid';
import {
  createTask,
  waitForTaskCompletion,
  runPipeline,
  runPipelineStream,
  type TaskCreatePayload,
  type TaskStatusResponse,
} from '@/api/client'; // Assumed robust backend client
import fs from 'fs';
import path from 'path';
import { getExampleMissionPlanAsDocument, transformMissionPlanToFlowData } from '@/lib/mission-plan-parser';
import { buildAttachmentPayload } from '@/utils'; // Assumed robust utility for attachments
import { queryBrowserLLM } from '@/lib/browser-llm';
import { MOCK_CONFIG } from '@config/mock-config';
import { API_BASE_URL } from '@/constants/api';
import { logMetric, logError, logVerbose, logWarn } from '@/monitoring/logger';

const CALL_TO_PROTO_BRAIN: Record<string, string> = {
  'cognitive-analysis': 'InitialProtoBrain',
  'clarification-generation': 'ClarifyProtoBrain',
  'deep-research': 'AdvancedProtoBrain',
  'simple-reflection': 'InitialProtoBrain',
};

// --- Configuration Constants ---
// Define environment-dependent configuration in a centralized manner.
// Use consistent naming for clarity (e.g., `_URL` suffix).
const LOCAL_LLM_API_URL = process.env.NEXT_PUBLIC_LOCAL_LLM_URL || 'http://localhost:11434';
const BACKEND_API_URL = API_BASE_URL; // normalized base for Express proxy

// Determine if we should use the backend API based on its presence.
// This is a global switch for the entire action module.
const USE_BACKEND_API = !!BACKEND_API_URL;
// Flag controlling whether pipeline milestones are streamed or fetched in a
// single response.  Defaults to streaming unless explicitly disabled.
const USE_PIPELINE_STREAMING =
  process.env.NEXT_PUBLIC_USE_PIPELINE_STREAMING !== '0';


// Cache backend health after the first check
let backendReachable: boolean | null = null;

/**
 * Checks whether the configured backend API is reachable.
 * The result is cached to avoid repeated network calls.
 */
async function ensureBackendConnectivity(): Promise<boolean> {
  if (!USE_BACKEND_API) {
    backendReachable = false;
    return false;
  }
  if (backendReachable !== null) {
    return backendReachable;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BACKEND_API_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    backendReachable = res.ok;
  } catch {
    backendReachable = false;
  }
  return backendReachable;
}

// --- Custom Error Definitions ---
// Define specific error types for better error handling and debugging.
class ActionError extends Error {
  constructor(message: string, public code: string = 'GENERIC_ACTION_ERROR', public details?: any) {
    super(message);
    this.name = 'ActionError';
  }
}

class BackendCommunicationError extends ActionError {
  constructor(message: string, public status: number, public backendResponse?: any) {
    super(message, 'BACKEND_COMM_ERROR', { status, backendResponse });
    this.name = 'BackendCommunicationError';
  }
}

class LocalLLMError extends ActionError {
  constructor(message: string, public llmStatus?: number) {
    super(message, 'LOCAL_LLM_ERROR', { llmStatus });
    this.name = 'LocalLLMError';
  }
}

// --- Local LLM Proxy Function ---
// Encapsulates the logic for querying a local LLM, including robust error handling.
async function queryLocalLLM(
  query: string,
  model: string,
  baseUrl?: string,
): Promise<string> {
  const targetUrl = baseUrl || LOCAL_LLM_API_URL;
  if (!targetUrl) {
    throw new LocalLLMError('Local LLM URL is not configured.');
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${targetUrl}/v1/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      // Add a timeout for robustness against unresponsive local LLMs
      // This timeout is for the fetch request itself, not task execution.
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errorBody = await res.text(); // Read raw text for better debugging
      throw new LocalLLMError(
        `Local LLM API returned non-OK status: ${res.status}. Body: ${errorBody.substring(0, 200)}`,
        res.status,
      );
    }

    const data = await res.json();
    // Validate backend-style response structure
    if (typeof data.final !== 'string') {
      throw new LocalLLMError('Local LLM response structure is invalid.');
    }
    return data.final as string;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LocalLLMError('Local LLM request timed out.');
    }
    logError(`Local LLM query failed for model ${model}`, error as Error);
    throw new LocalLLMError(`Failed to query local LLM: ${(error as Error).message}`);
  }
}

// --- Backend Utility Functions ---

interface BackendTaskOptions<T> {
  payload: TaskCreatePayload;
  parse: (status: TaskStatusResponse) => T;
}

function buildTaskPayload(options: {
  query: string;
  callId: string;
  attachment?: AnswerQuestionInput['attachment'];
  tool?: string;
  tokenBudget?: number;
  timeBudgetSeconds?: number;
  model?: string;
  provider?: string;
  protoBrainName?: string;
}): { payload: TaskCreatePayload; sanitized?: { name: string } } {
  const { query, callId, attachment, tool, tokenBudget, timeBudgetSeconds, model, provider, protoBrainName } = options;
  const { sanitized, payload: attachmentPayload } = attachment ? buildAttachmentPayload(attachment) : { sanitized: undefined, payload: {} };
  return {
    payload: {
      query,
      callId,
      ...attachmentPayload,
      tool,
      tokenBudget,
      timeBudgetSeconds,
      model,
      provider,
      proto_brain_name: protoBrainName || CALL_TO_PROTO_BRAIN[callId] || 'InitialProtoBrain',
    },
    sanitized,
  };
}

async function executeBackendTask<T>({ payload, parse }: BackendTaskOptions<T>, correlationId?: string): Promise<{ result: T; queued: boolean; correlationId: string }> {
  logMetric(`BACKEND: Creating task for ${payload.callId}`);
  const createRes = await createTask(payload, correlationId);
  logMetric('BACKEND: Task created', { taskId: createRes.task_id, correlationId: createRes.correlation_id });

  const status = await waitForTaskCompletion(createRes.task_id);

  if (status.status === 'FAILED' || status.status === 'ERROR') {
    throw new BackendCommunicationError(
      `Backend task ${createRes.task_id} failed: ${status.error || 'No specific error message.'}`,
      500,
      status.result
    );
  }
  if (status.status !== 'COMPLETED') {
    throw new BackendCommunicationError(
      `Backend task ${createRes.task_id} did not complete as expected. Final status: ${status.status}`,
      500,
      status.result
    );
  }

  return { result: parse(status), queued: !!createRes.queued, correlationId: createRes.correlation_id || '' };
}

// --- Mock Data Generation Functions (Enhanced for Consistency) ---

// Consistent mock for Cognitive Analysis Protocol
function createMockCognitiveAnalysis(question: string, attachmentName?: string): CognitiveQueryAnalysisProtocol {
  // Refactored to avoid nested ternary for SonarQube S4624
  const attachmentPart = attachmentName ? `Attachment: ${attachmentName}.` : '';
  const commonContext = `User asked about "${question.substring(0, Math.min(question.length, 50))}...". ${attachmentPart}`;

  return {
    Goal: `Understand the core intent behind: "${question.substring(0, Math.min(question.length, 30))}"`,
    Obstacles: `Potential ambiguities in user's phrasing.`,
    Insights: `Initial assessment suggests user seeks actionable information.`,
    Priority: "High",
    Facts: `${commonContext} Current UTC time: ${new Date().toISOString()}.`,
    ToneAnalysis: "Tone: Neutral. User mood: Inquisitive. Interaction goal: Information Retrieval.",
    EmotionAdapt: "User profile: Professional. Previous interactions: None. Emotional preference: Objective.",
    ContextualEmotionFit: "Context: Analytical task. Potential emotional impact: Low.",
    PrecisionLevel: "Required precision: High. Key factors: Accuracy, Completeness.",
    TolerableErrorMargin: "0.5%",
    ExplicitUncertainty: "Knowns: User's explicit query. Unknowns: User's implicit needs, full context. Impact: Moderate.",
    ToleranceForUncertainty: "Tolerance level: Low.",
    ExploratoryUncertainty: "Key uncertainties: Scope of inquiry. Exploration opportunities: Clarification questions. Expected value: High.",
    HiddenUncertainty: "Implicit factors: Assumptions about user's domain knowledge. Risk level: Moderate. Mitigation strategy: Explicitly state assumptions or ask for clarification.",
    ContextualAccuracy: "Context: Technical. Accuracy importance: Critical.",
    CoreDefinitions: "Key terms: All terms in query. Definitions needed: Potentially for specialized terms. Priority ranking: Core subject first.",
    StructuralRelationships: "Hierarchy: Implied by query structure. Key variables: N/A. Clarification needed: If complex relationships are critical.",
    BoundaryAnalysis: "Edge cases: Extreme parameter values. Inconsistencies: N/A. Dependencies: External data sources.",
    EmbeddedAssumptions: "Assumptions: User expects factual, concise answers. Ambiguities: Polysémie in key terms. Suggested clarifications: Specific term definitions.",
    FactReflectionSeparation: "Facts: Extracted from query. Reflections: LLM's interpretation. Segmentation method: Distinct paragraph blocks.",
    DynamicRelationships: "Relationships: N/A. Processes: N/A. Interdependencies: N/A.",
    KnowledgeGaps: "Knowledge gaps: Domain-specific terminology, advanced concepts. Actionable follow-ups: Targeted information retrieval.",
    ConditionalBehavior: "Conditions: User follow-up. Behavioral adaptations: Refine search, adjust detail level.",
    RealTimeMonitoring: "Relevance metric: User feedback (explicit/implicit). Self-monitoring criteria: Output coherence, factual consistency. Output validation: Human review (if available).",
    RecursiveReasoning: "Iteration depth: Up to 3. Refinement approach: Incremental clarification. Recursive impact: Enhanced precision.",
    ErrorHandling: "Error type: Factual inaccuracy. Handling method: Re-evaluation, re-query. Impact mitigation: Apology, corrected answer.",
    SubsystemModularity: "Subsystem roles: Query analysis, knowledge retrieval, response synthesis. Interaction model: Sequential with feedback loops. Adaptation triggers: Failed retrieval, user dissatisfaction.",
    cognitive_cost: {
      level: ["Medium"],
      assessment_criteria: ["Mental cycles: 5-7 layers", "Information fusion complexity: Moderate"],
    },
    task_complexity: {
      classification: ["Moderate"],
      key_indicators: ["Conceptual depth: Moderate", "Information integration: Required"],
    },
    response_strategy: {
      recommendation: "Detailed Response",
      execution_mode: ["Deep Thinking"],
      decision_parameters: ["Urgency: Medium", "Information density: High"],
    },
    rationale: {
      justification: "To provide a comprehensive and accurate response, deeper cognitive processing is required.",
      supporting_factors: ["Complexity of query", "Need for precision"],
      fallback_scenarios: ["Summarization if time budget exceeded"],
    },
  };
}

// Enhanced mock evidence segment generation with more control over status.

function getMockSettings(callId: string) {
  switch (callId) {
    case 'clarification-generation':
      return MOCK_CONFIG.clarificationGeneration;
    case 'deep-research':
      return MOCK_CONFIG.deepResearch;
    default:
      return MOCK_CONFIG.cognitiveAnalysis;
  }
}

function generateMockEvidenceSegment(
  callId: string,
  title: string,
  queryText: string,
  config: { simulateFailure?: boolean; simulateTimeout?: boolean; isRetry?: boolean } = {},
): EvidenceSegment {
  const settings = getMockSettings(callId);
  const failureRoll = Math.random();
  const timeoutRoll = Math.random();
  const {
    simulateFailure = failureRoll < settings.criticalFailureChance,
    simulateTimeout = timeoutRoll < settings.timeoutChance,
    isRetry = false,
  } = config;
  const timestampStart = new Date();
  let durationMs = settings.baseDelayMs + Math.floor(Math.random() * 500);
  let status: EvidenceSegment['status'] = 'SUCCESS';
  const errors: string[] = [];
  const attemptNumber = isRetry ? 2 : 1;

  if (simulateTimeout) {
    status = 'RESOURCE_EXCEEDED';
    errors.push(`Mock timeout: Operation exceeded ${durationMs}ms.`);
    durationMs = settings.baseDelayMs * 2; // Simulate actual time elapsed before timeout
  } else if (simulateFailure) {
    status = 'FAILURE_ABORT'; // Indicate a non-retryable mock failure
    errors.push("Mock critical error: Invalid input detected.");
  } else if (attemptNumber === 1 && Math.random() < settings.transientFailureChance) {
    status = 'FAILURE_RETRY';
    errors.push("Mock transient error: Backend service temporarily unavailable.");
  }

  const timestampEnd = new Date(timestampStart.getTime() + durationMs);
  const [minTokens, maxTokens] = MOCK_CONFIG.tokenRange;
  const tokensConsumed = minTokens + Math.floor(Math.random() * (maxTokens - minTokens));
  const protoBrainVersionUsed = `proto-brain-v1.${Math.floor(Math.random() * 5)}.mock`;

  const commonReferences: EvidenceReference[] = [
    { type: 'tool', description: "Internal Data Processor", details: "Data prepared for consumption." },
    { type: 'tool', description: "System Context Loader", details: "Loaded relevant environmental context." },
  ];

  let specificReferences: EvidenceReference[] = [];
  switch (callId) {
    case 'cognitive-analysis':
      specificReferences = [
        { type: 'tool', description: "Query Feature Extractor", details: "Identified key entities and relationships." },
        { type: 'kb', description: "Knowledge Base: Cognitive Models v2", details: "Applied schema-specific heuristics."}
      ];
      break;
    case 'clarification-generation':
      specificReferences = [
        { type: 'web', description: `Simulated search for 'ambiguity resolution for ${queryText.substring(0, Math.min(queryText.length, 15))}'`, url: 'https://example.com/search?q=clarification' },
        { type: 'tool', description: "Question Synthesizer", details: "Formulated precise follow-up questions." },
        { type: 'api', description: "User Engagement API (Mock)", details: "Checked user interaction patterns." }
      ];
      break;
    case 'deep-research':
      specificReferences = [
        { type: 'web', description: `Deep dive: 'advanced topics in ${queryText.substring(0, Math.min(queryText.length, 15))}'`, url: 'https://example.com/search?q=deep_research' },
        { type: 'api', description: "External Data Provider API (Mock)", details: "Retrieved supplementary data." },
        { type: 'kb', description: "Research Methodology Guide v4", details: "Applied rigorous research protocols." },
        { type: 'tool', description: "Resource Utilization Tracker", details: `Tokens: ${tokensConsumed}, Time: ${durationMs}ms`},
      ];
      break;
  }

  return {
    id: uuidv4(),
    callId,
    title,
    summary: `${status === 'SUCCESS' ? 'Successfully completed' : 'Attempted'} ${title.toLowerCase()} for query: "${queryText.substring(0, Math.min(queryText.length, 50))}..."`,
    references: [...commonReferences, ...specificReferences],
    llmReasoningPath: `1. Input received for ${callId}.\n2. Processed with proto-brain ${protoBrainVersionUsed}.\n3. Utilized mock tools.\n4. Output generated. Status: ${status}.`,
    retrievalScore: Math.random() * (MOCK_CONFIG.retrievalScoreRange[1] - MOCK_CONFIG.retrievalScoreRange[0]) + MOCK_CONFIG.retrievalScoreRange[0],
    status,
    timestampStart: timestampStart.toISOString(),
    timestampEnd: timestampEnd.toISOString(),
    durationMs,
    tokensConsumed,
    protoBrainVersionUsed,
    attemptNumber: status === 'FAILURE_RETRY' || (status === 'SUCCESS' && attemptNumber > 1) ? attemptNumber : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// --- Unified Action Handler Type ---
// Defines a consistent interface for all action handlers (mock or real).
type ActionHandler<Input, Output> = (
  input: Input,
  model?: string,
  provider?: string,
  correlationId?: string,
  modelUrl?: string,
) => Promise<Output>;


// --- Mock Action Implementations ---
// These functions simulate the behavior of the backend without actual API calls.

const mockAnswerQuestionAction: ActionHandler<AnswerQuestionInput, AnswerQuestionOutput> = async (
  input,
  _model?,
  _provider?,
  _correlationId?,
  _modelUrl?,
) => {
  logVerbose('MOCK: answerQuestionAction called', { question: input.question });

  // Simulate potential failures as per the evidence segment config.
  const evidenceSegment = generateMockEvidenceSegment('cognitive-analysis', 'Cognitive Analysis', input.question);
  await new Promise(resolve => setTimeout(resolve, evidenceSegment.durationMs || getMockSettings('cognitive-analysis').baseDelayMs));

  if (evidenceSegment.status === 'FAILURE_ABORT' || evidenceSegment.status === 'RESOURCE_EXCEEDED') {
    return {
      answer: JSON.stringify({ Error: `Mock Cognitive analysis failed: ${evidenceSegment.errors?.[0]}`, Details: evidenceSegment.errors }),
      mockEvidenceSegments: [evidenceSegment]
    };
  }

  const mockAnalysis = createMockCognitiveAnalysis(input.question, input.attachment?.name);
  const answerJson = JSON.stringify(mockAnalysis, null, 2);
  return { answer: answerJson, mockEvidenceSegments: [evidenceSegment], queued: false, correlationId: uuidv4() };
};

const mockGenerateClarificationAction: ActionHandler<GenerateClarificationInput, GenerateClarificationOutput> = async (
  input,
  _model?,
  _provider?,
  _correlationId?,
  _modelUrl?,
) => {
  logVerbose('MOCK: generateClarificationAction called', { question: input.originalQuestion });

  const evidenceSegment = generateMockEvidenceSegment('clarification-generation', 'Clarification Generation', input.originalQuestion);
  await new Promise(resolve => setTimeout(resolve, evidenceSegment.durationMs || getMockSettings('clarification-generation').baseDelayMs + 200));

  if (evidenceSegment.status === 'FAILURE_ABORT' || evidenceSegment.status === 'RESOURCE_EXCEEDED') {
    return {
      clarificationText: `Error generating clarification: ${evidenceSegment.errors?.[0]}`,
      mockEvidenceSegments: [evidenceSegment],
      queued: false,
      correlationId: uuidv4(),
    };
  }

  const goal = input.cognitiveAnalysis?.Goal || "the main objective";
  const obstacles = input.cognitiveAnalysis?.Obstacles || "potential challenges";
  const facts = input.cognitiveAnalysis?.Facts || "relevant facts";

  const clarificationText = `
Based on my preliminary analysis of your query ("${input.originalQuestion.substring(0, Math.min(input.originalQuestion.length, 50))}..."), my understanding is that your primary goal is: *"${goal}"*.

To provide the most accurate and useful response, could you please clarify the following:
1. Regarding "${goal.substring(0, Math.min(goal.length, 30))}...", is there a specific aspect or constraint you need to prioritize?
2. You mentioned "${obstacles.substring(0, Math.min(obstacles.length, 30))}..." as potential hurdles. Which of these is most critical for me to address?
3. With respect to the available facts ("${facts.substring(0, Math.min(facts.length, 40))}..."), is there any additional context or information I should be aware of?
`;
  return { clarificationText, mockEvidenceSegments: [evidenceSegment], queued: false, correlationId: uuidv4() };
};


const mockDeepResearchAction: ActionHandler<DeepResearchInput, DeepResearchOutput> = async (
  input,
  _model?,
  _provider?,
  _correlationId?,
  _modelUrl?,
) => {
  logVerbose('MOCK: deepResearchAction called', { clarification: input.userClarification, question: input.originalQuestion });

  const evidenceSegment = generateMockEvidenceSegment('deep-research', 'Deep Research Phase', input.originalQuestion);
  await new Promise(resolve => setTimeout(resolve, evidenceSegment.durationMs || getMockSettings('deep-research').baseDelayMs + 500));

  if (evidenceSegment.status === 'FAILURE_ABORT' || evidenceSegment.status === 'RESOURCE_EXCEEDED') {
    return {
      summary: `Error during deep research: ${evidenceSegment.errors?.[0]}`,
      nodes: [],
      edges: [],
      mockEvidenceSegments: [evidenceSegment],
      queued: false,
      correlationId: uuidv4(),
    };
  }

  const missionPlanDocument = getExampleMissionPlanAsDocument(input.originalQuestion);
  const { nodes, edges } = transformMissionPlanToFlowData(missionPlanDocument);

  const summary = `
# Deep Research Summary for: ${input.originalQuestion.substring(0, Math.min(input.originalQuestion.length, 50))}...

Based on your clarifications ("${input.userClarification.substring(0, Math.min(input.userClarification.length, 50))}...") and the initial cognitive analysis, I've executed a detailed research plan: "${missionPlanDocument.query_context.substring(0, Math.min(missionPlanDocument.query_context.length, 60))}...".

Key findings are structured according to the research plan's objectives and stages. You can explore the detailed plan and its execution path in the 'Action Graph' visualization tab to understand the progression of the research.
This research involved ${missionPlanDocument.Strategy.length} main objectives and took approximately ${evidenceSegment.durationMs}ms, consuming ${evidenceSegment.tokensConsumed} mock tokens, using ${evidenceSegment.protoBrainVersionUsed}.
`;

  return { summary, nodes, edges, mockEvidenceSegments: [evidenceSegment], queued: false, correlationId: uuidv4() };
};

const mockSimpleChatAction: ActionHandler<AnswerQuestionInput, AnswerQuestionOutput> = async (
  input,
  _model?,
  _provider?,
  _correlationId?,
  _modelUrl?,
) => {
  const evidenceSegment = generateMockEvidenceSegment('simple-reflection', 'Simple Chat', input.question);
  await new Promise(resolve => setTimeout(resolve, evidenceSegment.durationMs || getMockSettings('cognitive-analysis').baseDelayMs));
  const answer = `Mock response: ${input.question}`;
  return { answer, mockEvidenceSegments: [evidenceSegment], queued: false, correlationId: uuidv4() };
};


// --- Backend Action Implementations ---
// These functions interact with your actual backend API.

const backendAnswerQuestionAction: ActionHandler<AnswerQuestionInput, AnswerQuestionOutput> = async (
  input,
  _model,
  provider,
  correlationId,
  modelUrl
) => {
  try {
    if (!input.question || input.question.trim().length === 0) {
      throw new ActionError('Question input cannot be empty.', 'INVALID_INPUT');
    }

    if (input.attachment) {
      logWarn('BACKEND: Attachments are not supported by /v1/run', {
        name: input.attachment.name,
      });
    }

    if (provider === 'client-local') {
      logMetric('BACKEND: Routing to local LLM for answerQuestionAction');
      try {
        const answer = await queryLocalLLM(
          input.question,
          _model || '',
          provider === 'client-local' ? modelUrl : undefined,
        );
        return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
      } catch (err) {
        logWarn('Local LLM unavailable, falling back to backend', err as Error);
      }
    } else if (provider === 'transformersjs') {
      logMetric('BACKEND: Routing to transformersjs for answerQuestionAction');
      const answer = await queryBrowserLLM(input.question);
      return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
    }

    if (!(await ensureBackendConnectivity())) {
      throw new BackendCommunicationError('Backend API unreachable.', 503);
    }

    let finalAnswer = '';
    const reqId = correlationId || uuidv4();
    try {
      if (USE_PIPELINE_STREAMING) {
        await runPipelineStream(
          input.question,
          (ev) => {
            // Future listeners can react to each milestone here
            if (ev.type === 'final') {
              finalAnswer = ev.text || '';
            }
          },
          reqId,
        );
        if (!finalAnswer) {
          throw new Error('stream completed without final event');
        }
      } else {
        const res = await runPipeline(input.question, reqId);
        finalAnswer = res.final;
      }
    } catch (streamErr) {
      logWarn('Stream failure, falling back to non-streaming', streamErr as Error);
      const res = await runPipeline(input.question, reqId);
      finalAnswer = res.final;
    }
    return {
      answer: finalAnswer,
      mockEvidenceSegments: [],
      queued: false,
      correlationId: reqId,
    };

  } catch (err) {
    logError('BACKEND: Error in backendAnswerQuestionAction', err);
    if (err instanceof ActionError) {
      throw err;
    }
    throw new BackendCommunicationError(
      `Failed to process answer question via backend: ${(err as Error).message}`,
      500,
      {},
    );
  }
};

const backendGenerateClarificationAction: ActionHandler<GenerateClarificationInput, GenerateClarificationOutput> = async (
  input,
  model,
  provider,
  correlationId,
  modelUrl
) => {
  try {
    if (!input.originalQuestion || input.originalQuestion.trim().length === 0) {
      throw new ActionError('Original question cannot be empty for clarification.', 'INVALID_INPUT');
    }

    const query = `Clarify: ${input.originalQuestion}`;

    const { payload } = buildTaskPayload({
      query,
      callId: 'clarification-generation',
      tokenBudget: input.tokenBudget,
      timeBudgetSeconds: input.timeBudgetSeconds,
      model,
      provider,
      protoBrainName: input.protoBrainName,
    });

    if (provider === 'client-local') {
      logMetric('BACKEND: Routing to local LLM for generateClarificationAction');
      try {
        const text = await queryLocalLLM(
          query,
          model || '',
          provider === 'client-local' ? modelUrl : undefined
        );
        return { clarificationText: text, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
      } catch (err) {
        logWarn('Local LLM unavailable, falling back to backend', err as Error);
      }
    } else if (provider === 'transformersjs') {
      logMetric('BACKEND: Routing to transformersjs for generateClarificationAction');
      const text = await queryBrowserLLM(query);
      return { clarificationText: text, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
    }

    const { result: text, queued, correlationId } = await executeBackendTask<string>({
      payload,
      parse: (status) =>
        typeof status.result?.final_answer === 'string'
          ? status.result.final_answer
          : JSON.stringify(status.result?.final_answer || {}),
    }, correlationId);

    return { clarificationText: text, mockEvidenceSegments: [], queued, correlationId };
  } catch (err) {
    logError('BACKEND: Error in backendGenerateClarificationAction', err);
    if (err instanceof ActionError) {
      throw err;
    }
    throw new BackendCommunicationError(`Failed to generate clarification via backend: ${(err as Error).message}`, 500, {});
  }
};

const backendDeepResearchAction: ActionHandler<DeepResearchInput, DeepResearchOutput> = async (
  input,
  model,
  provider,
  correlationId,
  modelUrl
) => {
  try {
    if (!input.originalQuestion || input.originalQuestion.trim().length === 0) {
      throw new ActionError('Original question cannot be empty for deep research.', 'INVALID_INPUT');
    }
    if (!input.userClarification || input.userClarification.trim().length === 0) {
      // Deep research usually implies user interaction, but could be auto-triggered
      logWarn('BACKEND: Deep research initiated without user clarification');
    }

    const query = `${input.originalQuestion}\nClarification:${input.userClarification || 'No further clarification provided.'}`;

    const { payload } = buildTaskPayload({
      query,
      callId: 'deep-research',
      tokenBudget: input.tokenBudget,
      timeBudgetSeconds: input.timeBudgetSeconds,
      model,
      provider,
      protoBrainName: input.protoBrainName,
    });

    if (provider === 'client-local') {
      logMetric('BACKEND: Routing to local LLM for deepResearchAction');
      try {
        const summary = await queryLocalLLM(
          query,
          model || '',
          provider === 'client-local' ? modelUrl : undefined
        );
        return { summary, nodes: [], edges: [], mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
      } catch (err) {
        logWarn('Local LLM unavailable, falling back to backend', err as Error);
      }
    } else if (provider === 'transformersjs') {
      logMetric('BACKEND: Routing to transformersjs for deepResearchAction');
      const summary = await queryBrowserLLM(query);
      return { summary, nodes: [], edges: [], mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
    }

    const { result, queued, correlationId } = await executeBackendTask<{ summary: string; nodes: any[]; edges: any[] }>({
      payload,
      parse: (status) => ({
        summary:
          typeof status.result?.final_answer === 'string'
            ? status.result.final_answer
            : JSON.stringify(status.result?.final_answer || {}),
        nodes: Array.isArray(status.result?.nodes) ? status.result.nodes : [],
        edges: Array.isArray(status.result?.edges) ? status.result.edges : [],
      }),
    }, correlationId);

    return { ...result, mockEvidenceSegments: [], queued, correlationId };
  } catch (err) {
    logError('BACKEND: Error in backendDeepResearchAction', err);
    if (err instanceof ActionError) {
      throw err;
    }
    throw new BackendCommunicationError(`Failed to perform deep research via backend: ${(err as Error).message}`, 500, {});
  }
};

const backendSimpleChatAction: ActionHandler<AnswerQuestionInput, AnswerQuestionOutput> = async (
  input,
  model,
  provider,
  correlationId,
  modelUrl
) => {
  try {
    if (!input.question || input.question.trim().length === 0) {
      throw new ActionError('Question input cannot be empty.', 'INVALID_INPUT');
    }

    const { payload } = buildTaskPayload({
      query: input.question,
      callId: 'simple-reflection',
      tokenBudget: input.tokenBudget,
      timeBudgetSeconds: input.timeBudgetSeconds,
      model,
      provider,
      protoBrainName: input.protoBrainName,
    });

    if (provider === 'client-local') {
      logMetric('BACKEND: Routing to local LLM for simpleChatAction');
      try {
        const answer = await queryLocalLLM(
          payload.query,
          model || '',
          provider === 'client-local' ? modelUrl : undefined
        );
        return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
      } catch (err) {
        logWarn('Local LLM unavailable, falling back to backend', err as Error);
      }
    } else if (provider === 'transformersjs') {
      logMetric('BACKEND: Routing to transformersjs for simpleChatAction');
      const answer = await queryBrowserLLM(payload.query);
      return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4() };
    }

    const { result: answer, queued, correlationId } = await executeBackendTask<string>({
      payload,
      parse: (status) =>
        typeof status.result?.final_answer === 'string'
          ? status.result.final_answer
          : JSON.stringify(status.result?.final_answer || {}),
    }, correlationId);

    return { answer, mockEvidenceSegments: [], queued, correlationId };
  } catch (err) {
    logError('BACKEND: Error in backendSimpleChatAction', err);
    if (err instanceof ActionError) {
      throw err;
    }
    throw new BackendCommunicationError(`Failed to process simple chat via backend: ${(err as Error).message}`, 500, {});
  }
};


// --- Action Dispatcher ---
// This is the single point of entry for each action type.
// It abstracts away whether a mock or real backend is used.
function getActionDispatcher<Input, Output>(
  callId: string,
  mockAction: ActionHandler<Input, Output>,
  backendAction: ActionHandler<Input, Output>
): ActionHandler<Input, Output> {
  return async (
    input: Input,
    model?: string,
    provider?: string,
    correlationId?: string,
    modelUrl?: string,
  ): Promise<Output> => {
    // If client-local is selected, always route to local LLM via backend implementation
    // This allows backend implementation to handle `queryLocalLLM` logic.
    if (provider === 'client-local' || provider === 'transformersjs') {
      logMetric('Dispatching to client-local provider', { callId });
      // Pass through to the backend action which has the local LLM routing
      // This is a design choice: keep local LLM interaction within the 'backend' context
      // as it's still a server-side interaction, just not with an external API.
      const result = await backendAction(input, model, provider, correlationId, modelUrl);
      (result as any).usingMock = false;
      return result;
    }

    let backendOk = false;
    try {
      backendOk = await ensureBackendConnectivity();
    } catch (err) {
      logError('Error checking backend connectivity', err as Error);
    }

    if (backendOk) {
      try {
        logMetric('Dispatching to backend API', { callId });
        const result = await backendAction(input, model, provider, correlationId, modelUrl);
        (result as any).usingMock = false;
        return result;
      } catch (err) {
        logError('Backend action failed, falling back to mock', err as Error);
      }
    }

    logMetric('Backend unreachable or not configured. Using mock implementation');
    const result = await mockAction(input, model, provider, correlationId, modelUrl);
    (result as any).usingMock = true;
    return result;
  };
}

// --- Exported Actions ---
// These are the public functions your client will call.
export const answerQuestionAction = getActionDispatcher<AnswerQuestionInput, AnswerQuestionOutput>('cognitive-analysis', mockAnswerQuestionAction, backendAnswerQuestionAction);
export const generateClarificationAction = getActionDispatcher<GenerateClarificationInput, GenerateClarificationOutput>('clarification-generation', mockGenerateClarificationAction, backendGenerateClarificationAction);
export const deepResearchAction = getActionDispatcher<DeepResearchInput, DeepResearchOutput>('deep-research', mockDeepResearchAction, backendDeepResearchAction);
export const simpleChatAction = getActionDispatcher<AnswerQuestionInput, AnswerQuestionOutput>('simple-reflection', mockSimpleChatAction, backendSimpleChatAction);

// --- Orchestrator Request Handler ---
export interface OrchestratorState {
  message?: string;
  errors?: Record<string, string[]>;
  result?: {
    orchestrationPlan: string;
    potentialChallenges: string;
    deterministicMetrics: string;
  };
}

export async function submitOrchestratorRequest(
  prevState: OrchestratorState,
  formData: FormData,
): Promise<OrchestratorState> {
  const taskDescription = formData.get('taskDescription')?.toString().trim() ?? '';
  const desiredOutcomes = formData.get('desiredOutcomes')?.toString().trim() ?? '';
  const currentSystemState = formData.get('currentSystemState')?.toString().trim() ?? '';

  const errors: Record<string, string[]> = {};
  if (!taskDescription) errors.taskDescription = ['Task description is required'];
  if (!desiredOutcomes) errors.desiredOutcomes = ['Desired outcomes are required'];
  if (!currentSystemState) errors.currentSystemState = ['Current system state is required'];

  if (Object.keys(errors).length > 0) {
    return { message: 'Please correct the highlighted fields.', errors };
  }

  // Placeholder implementation that returns a mocked plan
  const result = {
    orchestrationPlan: '1. Analyze requirements\n2. Design architecture\n3. Deploy solution',
    potentialChallenges: 'Integration complexity\nResource constraints',
    deterministicMetrics: 'Uptime: 99%\nCost reduction: 20%',
  };

  logMetric('Received orchestrator request', { taskDescription, desiredOutcomes, currentSystemState });
  return { message: 'Plan generated successfully.', errors: {}, result };
}
