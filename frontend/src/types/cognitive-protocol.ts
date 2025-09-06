
export interface CognitiveQueryAnalysisProtocol {
  Goal: string;
  Obstacles: string;
  Insights: string;
  Priority: string;
  Facts: string;
  ToneAnalysis: string;
  EmotionAdapt: string;
  ContextualEmotionFit: string;
  PrecisionLevel: string;
  TolerableErrorMargin: string; // Added as per previous request
  ExplicitUncertainty: string;
  ToleranceForUncertainty: string;
  ExploratoryUncertainty: string;
  HiddenUncertainty: string;
  ContextualAccuracy: string;
  CoreDefinitions: string;
  StructuralRelationships: string;
  BoundaryAnalysis: string;
  EmbeddedAssumptions: string;
  FactReflectionSeparation: string;
  DynamicRelationships: string;
  KnowledgeGaps: string;
  ConditionalBehavior: string;
  RealTimeMonitoring: string;
  RecursiveReasoning: string;
  ErrorHandling: string;
  SubsystemModularity: string;
  cognitive_cost: {
    level: string[];
    assessment_criteria: string[];
  };
  task_complexity: {
    classification: string[];
    key_indicators: string[];
  };
  response_strategy: {
    recommendation: string;
    execution_mode: string[];
    decision_parameters: string[];
  };
  rationale: {
    justification: string;
    supporting_factors: string[];
    fallback_scenarios: string[];
  };
}
