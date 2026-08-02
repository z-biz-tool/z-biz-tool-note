import React, { useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Search, X } from 'lucide-react';
import type { GraphNode, GraphLink, Tag } from '../types';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  currentFilePath: string;
  tags?: Tag[];
}

// Color palette for tag-based clustering
const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

export const KnowledgeGraph = ({ nodes, links, onNodeClick, currentFilePath, tags = [] }: KnowledgeGraphProps) => {
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Map: nodePath -> first tag color (for clustering)
  const nodeTagColor = useMemo(() => {
    const map = new Map<string, string>();
    tags.forEach((t, i) => {
      const color = TAG_COLORS[i % TAG_COLORS.length];
      t.notes.forEach(p => {
        if (!map.has(p)) map.set(p, color);
      });
    });
    return map;
  }, [tags]);

  const tagColorList = useMemo(() => {
    return tags.map((t, i) => ({ name: t.name, color: TAG_COLORS[i % TAG_COLORS.length], count: t.count }));
  }, [tags]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(n => n.name.toLowerCase().includes(q));
    }
    if (activeTag) {
      const tag = tags.find(t => t.name === activeTag);
      if (tag) {
        const paths = new Set(tag.notes);
        result = result.filter(n => paths.has(n.path) || n.path === currentFilePath);
      }
    }
    return result;
  }, [nodes, query, activeTag, tags, currentFilePath]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredLinks = useMemo(
    () => links.filter(l => visibleIds.has(l.source as string) && visibleIds.has(l.target as string)),
    [links, visibleIds]
  );

  if (nodes.length === 0) {
    return (
      <div className="knowledge-graph-empty">
        <p>No connections found</p>
        <p className="hint">Use [[wiki links]] and #tags in your notes to create connections</p>
      </div>
    );
  }

  return (
    <div className="knowledge-graph">
      <div className="graph-controls">
        <div className="graph-search">
          <Search size={12} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter nodes..."
          />
          {query && <button className="graph-clear" onClick={() => setQuery('')}><X size={12} /></button>}
        </div>
      </div>

      <div className="graph-canvas">
        <ForceGraph2D
          graphData={{ nodes: filteredNodes, links: filteredLinks }}
          nodeId="id"
          nodeLabel="name"
          nodeColor={(node: GraphNode) => {
            if (node.path === currentFilePath) return '#4f46e5';
            if (hoveredNode === node.id) return '#818cf8';
            return nodeTagColor.get(node.path) || node.group || '#6b7280';
          }}
          nodeRelSize={16}
          linkColor="#d1d5db"
          linkWidth={2}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          onNodeHover={(node) => setHoveredNode(node?.id || null)}
          onNodeClick={(node) => {
            if (node) onNodeClick(node as GraphNode);
          }}
          backgroundColor="transparent"
        />
      </div>

      {tagColorList.length > 0 && (
        <div className="graph-legend">
          <div className="legend-row">
            <div className="legend-item">
              <span className="legend-dot current"></span>
              <span>Current</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot"></span>
              <span>Linked</span>
            </div>
          </div>
          <div className="legend-tags">
            {tagColorList.slice(0, 8).map(t => (
              <button
                key={t.name}
                className={`legend-tag ${activeTag === t.name ? 'active' : ''}`}
                onClick={() => setActiveTag(activeTag === t.name ? null : t.name)}
              >
                <span className="legend-dot" style={{ background: t.color }}></span>
                <span>{t.name}</span>
                <span className="legend-count">{t.count}</span>
              </button>
            ))}
            {activeTag && (
              <button className="legend-clear" onClick={() => setActiveTag(null)}>Clear filter</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
