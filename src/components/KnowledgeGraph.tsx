import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Search, X, Settings2, Globe, Crosshair, Plus } from 'lucide-react';
import type { GraphNode, GraphLink, Tag, ThemeName } from '../types';

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  currentFilePath: string;
  tags?: Tag[];
  theme?: ThemeName;
  /** 点击幽灵节点里的「创建笔记」按钮（App 落一篇同名空笔记并打开） */
  onCreateGhost?: (title: string) => void;
}

// ============ 设置（持久化到 localStorage） ============

type ColorMode = 'tag' | 'folder';
interface GraphSettings {
  /** 显示未解析链接的幽灵节点 */
  showGhost: boolean;
  /** 节点着色：按标签 / 按文件夹 */
  colorMode: ColorMode;
  /** 局部图深度（跳数） */
  depth: 1 | 2;
  /** 斥力（d3 charge 强度取负，越大节点越散） */
  repel: number;
  /** 连接距离 */
  linkDistance: number;
}

const SETTINGS_KEY = 'kb.graph.settings.v1';
const SETTINGS_DEFAULTS: GraphSettings = {
  showGhost: true,
  colorMode: 'tag',
  depth: 1,
  repel: 120,
  linkDistance: 60,
};

function loadSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* 损坏就回默认 */ }
  return SETTINGS_DEFAULTS;
}

// ============ 配色 ============

const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

/** 主题相关的连线/强调色（画布上的 canvas 颜色读不到 CSS 变量，按主题给常量） */
const THEME_COLORS: Record<string, { link: string; ghostLink: string; accent: string; hover: string; ghost: string; file: string }> = {
  light: { link: '#d0d0d6', ghostLink: 'rgba(107,114,128,0.28)', accent: '#4f46e5', hover: '#818cf8', ghost: 'rgba(107,114,128,0.45)', file: '#8b95a5' },
  dark:  { link: '#333852', ghostLink: 'rgba(129,137,176,0.22)', accent: '#7aa2f7', hover: '#89b4fa', ghost: 'rgba(129,137,176,0.40)', file: '#64708c' },
  sepia: { link: '#d9cdb2', ghostLink: 'rgba(140,120,90,0.28)', accent: '#b45309', hover: '#d97706', ghost: 'rgba(140,120,90,0.45)', file: '#a08d6b' },
};

/** 文件夹着色：路径哈希 → 色板（同一文件夹恒定同色） */
function folderColor(path: string | undefined): string {
  const dir = (path || '').split('/').slice(0, -1).join('/') || '/';
  let h = 0;
  for (let i = 0; i < dir.length; i++) h = (h * 31 + dir.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

// ============ 组件 ============

export const KnowledgeGraph = ({ nodes, links, onNodeClick, currentFilePath, tags = [], theme = 'light', onCreateGhost }: KnowledgeGraphProps) => {
  const [hoveredNode, setHoveredNode] = React.useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [mode, setMode] = useState<'global' | 'local'>('global');
  const [settings, setSettings] = useState<GraphSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedGhost, setSelectedGhost] = useState<GraphNode | null>(null);
  const fgRef = useRef<any>(null);

  const palette = THEME_COLORS[theme] || THEME_COLORS.light;

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* 忽略 */ }
  }, [settings]);

  // 标签 → 颜色（着色模式为「按标签」时用）
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

  // 无向邻接表（局部图 BFS 用；力导向图里连线本来就没有方向感）
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    const touch = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a)!.add(b);
    };
    links.forEach(l => {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      touch(String(s), String(t));
      touch(String(t), String(s));
    });
    return adj;
  }, [links]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    // 幽灵节点开关（局部/全局都生效）
    if (!settings.showGhost) result = result.filter(n => n.kind !== 'ghost');
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
    // 局部图：从当前笔记 BFS depth 跳
    if (mode === 'local') {
      const centerId = nodes.find(n => n.path === currentFilePath)?.id;
      if (!centerId) return [];
      const visited = new Set<string>([centerId]);
      let frontier = [centerId];
      for (let d = 0; d < settings.depth; d++) {
        const next: string[] = [];
        frontier.forEach(id => {
          adjacency.get(id)?.forEach(nb => {
            if (!visited.has(nb)) { visited.add(nb); next.push(nb); }
          });
        });
        frontier = next;
      }
      result = result.filter(n => visited.has(n.id));
    }
    return result;
  }, [nodes, query, activeTag, tags, currentFilePath, mode, settings.showGhost, settings.depth, adjacency]);

  const visibleIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);
  const filteredLinks = useMemo(
    () => links.filter(l => {
      const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
      const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
      return visibleIds.has(String(s)) && visibleIds.has(String(t));
    }),
    [links, visibleIds]
  );

  // 力参数：每次渲染都顺手对齐（graphData 变化重建仿真后也要生效），开销可忽略
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-settings.repel);
    fg.d3Force('link')?.distance(settings.linkDistance);
  });

  // 局部图切换后把视野收拢到邻域上
  useEffect(() => {
    if (mode !== 'local' || filteredNodes.length === 0) return;
    const timer = setTimeout(() => {
      try { fgRef.current?.zoomToFit(320, 48); } catch { /* 仿真未就绪就算了 */ }
    }, 420);
    return () => clearTimeout(timer);
  }, [mode, settings.depth, currentFilePath, filteredNodes.length]);

  const nodeColor = useCallback((node: GraphNode) => {
    if (node.kind === 'ghost') return selectedGhost?.id === node.id ? palette.accent : palette.ghost;
    if (node.path === currentFilePath) return palette.accent;
    if (node.kind === 'file') return palette.file;
    if (hoveredNode === node.id) return palette.hover;
    if (settings.colorMode === 'folder') return folderColor(node.path);
    return String(nodeTagColor.get(node.path || '') || node.group || palette.file);
  }, [currentFilePath, hoveredNode, nodeTagColor, palette, settings.colorMode, selectedGhost]);

  const nodeVal = useCallback((node: GraphNode) => (node.kind === 'ghost' ? 0.4 : node.kind === 'file' ? 0.55 : 1), []);
  const linkColor = useCallback((l: GraphLink) => (l.ghost ? palette.ghostLink : palette.link), [palette]);
  const linkWidth = useCallback((l: GraphLink) => (l.ghost ? 1 : 2), []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.kind === 'ghost') {
      setSelectedGhost(prev => (prev?.id === node.id ? null : node));
      return;
    }
    setSelectedGhost(null);
    onNodeClick(node);
  }, [onNodeClick]);

  if (nodes.length === 0) {
    return (
      <div className="knowledge-graph-empty">
        <p>暂无关联笔记</p>
        <p className="hint">正文里用 [[双链]] 和 #标签 就能把笔记连起来</p>
      </div>
    );
  }

  return (
    <div className="knowledge-graph">
      <div className="graph-controls">
        <div className="graph-toolbar">
          <div className="graph-mode" role="tablist">
            <button
              className={`graph-mode-btn ${mode === 'global' ? 'active' : ''}`}
              onClick={() => { setMode('global'); setSelectedGhost(null); }}
              title="全部笔记"
            ><Globe size={11} /> 全局</button>
            <button
              className={`graph-mode-btn ${mode === 'local' ? 'active' : ''}`}
              onClick={() => { setMode('local'); setSelectedGhost(null); }}
              title="当前笔记的邻域"
            ><Crosshair size={11} /> 局部</button>
          </div>
          <div className="graph-search">
            <Search size={12} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选节点…"
            />
            {query && <button className="graph-clear" onClick={() => setQuery('')}><X size={12} /></button>}
          </div>
          <button
            className={`graph-settings-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="图谱设置"
          ><Settings2 size={13} /></button>
        </div>

        {showSettings && (
          <>
            <div className="graph-settings-overlay" onClick={() => setShowSettings(false)} />
            <div className="graph-settings">
              <label className="graph-settings-row">
                <span>着色</span>
                <select
                  value={settings.colorMode}
                  onChange={(e) => setSettings(s => ({ ...s, colorMode: e.target.value as ColorMode }))}
                >
                  <option value="tag">按标签</option>
                  <option value="folder">按文件夹</option>
                </select>
              </label>
              <label className="graph-settings-row">
                <span>局部图深度</span>
                <select
                  value={settings.depth}
                  onChange={(e) => setSettings(s => ({ ...s, depth: Number(e.target.value) as 1 | 2 }))}
                >
                  <option value={1}>1 跳</option>
                  <option value={2}>2 跳</option>
                </select>
              </label>
              <label className="graph-settings-row graph-settings-check">
                <input
                  type="checkbox"
                  checked={settings.showGhost}
                  onChange={(e) => setSettings(s => ({ ...s, showGhost: e.target.checked }))}
                />
                <span>显示未解析链接（幽灵节点）</span>
              </label>
              <label className="graph-settings-row">
                <span>斥力 {settings.repel}</span>
                <input
                  type="range" min={20} max={300} step={10}
                  value={settings.repel}
                  onChange={(e) => setSettings(s => ({ ...s, repel: Number(e.target.value) }))}
                />
              </label>
              <label className="graph-settings-row">
                <span>连线距离 {settings.linkDistance}</span>
                <input
                  type="range" min={20} max={200} step={5}
                  value={settings.linkDistance}
                  onChange={(e) => setSettings(s => ({ ...s, linkDistance: Number(e.target.value) }))}
                />
              </label>
            </div>
          </>
        )}
      </div>

      {mode === 'local' && !nodes.some(n => n.path === currentFilePath) && (
        <div className="graph-local-hint">当前文件不是可入图的笔记（仅 Markdown 参与图谱），先切到一篇笔记再点「局部」。</div>
      )}

      <div className="graph-canvas">
        <ForceGraph2D
          ref={fgRef}
          graphData={{ nodes: filteredNodes, links: filteredLinks }}
          nodeId="id"
          nodeLabel="name"
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={16}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          onNodeHover={(node) => setHoveredNode(node?.id || null)}
          onNodeClick={(node) => {
            if (node) handleNodeClick(node as GraphNode);
          }}
          onBackgroundClick={() => setSelectedGhost(null)}
          backgroundColor="transparent"
        />
      </div>

      {selectedGhost && (
        <div className="graph-actions">
          <span className="graph-actions-label">「{selectedGhost.name}」还没创建</span>
          <button className="graph-actions-create" onClick={() => {
            onCreateGhost?.(selectedGhost.name);
            setSelectedGhost(null);
          }}><Plus size={11} /> 创建笔记</button>
          <button className="graph-actions-dismiss" onClick={() => setSelectedGhost(null)}><X size={11} /></button>
        </div>
      )}

      {tagColorList.length > 0 && settings.colorMode === 'tag' && (
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
              <button className="legend-clear" onClick={() => setActiveTag(null)}>清除筛选</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
