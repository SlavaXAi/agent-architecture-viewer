// Pixel-sensitive zoom, without the library's minimum 5% wheel step.
export function wheelZoomLog(event, pageHeight = 600) {
  const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1);
  if (!Number.isFinite(pixels)) return 0;
  return Math.max(-.045, Math.min(.045, -pixels * (event.ctrlKey ? .002 : .0007)));
}

export function zoomScale(scale, logDelta) {
  return Math.min(2, Math.max(.35, scale * Math.exp(Math.max(-.06, Math.min(.06, logDelta)))));
}

export function installCanvasGestures(container, graph, schedule = requestAnimationFrame, cancel = cancelAnimationFrame) {
  let frame = null, delta = 0, cursor = null, gestureStart = null;
  const flush = () => {
    frame = null;
    const next = zoomScale(graph.zoom(), delta); delta = 0;
    if (cursor) graph.zoomTo(next, { center: graph.clientToGraph(cursor) });
  };
  const wheel = event => {
    if (gestureStart !== null || !event.deltaY) return;
    event.preventDefault(); event.stopPropagation();
    delta += wheelZoomLog(event, container.clientHeight);
    cursor = { x: event.clientX, y: event.clientY };
    if (frame === null) frame = schedule(flush);
  };
  // WebKit exposes the Mac pinch as gesture events rather than Ctrl+wheel.
  const gesture = event => {
    event.preventDefault(); event.stopPropagation();
    if (event.type === 'gesturestart') {
      if (frame !== null) cancel(frame);
      frame = null; delta = 0; gestureStart = graph.zoom();
    } else if (event.type === 'gestureend') gestureStart = null;
    else if (gestureStart !== null && Number.isFinite(event.scale) && event.scale > 0) {
      const next = Math.min(2, Math.max(.35, gestureStart * Math.pow(event.scale, .45)));
      graph.zoomTo(next, { center: graph.clientToGraph({ x: event.clientX, y: event.clientY }) });
    }
  };
  container.addEventListener('wheel', wheel, { passive: false });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) container.addEventListener(type, gesture, { passive: false });
  return () => {
    if (frame !== null) cancel(frame);
    container.removeEventListener('wheel', wheel);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) container.removeEventListener(type, gesture);
  };
}
