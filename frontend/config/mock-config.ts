// mock-config.ts
/**
 * Central configuration for frontend mock behavior.
 * Adjust these values to tweak the probability of failures
 * and timing during development tests.
 */
export interface MockActionSettings {
  /** Base delay in milliseconds for a mock API call */
  baseDelayMs: number;
  /** Probability [0-1] that a transient retryable failure occurs */
  transientFailureChance: number;
  /** Probability [0-1] that a critical failure occurs */
  criticalFailureChance: number;
  /** Probability [0-1] that a timeout occurs */
  timeoutChance: number;
}

export interface MockConfig {
  cognitiveAnalysis: MockActionSettings;
  clarificationGeneration: MockActionSettings;
  deepResearch: MockActionSettings;
  /** Range of tokens consumed when generating a mock evidence segment */
  tokenRange: [number, number];
  /** Range for the retrievalScore field */
  retrievalScoreRange: [number, number];
}

export const MOCK_CONFIG: MockConfig = {
  cognitiveAnalysis: {
    baseDelayMs: 800,
    transientFailureChance: 0.1,
    criticalFailureChance: 0.02,
    timeoutChance: 0,
  },
  clarificationGeneration: {
    baseDelayMs: 1000,
    transientFailureChance: 0.1,
    criticalFailureChance: 0,
    timeoutChance: 0.01,
  },
  deepResearch: {
    baseDelayMs: 1300,
    transientFailureChance: 0.1,
    criticalFailureChance: 0.03,
    timeoutChance: 0,
  },
  tokenRange: [50, 200],
  retrievalScoreRange: [0.75, 0.95],
};
