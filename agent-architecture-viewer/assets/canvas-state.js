// Store only visual coordinates and connection geometry, never node content.
const finite = value => Number.isFinite(value) && Math.abs(value) <= 20000;
export function readCanvasState(raw, nodes, edges) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (![1, 2].includes(value?.version)) return null;
    const viewport = value.version === 1 ? value : value.viewport;
    const validViewport = viewport && [viewport.x, viewport.y, viewport.scale].every(finite) && viewport.scale > 0;
    const positions = Object.create(null), links = Object.create(null);
    const ids = new Map(nodes.map(node => [node.id, new Set(node.ports.map(port => port.id))]));
    for (const node of nodes) {
      const position = value.positions?.[node.id];
      if (position && finite(position.x) && finite(position.y)) positions[node.id] = { x: position.x, y: position.y };
    }
    const terminal = point => point && ids.get(point.cell)?.has(point.port) ? { cell: point.cell, port: point.port } : null;
    for (const edge of edges) {
      const link = value.links?.[edge.id], source = terminal(link?.source), target = terminal(link?.target);
      if (!source || !target || source.cell === target.cell) continue;
      const vertices = Array.isArray(link.vertices) ? link.vertices.slice(0, 80).filter(point => finite(point?.x) && finite(point?.y)).map(point => ({ x: point.x, y: point.y })) : [];
      links[edge.id] = { source, target, vertices };
    }
    return { version: 2, viewport: validViewport ? { x: viewport.x, y: viewport.y, scale: Math.min(2, Math.max(.35, viewport.scale)) } : null, positions, links };
  } catch { return null; }
}

export function hasConnectionDraft(state, edges) {
  return edges.some(edge => {
    const link = state?.links?.[edge.id];
    return link && (link.source.cell !== edge.source.cell || link.source.port !== edge.source.port || link.target.cell !== edge.target.cell || link.target.port !== edge.target.port || JSON.stringify(link.vertices) !== JSON.stringify(edge.vertices || []));
  });
}
