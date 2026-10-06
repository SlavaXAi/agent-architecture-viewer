import { Graph, Shape, History, Snapline } from '@antv/x6';
import { readCanvasState, hasConnectionDraft } from './canvas-state.js';

// Reusable visual adapter. No model, provider, API, storage or product dependencies.
Shape.HTML.register({
  shape: 'agent-architecture-card',
  html: cell => cell.getData().render(),
});

export function createCanvas({ container, nodes, edges, renderNode, initialState = null, editableLayout = true, editableConnections = false, routeEdge = null, onSelectNode = () => {}, onChange = () => {}, colors = {} }) {
  const color = { accent: '#3b82f6', line: '#7b8493', surface: '#fff', ...colors };
  const restored = readCanvasState(initialState, nodes, edges);
  let loading = true, disposed = false, selectedNode = null, selectedEdge = null, scheduled = null;
  const graph = new Graph({
    container, autoResize: true, async: false, clickThreshold: 4,
    grid: { size: 18, visible: false },
    panning: { enabled: true, eventTypes: ['leftMouseDown', 'mouseWheelDown'] },
    mousewheel: { enabled: true, minScale: .35, maxScale: 2, zoomAtMousePosition: true, factor: 1.15 },
    scaling: { min: .35, max: 2 },
    connecting: {
      snap: { radius: 24 }, highlight: true, allowBlank: false, allowLoop: false, allowNode: false, allowEdge: false, allowMulti: 'withPort',
      connectionPoint: 'anchor',
      // Existing edges can be reconnected; dragging a bare port does not create new logic.
      validateMagnet: () => false,
      validateConnection: ({ sourceCell, targetCell, sourcePort, targetPort }) => Boolean(editableConnections && sourceCell && targetCell && sourceCell.id !== targetCell.id && sourcePort && targetPort),
    },
    interacting: { nodeMovable: editableLayout, edgeMovable: false, arrowheadMovable: editableConnections, vertexMovable: editableConnections, vertexAddable: editableConnections, vertexDeletable: editableConnections },
  });
  // Host apps often size all icon SVGs globally; the graph needs the full viewport.
  const svg = container.querySelector('.x6-graph-svg');
  if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
  const history = new History({ enabled: false, stackSize: 60, beforeAddCommand: (_event, args) => ['position', 'source', 'target', 'vertices'].includes(args.key) });
  graph.use(history); graph.use(new Snapline({ enabled: true, sharp: true, tolerance: 8 }));
  const groups = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(side => [side, { position: side, attrs: { circle: { r: 4, magnet: true, stroke: color.accent, fill: color.surface, strokeWidth: 1.2 } } }]));
  for (const node of nodes) graph.addNode({
    id: node.id, shape: 'agent-architecture-card', x: restored?.positions[node.id]?.x ?? node.x, y: restored?.positions[node.id]?.y ?? node.y,
    width: node.width, height: node.height, zIndex: 2,
    data: { render: () => renderNode(node) }, ports: { groups, items: node.ports },
  });
  const baseEdges = edges.map(edge => {
    const route = routeEdge?.(edge, graph.getNodes());
    return { ...edge, vertices: route?.vertices || [], router: route?.router || { name: 'manhattan', args: { step: 12, padding: 18, maxLoopCount: 2000 } } };
  });
  for (const edge of baseEdges) {
    const stored = restored?.links[edge.id];
    const changedTerminal = stored && (JSON.stringify(stored.source) !== JSON.stringify(edge.source) || JSON.stringify(stored.target) !== JSON.stringify(edge.target));
    const vertices = stored?.vertices.length || changedTerminal ? stored.vertices : edge.vertices;
    graph.addEdge({
      id: edge.id, source: stored?.source || edge.source, target: stored?.target || edge.target, vertices,
      zIndex: 1, router: edge.router, connector: { name: 'rounded', args: { radius: 10 } },
      data: { kind: edge.kind, label: edge.label },
      attrs: { line: { stroke: color.line, strokeWidth: 1.3, strokeDasharray: edge.kind === 'resource' ? '4 5' : null, targetMarker: { name: 'classic', size: 6 }, sourceMarker: edge.kind === 'tool' ? { name: 'classic', size: 6 } : null }, wrap: { strokeWidth: 16 } },
    });
  }
  function snapshot() {
    const translation = graph.translate(), scaling = graph.scale();
    return {
      version: 2, viewport: { x: translation.tx, y: translation.ty, scale: scaling.sx },
      positions: Object.fromEntries(graph.getNodes().map(node => [node.id, node.position()])),
      links: Object.fromEntries(graph.getEdges().map(edge => [edge.id, { source: { cell: edge.getSourceCellId(), port: edge.getSourcePortId() }, target: { cell: edge.getTargetCellId(), port: edge.getTargetPortId() }, vertices: edge.getVertices().map(point => ({ x: point.x, y: point.y })) }])),
    };
  }
  function emit() {
    if (loading || disposed) return;
    const state = snapshot(); onChange(state, { scale: state.viewport.scale, draft: hasConnectionDraft(state, baseEdges), canUndo: history.canUndo(), canRedo: history.canRedo() });
  }
  function queueChange() {
    if (loading || disposed) return;
    if (scheduled !== null) clearTimeout(scheduled);
    scheduled = setTimeout(() => { scheduled = null; emit(); }, 80);
  }
  function decorate() {
    for (const edge of graph.getEdges()) {
      const focus = edge.id === selectedEdge || selectedNode && [edge.getSourceCellId(), edge.getTargetCellId()].includes(selectedNode);
      edge.attr('line/stroke', focus ? color.accent : color.line, { uiDecoration: true });
      edge.attr('line/strokeWidth', focus ? 1.8 : 1.3, { uiDecoration: true });
    }
  }
  function selectNode(id) {
    selectedNode = id; selectedEdge = null;
    for (const edge of graph.getEdges()) edge.removeTools();
    decorate();
  }
  function selectEdge(edge) {
    container.focus({ preventScroll: true });
    selectedEdge = edge.id; selectedNode = null;
    for (const item of graph.getEdges()) item.removeTools();
    if (editableConnections) edge.addTools([
      { name: 'vertices', args: { snapRadius: 16, attrs: { r: 5, fill: color.surface, stroke: color.accent, strokeWidth: 2 } } },
      { name: 'segments', args: { snapRadius: 16, attrs: { width: 18, height: 7, x: -9, y: -3.5, rx: 3.5, fill: color.surface, stroke: color.accent, strokeWidth: 1.5 } } },
      { name: 'source-arrowhead', args: { tagName: 'circle', attrs: { r: 7, fill: color.accent, stroke: color.surface, strokeWidth: 2, cursor: 'crosshair' } } },
      { name: 'target-arrowhead', args: { tagName: 'circle', attrs: { r: 7, fill: color.accent, stroke: color.surface, strokeWidth: 2, cursor: 'crosshair' } } },
    ]);
    decorate();
  }
  function fit() {
    graph.zoomToFit({ padding: { top: 75, left: 40, right: 40, bottom: 35 }, maxScale: 1, minScale: .35 });
    queueChange();
  }
  graph.on('node:click', ({ node }) => { selectNode(node.id); onSelectNode(node.id); });
  graph.on('edge:click', ({ edge }) => selectEdge(edge));
  graph.on('blank:click', () => { container.focus({ preventScroll: true }); selectedNode = null; selectedEdge = null; for (const edge of graph.getEdges()) edge.removeTools(); decorate(); });
  graph.on('node:change:position', queueChange);
  graph.on('edge:change:vertices', queueChange);
  graph.on('edge:connected', () => { decorate(); queueChange(); });
  graph.on('scale', queueChange); graph.on('translate', queueChange);
  history.on('change', queueChange);
  if (restored?.viewport) { graph.zoomTo(restored.viewport.scale); graph.translate(restored.viewport.x, restored.viewport.y); } else fit();
  history.enable(); loading = false; emit();
  return {
    selectNode,
    zoom(direction) { graph.zoomTo(Math.min(2, Math.max(.35, graph.zoom() * (direction > 0 ? 1.2 : 1 / 1.2)))); emit(); },
    actualSize() { graph.zoomTo(1); emit(); }, fit,
    undo() { history.undo(); decorate(); emit(); }, redo() { history.redo(); decorate(); emit(); },
    moveNode(id, dx, dy) { if (editableLayout) graph.getCellById(id)?.translate(dx, dy); emit(); },
    pan(dx, dy) { graph.translateBy(dx, dy); emit(); },
    reset() {
      loading = true;
      for (const node of nodes) graph.getCellById(node.id)?.position(node.x, node.y);
      for (const edge of baseEdges) {
        const item = graph.getCellById(edge.id), route = routeEdge?.(edge, graph.getNodes());
        if (route) { edge.vertices = route.vertices || []; edge.router = route.router || edge.router; }
        item.setSource(edge.source); item.setTarget(edge.target); item.setRouter(edge.router); item.setVertices(edge.vertices); item.removeTools();
      }
      selectedEdge = null; history.clean(); decorate(); fit(); loading = false; emit();
    },
    snapshot,
    dispose() { if (disposed) return; if (scheduled !== null) clearTimeout(scheduled); emit(); disposed = true; graph.dispose(); },
  };
}
