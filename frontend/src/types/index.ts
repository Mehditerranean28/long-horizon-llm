
export interface EvidenceReference {
  type: 'web' | 'api' | 'kb' | 'tool';
  description: string;
  url?: string;
  details?: string;
}

export interface EvidenceSegment {
  id: string;
  callId: string; // e.g., 'cognitive-analysis', 'clarification-generation', 'deep-research'
  title: string;
  summary?: string;
  references: EvidenceReference[];
  llmReasoningPath?: string;
  retrievalScore?: number; // If applicable

  // New fields for telemetry and auditability
  status: 'SUCCESS' | 'PROCESSING' | 'FAILURE_RETRY' | 'FAILURE_ABORT' | 'RESOURCE_EXCEEDED';
  timestampStart: string; // ISO date string
  timestampEnd?: string; // ISO date string, optional if still processing
  durationMs?: number;
  tokensConsumed?: number; // Mock value
  protoBrainVersionUsed?: string; // e.g., "proto-brain-v1.2-mock"
  attemptNumber?: number; // For retries
  errors?: string[]; // If any occurred during this segment
}


export interface Statement {
  id: string;
  text: string;
}


import type { CognitiveQueryAnalysisProtocol } from './cognitive-protocol';
export type { CognitiveQueryAnalysisProtocol } from './cognitive-protocol';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parsedContent?: ParsedChatMessageContent;
  cognitiveAnalysisData?: CognitiveQueryAnalysisProtocol | null;
  isLoading?: boolean;
  timestamp: Date;
  messageType?:
    | 'cognitive_analysis_loading'
    | 'cognitive_analysis_table'
    | 'clarification_loading'
    | 'clarification_questions'
    | 'deep_research_summary'
    | 'deep_dive';
  evidenceContext?: string;
  attachmentName?: string;
  attachmentPreviewUrl?: string;
  mockEvidenceSegments?: EvidenceSegment[]; // Store evidence with the message that generated it
}

export interface ParsedChatMessageContent {
  sections: ContentSection[];
}

export interface ContentSection {
  id: string;
  type: 'heading' | 'paragraph' | 'list' | 'citation' | 'code';
  text: string;
  level?: number;
  items?: string[];
  language?: string;
  canDeepDive?: boolean;
  canShowEvidence?: boolean;
  value?: any;
}
