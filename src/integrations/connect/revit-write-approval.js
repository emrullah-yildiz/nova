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
    const client = createNovaCloudClient();
    if (!client.isAuthenticated()) {
      // Silently skip audit if not authenticated (local/dev mode)
      return null;
    }
    const payload = {
      host: options.host || 'revit',
      operation: options.operation || 'parameter.set',
      ok: operationResult && operationResult.ok === true,
      metadata: {
        elementCount: options.elementCount || 0,
        elementIds: options.elementIds ? options.elementIds.slice(0, 20) : [],
        parameterName: options.parameterName || '',
        description: options.description || '',
        approved: operationResult && operationResult.approved === true,
        approvedBy: operationResult && operationResult.approvedBy || ''
      }
    };
    if (options.projectId) payload.projectId = options.projectId;
    return await client.recordHostOperation(payload);
  } catch (err) {
    console.warn('[RevitWrite] Failed to record audit event:', err.message);
    return null;
  }
}

export function getApprovalStatus() {
  return {
    pendingCount: pendingApprovals.size,
    pending: getPendingApprovals()
  };
}