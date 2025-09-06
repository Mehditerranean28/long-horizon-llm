
export interface Tactic {
  id: string; // e.g., "t1", "t2"
  description: string;
  dependencies: string[];
  expected_artifact: string;
}

export interface Queries {
  [queryId: string]: string; // e.g., "Q1": "Description of query"
}

export interface StrategyObjective {
  id: string; // e.g., "O1", "O2"
  description: string;
  queries: Queries;
  tactics: Tactic[];
  tenant: string[];
}

export interface MissionPlanDocument {
  query_context: string;
  Strategy: StrategyObjective[];
}
