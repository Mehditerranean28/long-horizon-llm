
"use client";

import React, { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { DeepResearchNodeData } from '@/types/action-io-types';
import { getExampleMissionPlanAsDocument, transformMissionPlanToFlowData } from '@/lib/mission-plan-parser';

interface DeepResearchVisualizerProps {
  initialNodes: Node<DeepResearchNodeData>[];
  initialEdges: Edge[];
}

const Flow = ({ initialNodes, initialEdges }: DeepResearchVisualizerProps) => {
  const isMockMode = !process.env.NEXT_PUBLIC_SOVEREIGN_API_URL;
  const { nodes: mockNodes, edges: mockEdges } = useMemo(() => {
    const plan = getExampleMissionPlanAsDocument('Mock mission');
    return transformMissionPlanToFlowData(plan);
  }, []);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes && initialNodes.length > 0
      ? initialNodes
      : isMockMode
        ? mockNodes
        : []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges && initialEdges.length > 0
      ? initialEdges
      : isMockMode
        ? mockEdges
        : []
  );
  const { fitView } = useReactFlow();
  
  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Update nodes and edges when props change or when entering mock mode
  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      setNodes(initialNodes);
    } else if (isMockMode) {
      setNodes(mockNodes);
    } else {
      setNodes([]);
    }
  }, [initialNodes, setNodes, isMockMode, mockNodes]);

  useEffect(() => {
    if (initialEdges && initialEdges.length > 0) {
      setEdges(initialEdges);
    } else if (isMockMode) {
      setEdges(mockEdges);
    } else {
      setEdges([]);
    }
  }, [initialEdges, setEdges, isMockMode, mockEdges]);

  useEffect(() => {
    if (nodes.length > 0) {
      fitView();
    }
  }, [nodes, edges, fitView]);


  return (
    <div style={{ height: '100%', width: '100%' }} className="bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        attributionPosition="bottom-left"
        nodesDraggable={true}
        edgesUpdatable={true}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}

export function DeepResearchVisualizer(props: DeepResearchVisualizerProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
    
