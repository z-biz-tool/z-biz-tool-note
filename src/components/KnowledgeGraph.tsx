import React from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphNode, GraphLink } from '../types';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  currentFilePath: string;
}

export const KnowledgeGraph = ({ nodes, links, onNodeClick, currentFilePath }: KnowledgeGraphProps) => {
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);

  if (nodes.length === 0) {
    return (
      <div className="knowledge-graph-empty">
        <p>No connections found</p>
        <p className="hint">Use [[wiki links]] in your notes to create connections</p>
      </div>
    );
  }

  return (
    <div className="knowledge-graph">
      <ForceGraph2D
        graphData={{ nodes, links }}
        nodeId="id"
        nodeLabel="name"
        nodeColor={(node: GraphNode) => {
          if (node.path === currentFilePath) return '#4f46e5';
          if (hoveredNode === node.id) return '#818cf8';
          return '#6b7280';
        }}
        nodeRelSize={16}
        linkColor="#d1d5db"
        linkWidth={2}
        onNodeHover={(node) => setHoveredNode(node?.id || null)}
        onNodeClick={(node) => {
          if (node) {
            onNodeClick(node as GraphNode);
          }
        }}
        backgroundColor="transparent"
      />
      <div className="graph-legend">
        <div className="legend-item">
          <span className="legend-dot current"></span>
          <span>Current Note</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot"></span>
          <span>Linked Notes</span>
        </div>
      </div>
    </div>
  );
};
