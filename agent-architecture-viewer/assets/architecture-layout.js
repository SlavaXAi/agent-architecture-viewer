// A reusable presentation template for one specialist. It never invents edges.
export function layoutSingleAgent(nodes, edges) {
  const agents = nodes.filter(node => node.kind === 'agent');
  const inputs = nodes.filter(node => node.kind === 'input');
  const outputs = nodes.filter(node => node.kind === 'output');
  const resources = nodes.filter(node => node.kind === 'resource');
  const tools = nodes.filter(node => node.kind === 'tool');
  if (agents.length !== 1 || inputs.length > 1 || outputs.length > 1 || resources.length > 4 || tools.length > 8 || agents.length + inputs.length + outputs.length + resources.length + tools.length !== nodes.length) {
    throw new Error('Use a grouped layout for multiple agents or more than eight tools.');
  }
  const agent = agents[0], input = inputs[0], output = outputs[0];
  const writerEdges = edges.filter(edge => tools.some(tool => tool.id === edge.source.cell) && edge.target.cell === output?.id && edge.kind === 'data');
  if (writerEdges.length > 1 || edges.some(edge => !(
    edge.source.cell === input?.id && edge.target.cell === agent.id && edge.kind === 'data' ||
    resources.some(node => node.id === edge.source.cell) && edge.target.cell === agent.id && edge.kind === 'resource' ||
    edge.source.cell === agent.id && tools.some(node => node.id === edge.target.cell) && edge.kind === 'tool' ||
    edge.source.cell === agent.id && edge.target.cell === output?.id && edge.kind === 'data' ||
    writerEdges.includes(edge)
  ))) throw new Error('This graph needs its own layout; keep all original connections.');
  const writer = writerEdges[0]?.source.cell;
  const orderedTools = [...tools.filter(node => node.id !== writer), ...tools.filter(node => node.id === writer)];
  const cardWidth = 188, cardHeight = 120, gap = 26;
  const toolSpan = orderedTools.length * cardWidth + Math.max(0, orderedTools.length - 1) * gap;
  const resourceSpan = resources.length * 200 + Math.max(0, resources.length - 1) * 56;
  const width = Math.max(860, toolSpan, resourceSpan), center = width / 2;
  const agentY = resources.length ? 174 : 70, agentHeight = 144;
  const maxDepth = Math.max(0, Math.floor((orderedTools.length - 1) / 2));
  const toolY = agentY + agentHeight + 44 + maxDepth * 24;
  const basicPorts = () => ['left', 'right', 'top', 'bottom'].map(side => ({ id: side, group: side }));
  const placed = nodes.map(node => {
    let x, y, w = cardWidth, h = cardHeight, ports = basicPorts();
    if (node.kind === 'agent') {
      w = 252; h = agentHeight; x = center - w / 2; y = agentY;
      ports = basicPorts().filter(port => ['left', 'right'].includes(port.group)).concat(
        orderedTools.map(tool => ({ id: 'tool-' + tool.id, group: 'bottom' })),
        resources.map(resource => ({ id: 'resource-' + resource.id, group: 'top' })),
      );
    } else if (node.kind === 'resource') {
      w = 200; h = 112; x = (width - resourceSpan) / 2 + resources.indexOf(node) * 256; y = 28;
    } else if (node.kind === 'tool') {
      x = orderedTools.length === 1 ? node.id === writer ? width - cardWidth : center - cardWidth / 2 : orderedTools.indexOf(node) * (width - cardWidth) / (orderedTools.length - 1); y = toolY;
      if (node.id === writer) {
        // Two separate terminals: the agent call and the saved result must not overlap.
        ports = ports.map(port => port.id === 'top' ? { ...port, args: { dx: cardWidth / 4 } } : port);
        ports.push({ id: 'invoke', group: 'top', args: { dx: -cardWidth / 2 } });
      }
    } else {
      x = node.kind === 'input' ? 0 : width - cardWidth;
      y = agentY + (agentHeight - h) / 2;
    }
    return { ...node, x, y, width: w, height: h, ports };
  });
  const byId = new Map(placed.map(node => [node.id, node]));
  const point = terminal => {
    const node = byId.get(terminal.cell), port = node.ports.find(item => item.id === terminal.port);
    const siblings = node.ports.filter(item => item.group === port.group);
    const ratio = (siblings.indexOf(port) + .5) / siblings.length;
    return {
      x: node.x + (port.group === 'left' ? 0 : port.group === 'right' ? node.width : Math.round(node.width * ratio)) + (port.args?.dx || 0),
      y: node.y + (port.group === 'top' ? 0 : port.group === 'bottom' ? node.height : Math.round(node.height * ratio)) + (port.args?.dy || 0),
    };
  };
  const routed = edges.map(edge => {
    let source, target, vertices = [];
    if (edge.kind === 'resource') {
      source = { cell: edge.source.cell, port: 'bottom' }; target = { cell: agent.id, port: 'resource-' + edge.source.cell };
      const start = point(source), end = point(target), lane = (start.y + end.y) / 2;
      vertices = [{ x: start.x, y: lane }, { x: end.x, y: lane }];
    } else if (edge.kind === 'tool') {
      source = { cell: agent.id, port: 'tool-' + edge.target.cell };
      target = { cell: edge.target.cell, port: edge.target.cell === writer ? 'invoke' : 'top' };
      const index = orderedTools.findIndex(node => node.id === edge.target.cell);
      const lane = agentY + agentHeight + 20 + Math.min(index, orderedTools.length - 1 - index) * 24;
      const start = point(source), end = point(target);
      vertices = [{ x: start.x, y: lane }, { x: end.x, y: lane }];
    } else if (edge.source.cell === writer) {
      source = { cell: writer, port: 'top' }; target = { cell: output.id, port: 'bottom' };
    } else {
      source = { cell: edge.source.cell, port: 'right' }; target = { cell: edge.target.cell, port: 'left' };
    }
    return { ...edge, source, target, vertices, router: 'normal' };
  });
  return { nodes: placed, edges: routed, width, height: toolY + cardHeight };
}
