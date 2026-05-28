export function shouldStartRectSelection(app, event) {
  if (!event || event.button !== 0 || event.altKey) return false;
  if (app && app._portalDragActive) return false;

  var target = event.target;
  if (!target || typeof target.closest !== 'function') return true;

  return !(
    target.closest('.portal-ring') ||
    target.closest('.node') ||
    target.closest('.canvas-toolbar') ||
    target.closest('.canvas-zoom') ||
    target.closest('.ws-chat-panel') ||
    target.closest('.node-library')
  );
}

export function shouldCancelRectSelection(app) {
  return !!(app && (app.isPanning || app.draggingNode || app.connectingWire || app._portalDragActive));
}
