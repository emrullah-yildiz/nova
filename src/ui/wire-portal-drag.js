export const PORTAL_MIN_T = 0.02;
export const PORTAL_MAX_T = 0.98;
export const PORTAL_DEFAULT_IN_T = 0.12;
export const PORTAL_DEFAULT_OUT_T = 0.88;

export function startPortalDrag(options) {
  var dx = Number(options && options.dx) || 1;
  var dy = Number(options && options.dy) || 0;
  var dlen = Math.sqrt(dx * dx + dy * dy) || 1;
  var axis = { x: dx / dlen, y: dy / dlen };
  var key = String(options && options.key ? options.key : '');
  var startT = Number(options && options.startT);

  if (!Number.isFinite(startT)) {
    startT = key.endsWith(':in') ? PORTAL_DEFAULT_IN_T : PORTAL_DEFAULT_OUT_T;
  }

  return {
    key: key,
    axis: axis,
    startT: clampPortalT(startT),
    startPos: projectedPosition(options && options.clientX, options && options.clientY, axis),
    wireLength: Math.max(Number(options && options.wireLength) || 200, 0)
  };
}

export function movePortalDrag(state, clientX, clientY) {
  if (!state) return null;
  var pos = projectedPosition(clientX, clientY, state.axis);
  var delta = (pos - state.startPos) / Math.max(state.wireLength * 0.5, 80);
  return clampPortalT(state.startT + delta * 0.4);
}

export function clampPortalT(value) {
  var number = Number(value);
  if (!Number.isFinite(number)) return PORTAL_MIN_T;
  return Math.max(PORTAL_MIN_T, Math.min(PORTAL_MAX_T, number));
}

export function findPortalRingTarget(target, clientX, clientY, root) {
  var direct = target && typeof target.closest === 'function' ? target.closest('.portal-ring') : null;
  if (direct) return direct;
  if (!Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) return null;

  var scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelectorAll !== 'function') return null;

  var rings = Array.from(scope.querySelectorAll('.portal-ring'));
  for (var i = rings.length - 1; i >= 0; i--) {
    var rect = rings[i].getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return rings[i];
    }
  }

  return null;
}

function projectedPosition(clientX, clientY, axis) {
  return (Number(clientX) || 0) * axis.x + (Number(clientY) || 0) * axis.y;
}
