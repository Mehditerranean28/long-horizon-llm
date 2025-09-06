
import type { Node, Edge } from 'reactflow';
import type {
  MissionPlanDocument,
  StrategyObjective as MissionStrategyObjective,
  Queries as MissionQueries,
  Tactic as MissionTactic,
} from '@/types/mission-plan';
import type { DeepResearchNodeData } from '@/types/action-io-types';

// This is the example mission plan provided by the user.
// In a real scenario, this would come from an API or be generated.
const exampleMissionPlanFromUser = {
    "Example query": "This will be replaced by the actual user query.", // Placeholder
    "Strategy": [
        {
            "O1": "Define the foundational constructs and rules for wildcard pattern matching",
            "queries": {
                "Q1": "What are the axiomatic constructs and universal principles that govern wildcard pattern matching with '?' and '*'?"
            },
            "tactics": [
                {
                    "t1": "Clearly define the behavior of '?' and '*' wildcards in different scenarios.",
                    "dependencies": [
                        "Reference documentation on wildcard matching principles"
                    ],
                    "expected_artifact": "Wildcard_Rules_Documentation.md",
                },
                {
                    "t2": "Define constraints for input strings and patterns, including length and character types.",
                    "dependencies": ["Wildcard_Rules_Documentation.md"],
                    "expected_artifact": "Constraints_Documentation.md",
                },
                {
                    "t3": "Document and categorize special scenarios and edge cases for pattern matching.",
                    "dependencies": ["Constraints_Documentation.md"],
                    "expected_artifact": "Edge_Cases_List.json",
                },
            ],
            "tenant": ["Q AI/ML Frameworks", "Q R&D Knowledge Hub"],
        },
        {
            "O2": "Design an efficient algorithm for wildcard pattern matching",
            "queries": {
                "Q1": "How can dynamic programming be applied to solve the wildcard pattern matching problem?",
                "Q2": "What alternative algorithms can be considered, and how do they compare in terms of time and space complexity?",
            },
            "tactics": [
                {
                    "t1": "Implement a dynamic programming solution using a 2D boolean array.",
                    "dependencies": [
                        "datasets/sample_patterns.json",
                        "lib/numpy",
                        "lib/unittest",
                        "Edge_Cases_List.json",
                    ],
                    "expected_artifact": "DP_Solution_2D.py",
                },
                {
                    "t2": "Rework the DP solution to reduce space complexity using two 1D arrays.",
                    "dependencies": [
                        "DP_Solution_2D.py",
                        "Performance_Test_Framework.py",
                    ],
                    "expected_artifact": "Optimized_DP_Solution_1D.py",
                },
                {
                    "t3": "Develop and compare recursive and iterative solutions.",
                    "dependencies": [
                        "Optimized_DP_Solution_1D.py",
                        "datasets/benchmark_cases.json",
                        "Codebase for recursion and iteration benchmarks",
                    ],
                    "expected_artifact": "Recursive_vs_Iterative_Report.pdf",
                },
            ],
            "tenant": ["Q AI/ML Frameworks", "Q R&D Knowledge Hub"],
        },
        {
            "O3": "Handle edge cases and optimize performance",
            "queries": {
                "Q1": "How can we efficiently handle patterns with multiple consecutive '*' characters?",
                "Q2": "What optimizations can be applied to improve performance for very long input strings or patterns?",
            },
            "tactics": [
                {
                    "t1": "Implement special logic for patterns with multiple consecutive '*' characters.",
                    "dependencies": ["Optimized_DP_Solution_1D.py"],
                    "expected_artifact": "Optimized_Star_Handling.py",
                },
                {
                    "t2": "Develop early termination conditions for impossible matches.",
                    "dependencies": ["Optimized_Star_Handling.py"],
                    "expected_artifact": "Early_Termination_Conditions.md",
                },
                {
                    "t3": "Improve performance for patterns with a high proportion of wildcards.",
                    "dependencies": [
                        "Early_Termination_Conditions.md",
                        "Benchmarking framework",
                    ],
                    "expected_artifact": "High_Wildcard_Optimization_Report.md",
                },
            ],
            "tenant": ["Q AI/ML Frameworks", "Q R&D Knowledge Hub"],
        },
        {
            "O4": "Ensure correctness and robustness of the implementation",
            "queries": {
                "Q1": "How can we systematically test the wildcard pattern matching algorithm to ensure correctness?",
                "Q2": "What strategies can be employed to handle potential edge cases and ensure robustness?",
            },
            "tactics": [
                {
                    "t1": "Create a test suite covering various input scenarios.",
                    "dependencies": [
                        "High_Wildcard_Optimization_Report.md",
                        "datasets/test_scenarios.json",
                        "lib/pytest",
                    ],
                    "expected_artifact": "Test_Suite.py",
                },
                {
                    "t2": "Test the algorithm with large inputs approaching the 2000-character limit.",
                    "dependencies": ["Test_Suite.py", "Performance_Test_Framework.py"],
                    "expected_artifact": "Stress_Test_Report.md",
                },
                {
                    "t3": "Systematically validate the algorithm against known edge cases.",
                    "dependencies": ["Stress_Test_Report.md", "Edge_Cases_List.json"],
                    "expected_artifact": "Edge_Case_Validation_Results.json",
                },
            ],
            "tenant": [
                "Q AI/ML Frameworks",
                "Q R&D Knowledge Hub",
                "Q Security Compliance",
            ],
        },
        {
            "O5": "Analyze and document the time and space complexity",
            "queries": {
                "Q1": "What is the time and space complexity of the implemented solution?",
                "Q2": "How does the complexity compare to alternative approaches, and what are the trade-offs?",
            },
            "tactics": [
                {
                    "t1": "Conduct a detailed analysis of the time and space complexity.",
                    "dependencies": ["Edge_Case_Validation_Results.json"],
                    "expected_artifact": "Complexity_Analysis.md",
                },
                {
                    "t2": "Compare the complexity with alternative solutions.",
                    "dependencies": [
                        "Complexity_Analysis.md",
                        "Alternative_Algorithms_Report.pdf",
                    ],
                    "expected_artifact": "Comparison_Report.md",
                },
                {
                    "t3": "Detail trade-offs between different approaches.",
                    "dependencies": ["Comparison_Report.md"],
                    "expected_artifact": "Trade_Off_Analysis.md",
                },
            ],
            "tenant": ["Q AI/ML Frameworks", "Q R&D Knowledge Hub"],
        },
        {
            "O6": "Consider future extensions and optimizations",
            "queries": {
                "Q1": "How can the current implementation be extended to support more complex pattern matching scenarios?",
                "Q2": "What potential optimizations or improvements could be made for specific use cases or larger scale applications?",
            },
            "tactics": [
                {
                    "t1": "Research extensions for case-insensitive matching and multi-character wildcards.",
                    "dependencies": [
                        "Wildcard_Rules_Documentation.md",
                        "Trade_Off_Analysis.md",
                    ],
                    "expected_artifact": "Extensions_Report.md",
                },
                {
                    "t2": "Explore parallelization strategies for large-scale pattern matching.",
                    "dependencies": [
                        "Extensions_Report.md",
                        "Parallel_Computing_Framework",
                    ],
                    "expected_artifact": "Parallelization_Strategy_Report.md",
                },
                {
                    "t3": "Research and prototype streaming algorithms for real-time pattern matching.",
                    "dependencies": [
                        "Parallelization_Strategy_Report.md",
                        "Large datasets for streaming scenarios",
                    ],
                    "expected_artifact": "Streaming_Algorithm_Prototype.py",
                },
            ],
            "tenant": [
                "Q AI/ML Frameworks",
                "Q R&D Knowledge Hub",
                "Q Open APIs",
            ],
        },
    ],
};


function parseRawPlan(rawPlan: any, originalQuestion: string): MissionPlanDocument {
  const strategy: MissionStrategyObjective[] = rawPlan.Strategy.map((stratObj: any) => {
    const objectiveKey = Object.keys(stratObj).find(k => k.startsWith('O') && k !== 'queries' && k !== 'tactics' && k !== 'tenant')!;
    const objectiveDescription = stratObj[objectiveKey];

    const tactics: MissionTactic[] = stratObj.tactics.map((tacObj: any) => {
      const tacticKey = Object.keys(tacObj).find(k => k.startsWith('t') && k !== 'dependencies' && k !== 'expected_artifact')!;
      const tacticDescription = tacObj[tacticKey];
      return {
        id: tacticKey,
        description: tacticDescription,
        dependencies: tacObj.dependencies,
        expected_artifact: tacObj.expected_artifact,
      };
    });

    const queries: MissionQueries = {};
    if (stratObj.queries) {
        for (const key in stratObj.queries) {
            if (key.startsWith('Q')) {
                queries[key] = stratObj.queries[key];
            }
        }
    }

    return {
      id: objectiveKey,
      description: objectiveDescription,
      queries: queries,
      tactics: tactics,
      tenant: stratObj.tenant,
    };
  });

  return {
    query_context: originalQuestion, // Use the actual user query here
    Strategy: strategy,
  };
}

export function getExampleMissionPlanAsDocument(originalQuestion: string): MissionPlanDocument {
    return parseRawPlan(exampleMissionPlanFromUser, originalQuestion);
}

export function transformMissionPlanToFlowData(plan: MissionPlanDocument): { nodes: Node<DeepResearchNodeData>[], edges: Edge[] } {
  const nodes: Node<DeepResearchNodeData>[] = [];
  const edges: Edge[] = [];
  
  const xRoot = 50;
  const xObjective = 350; 
  const xQuery = 650;     
  const xTactic = 950;    
  
  const yGapObjective = 150; 
  const yGapGroup = 100; 
  const yGapItem = 70;   

  const rootNodeId = 'root-mission-context';
  
  const approxTotalObjectiveHeight = plan.Strategy.length * yGapObjective;
  nodes.push({
    id: rootNodeId,
    position: { x: xRoot, y: Math.max(50, (approxTotalObjectiveHeight / 2) - 50) }, // Ensure y is not too small
    data: {
      id: rootNodeId,
      label: `Mission: ${plan.query_context.substring(0, 50)}...`,
      type: 'subPlan', 
      rawObjective: undefined, 
      rawTactic: undefined,
      rawQuery: undefined,
      details: plan.query_context,
      color: '#4A148C' 
    },
    style: { backgroundColor: '#F3E5F5', borderColor: '#4A148C', borderWidth: 2, width: 250, textAlign: 'center', padding: '10px' },
  });

  let currentYObjectiveOffset = 0;

  plan.Strategy.forEach((objective) => {
    const objectiveNodeId = `obj-${objective.id}`;
    const objectiveNodeY = currentYObjectiveOffset;
    
    nodes.push({
      id: objectiveNodeId,
      position: { x: xObjective, y: objectiveNodeY },
      data: {
        id: objective.id,
        label: `${objective.id}: ${objective.description.substring(0, 40)}...`,
        type: 'objective',
        rawObjective: objective,
        details: `Tenants: ${objective.tenant.join(', ')}\nFull Desc: ${objective.description}`,
        color: '#7E57C2' 
      },
      style: { backgroundColor: '#E9D8FD', borderColor: '#7E57C2', borderWidth: 2, width: 200, textAlign: 'center'},
    });

    edges.push({
        id: `e-${rootNodeId}-${objectiveNodeId}`,
        source: rootNodeId,
        target: objectiveNodeId,
        animated: true,
        type: 'smoothstep',
    });
    
    const numQueries = Object.keys(objective.queries).length;
    const numTactics = objective.tactics.length;
    const totalItemsInGroup = numQueries + numTactics;
    
    // Calculate starting Y to center queries/tactics vertically relative to the objective node
    let currentYInObjectiveGroup = objectiveNodeY - ((totalItemsInGroup -1) * yGapItem / 2) ;
     if (totalItemsInGroup === 0) {
         currentYInObjectiveGroup = objectiveNodeY; 
    }


    Object.entries(objective.queries).forEach(([queryKey, queryDesc]) => {
      const queryNodeId = `query-${objective.id}-${queryKey}`;
      nodes.push({
        id: queryNodeId,
        position: { x: xQuery, y: currentYInObjectiveGroup },
        data: {
          id: queryKey,
          label: `${queryKey}: ${queryDesc.substring(0,35)}...`,
          type: 'query',
          rawQuery: {id: queryKey, description: queryDesc},
          details: queryDesc,
          color: '#26A69A' 
        },
        style: { backgroundColor: '#D0F0E0', borderColor: '#26A69A', borderWidth: 2, width: 180, textAlign: 'center', fontSize: '0.9em' },
      });
      edges.push({
        id: `e-${objectiveNodeId}-${queryNodeId}`,
        source: objectiveNodeId,
        target: queryNodeId,
        animated: true,
        type: 'smoothstep',
      });
      currentYInObjectiveGroup += yGapItem;
    });
    
    if (numQueries > 0 && numTactics > 0) {
        currentYInObjectiveGroup += yGapGroup / 2 - yGapItem; // Adjust for gap, then next item
    }


    objective.tactics.forEach((tactic) => {
      const tacticNodeId = `tactic-${objective.id}-${tactic.id}`;
      nodes.push({
        id: tacticNodeId,
        position: { x: xTactic, y: currentYInObjectiveGroup },
        data: {
          id: tactic.id,
          label: `${tactic.id}: ${tactic.description.substring(0,30)}...`,
          type: 'tactic',
          rawTactic: tactic,
          details: `Artifact: ${tactic.expected_artifact}\nDependencies: ${tactic.dependencies.join(', ')}\nFull Desc: ${tactic.description}`,
          dependencies: tactic.dependencies,
          expectedArtifact: tactic.expected_artifact,
          color: '#FFA726' 
        },
        style: { backgroundColor: '#FFE0B2', borderColor: '#FFA726', borderWidth: 2, width: 220, textAlign: 'center', fontSize: '0.85em' },
      });
      edges.push({
        id: `e-${objectiveNodeId}-${tacticNodeId}`, 
        source: objectiveNodeId,
        target: tacticNodeId,
        animated: true,
        type: 'smoothstep',
      });
      currentYInObjectiveGroup += yGapItem;
    });

    const maxYForThisObjectiveGroup = currentYInObjectiveGroup - yGapItem; // Y of last item in group
    const objectiveGroupHeight = maxYForThisObjectiveGroup - (objectiveNodeY - ((totalItemsInGroup -1) * yGapItem / 2));

    // Ensure there's enough vertical space for the current objective group, then add the standard gap
    currentYObjectiveOffset = Math.max(currentYObjectiveOffset + objectiveGroupHeight + yGapItem, objectiveNodeY + yGapObjective) ;
    if (totalItemsInGroup === 0) { // if objective had no children, just use standard gap
        currentYObjectiveOffset = objectiveNodeY + yGapObjective;
    }

  });


  plan.Strategy.forEach(objective => {
    objective.tactics.forEach(sourceTactic => {
      const sourceTacticNodeId = `tactic-${objective.id}-${sourceTactic.id}`;
      sourceTactic.dependencies.forEach(dep => {
        const targetTactic = objective.tactics.find(t => t.expected_artifact === dep);
        if (targetTactic && targetTactic.id !== sourceTactic.id) {
          const targetTacticNodeId = `tactic-${objective.id}-${targetTactic.id}`;
          edges.push({
            id: `e-${targetTacticNodeId}-dep-${sourceTacticNodeId}`,
            source: targetTacticNodeId, 
            target: sourceTacticNodeId,
            type: 'smoothstep',
            label: `dep: ${dep.substring(0,15)}...`,
            style: { stroke: '#EF5350', strokeWidth: 1.5, fontSize: '0.7em' }, 
            animated: false,
          });
        }
      });
    });
  });

  return { nodes, edges };
}

