/**
 * Revit Write Approval Module
 *
 * Enforces end-to-end user approval before Revit write operations.
 * - Blocks writes by default (requires explicit user approval)
 * - Shows a confirmation dialog to the user
 * - Logs all writes as audit events via the enterprise API
 * - Provides an API for other parts of the app to request approval
 */

import { createNovaCloudClient } from '../../enterprise/cloud-client.js';

// Pending approvals queue
const pendingApprovals = new Map();
let approvalCounter = 0;

// The cloud client is created in cookie mode so it reuses the SPA's httpOnly
// session (same authority as the rest of the app). Overridable for tests.
let createClient = () => createNovaCloudClient({ useCookie: true });

/**
 * Test/override hook for the cloud-client factory. Returns a restore function.
 */
export function __setCloudClientFactory(factory) {
  const previous = createClient;
  createClient = factory;
  return () => { createClient = previous; };
}

/**
 * SEC-013: obtain a SERVER-ISSUED, single-use write-approval token scoped to
 * {operation, projectId, graphVersion}. This is the authoritative gate — the
 * browser cannot mint its own approval; only the enterprise backend can, after
 * a project-write authorization check.
 *
 * Graceful degrade (local-hub note): when there is no cloud session (pure
 * local, signed-out use against a paired local hub), there is no backend to
 * mint or audit a token. Rather than hard-breaking every local write, we return
 * a clearly-marked LOCAL token (`local: true`). This satisfies the add-in's
 * presence-check (defense-in-depth) and keeps the local read/write pilot usable
 * offline, while making explicit — here and in revit-connect.md — that
 * authoritative enforcement (server consume + audit-as-precondition) is only
 * active when the enterprise backend is present. A local token is NOT
 * server-verifiable and is never consumed/audited server-side.
 */
export async function issueWriteToken(options = {}) {
  const {
    host = 'revit',
    operation = 'parameter.set',
    projectId = '',
    graphVersion = ''
  } = options;

  let client;
  try {
    client = createClient();
  } catch (err) {
    client = null;
  }

  // No configured/authenticated backend → graceful local degrade.
  if (!client || !client.isConfigured() || !client.isAuthenticated() || typeof client.issueHostWriteApproval !== 'function') {
    return {
      token: 'local:' + host + ':' + operation + ':' + (approvalCounter + 1) + ':' + Date.now(),
      approvalId: '',
      operation,
      graphVersion,
      local: true
    };
  }

  const issued = await client.issueHostWriteApproval({ host, operation, projectId, graphVersion });
  return {
    token: issued && issued.token ? issued.token : '',
    approvalId: (issued && issued.approvalId) || '',
    operation: (issued && issued.operation) || operation,
    graphVersion: (issued && issued.graphVersion) || graphVersion,
    local: false
  };
}

/**
 * Request user approval for a Revit write operation.
 * Returns a promise that resolves with the approval result.
 */
export function requestWriteApproval(options = {}) {
  const {
    host = 'revit',
    operation = 'parameter.set',
    description = 'Modify Revit element parameters',
    elementCount = 0,
    elementIds = [],
    parameterName = '',
    value = ''
  } = options;

  return new Promise((resolve) => {
    approvalCounter++;
    const id = 'revit-write-' + approvalCounter;

    const approval = {
      id,
      host,
      operation,
      description,
      elementCount,
      elementIds,
      parameterName,
      value: typeof value === 'string' ? value.slice(0, 100) : String(value || '').slice(0, 100),
      status: 'pending',
      createdAt: Date.now(),
      resolve
    };

    pendingApprovals.set(id, approval);
    emitApprovalEvent(approval);

    // Auto-reject if no UI handler is registered within 30 seconds
    setTimeout(() => {
      const pending = pendingApprovals.get(id);
      if (pending && pending.status === 'pending') {
        resolveApproval(id, false, 'Timed out');
      }
    }, 30000);
  });
}

/**
 * Resolve a pending approval (called by the UI).
 */
export function resolveApproval(id, approved, message = '') {
  const approval = pendingApprovals.get(id);
  if (!approval || approval.status !== 'pending') return false;

  approval.status = approved ? 'approved' : 'rejected';
  approval.resolvedAt = Date.now();
  approval.message = message;

  approval.resolve({
    approved,
    id: approval.id,
    operation: approval.operation,
    description: approval.description,
    host: approval.host,
    approvedAt: approved ? Date.now() : null,
    approvedBy: approved ? 'nova-user' : '',
    scope: 'single-operation',
    message
  });

  pendingApprovals.delete(id);
  emitApprovalEvent(null); // Signal UI to refresh
  return true;
}

/**
 * Get all pending approvals.
 */
export function getPendingApprovals() {
  return Array.from(pendingApprovals.values())
    .filter(a => a.status === 'pending')
    .map(a => ({
      id: a.id,
      host: a.host,
      operation: a.operation,
      description: a.description,
      elementCount: a.elementCount,
      elementIds: a.elementIds.slice(0, 10),
      parameterName: a.parameterName,
      value: a.value,
      createdAt: a.createdAt
    }));
}

/**
 * Register a listener for approval events.
 * Returns an unsubscribe function.
 */
let approvalListeners = [];
export function onApprovalEvent(handler) {
  approvalListeners.push(handler);
  return () => {
    approvalListeners = approvalListeners.filter(h => h !== handler);
  };
}

function emitApprovalEvent(approval) {
  approvalListeners.forEach(h => h(approval));
}

/**
 * Record a host write operation as an audit event through the enterprise API.
 */
export async function recordHostAuditEvent(operationResult, options = {}) {
  try {
    const client = createClient();
    if (!client.isAuthenticated()) {
      // No cloud session → the authoritative consume/audit can't run (local
      // degrade). The write already went out under a local token; nothing to
      // report server-side.
      return null;
    }
    // SEC-013: this report is the AUTHORITATIVE CONSUME point. The server burns
    // the token (single-use) and writes the audit row as a precondition. A
    // local-only token has no server-side record, so don't bother reporting it.
    const token = options.token || '';
    if (!token || String(token).startsWith('local:')) return null;
    const payload = {
      host: options.host || 'revit',
      operation: options.operation || 'parameter.set',
      ok: operationResult && operationResult.ok === true,
      token,
      approvalId: options.approvalId || '',
      graphVersion: options.graphVersion || '',
      metadata: {
        elementCount: options.elementCount || 0,
        elementIds: options.elementIds ? options.elementIds.slice(0, 20) : [],
        parameterName: options.parameterName || '',
        description: options.description || ''
      }
    };
    if (options.projectId) payload.projectId = options.projectId;
    return await client.recordHostOperation(payload);
  } catch (err) {
    console.warn('[RevitWrite] Failed to record host operation (server consume):', err.message);
    return null;
  }
}

export function getApprovalStatus() {
  return {
    pendingCount: pendingApprovals.size,
    pending: getPendingApprovals()
  };
}