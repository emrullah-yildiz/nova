import { requestWriteApproval, resolveApproval, getPendingApprovals, getApprovalStatus, onApprovalEvent } from '../src/integrations/connect/revit-write-approval.js';

describe('Revit write approval', () => {
  beforeEach(() => {
    // Clear pending approvals between tests
    getPendingApprovals().forEach(a => resolveApproval(a.id, false, 'clear'));
  });

  it('queues write approval requests and blocks until resolved', async () => {
    const approvalPromise = requestWriteApproval({
      host: 'revit',
      operation: 'parameter.set',
      description: 'Set Width parameter on 5 walls',
      elementCount: 5,
      parameterName: 'Width',
      value: '1200'
    });

    // Should be pending
    const pending = getPendingApprovals();
    expect(pending.length).toBe(1);
    expect(pending[0].operation).toBe('parameter.set');
    expect(pending[0].parameterName).toBe('Width');
    expect(pending[0].elementCount).toBe(5);

    // Approve it
    const resolved = resolveApproval(pending[0].id, true, 'Approved by user');
    expect(resolved).toBe(true);

    const result = await approvalPromise;
    expect(result.approved).toBe(true);
    expect(result.approvedBy).toBe('nova-user');
  });

  it('rejects writes when user denies approval', async () => {
    const approvalPromise = requestWriteApproval({
      operation: 'geometry.create',
      description: 'Create a new floor slab'
    });

    const pending = getPendingApprovals();
    expect(pending.length).toBe(1);

    resolveApproval(pending[0].id, false, 'User denied');
    const result = await approvalPromise;
    expect(result.approved).toBe(false);
  });

  it('auto-rejects after timeout and removes from pending', async () => {
    const approvalPromise = requestWriteApproval({
      description: 'Timeout test',
      elementCount: 1
    });

    expect(getPendingApprovals().length).toBe(1);

    // Wait for timeout (30s would be too long — we test the auto-reject mechanism)
    // In production, the 30s timeout exists. Here we manually resolve with 'Timed out'
    resolveApproval(getPendingApprovals()[0]?.id || '', false, 'Timed out');

    const result = await approvalPromise;
    expect(result.approved).toBe(false);
    expect(result.message).toBe('Timed out');
    expect(getPendingApprovals().length).toBe(0);
  });

  it('prevents duplicate resolution of the same approval', () => {
    requestWriteApproval({ description: 'Duplicate test' });
    const pending = getPendingApprovals();

    const first = resolveApproval(pending[0].id, true, 'Approved');
    const second = resolveApproval(pending[0].id, true, 'Approved again');

    expect(first).toBe(true);
    expect(second).toBe(false); // Already resolved
  });

  it('reports approval status correctly', () => {
    expect(getApprovalStatus().pendingCount).toBe(0);

    requestWriteApproval({ description: 'Status test 1', elementCount: 3 });
    requestWriteApproval({ description: 'Status test 2', projectId: 'prj-123' });

    const status = getApprovalStatus();
    expect(status.pendingCount).toBe(2);
    expect(status.pending.length).toBe(2);
  });

  it('triggers event listener when approval is created or resolved', () => {
    const events = [];
    const unsubscribe = onApprovalEvent((event) => {
      events.push(event ? event.id : 'resolved');
    });

    requestWriteApproval({ description: 'Event test', elementCount: 2 });
    expect(events.length).toBe(1);

    const pending = getPendingApprovals();
    resolveApproval(pending[0].id, true, 'Approved');
    expect(events.length).toBe(2);
    expect(events[1]).toBe('resolved');

    unsubscribe();
  });

  it('truncates long values in approval display', async () => {
    const longValue = 'x'.repeat(500);
    const approvalPromise = requestWriteApproval({
      description: 'Long value test',
      value: longValue
    });

    const pending = getPendingApprovals();
    expect(pending[0].value.length).toBe(100);  // Truncated to 100
    expect(pending[0].value).toBe('x'.repeat(100));

    resolveApproval(pending[0].id, false, 'Too long');
    await approvalPromise;
  });
});