import { describe, expect, it } from 'vitest';

import { createBidWindow, instantAssign } from '../../../src/lib/server/services/bidding';
import { manualAssignDriverToAssignment } from '../../../src/lib/server/services/assignments';

import { pool } from '../harness/db';
import { withScenarioEvidence } from '../harness/diagnostics';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';

import { assertAtMostOneWinningBidForWindow } from '../invariants/idempotency';
import {
	assertNoCrossOrgAssignmentLeakage,
	assertNoCrossOrgBidWinnerLeakage,
	assertNoCrossOrgNotificationLeakage
} from '../invariants/tenantIsolation';

describe('ADV-003 (adversarial)', () => {
	const h = useIntegrationHarness();

	it('resolves manager override vs first-accept race without split-brain state', async () => {
		await withScenarioEvidence({
			scenarioId: 'ADV-003',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T11:00:00.000Z');

				const assignmentId = 'a0030000-0000-4000-8000-000000000003';
				await pool.query(
					`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
					 VALUES ($1, $2, $3, $4, $5, $6);`,
					[
						assignmentId,
						baseline.route.a.id,
						baseline.warehouse.a.id,
						'2026-03-10',
						'unfilled',
						null
					]
				);

				const windowResult = await createBidWindow(assignmentId, {
					organizationId: baseline.org.a.id,
					mode: 'emergency',
					trigger: 'manager',
					allowPastShift: true
				});
				expect(windowResult.success).toBe(true);
				const bidWindowId = windowResult.bidWindowId;

				const [instantResult, managerResult] = await Promise.all([
					instantAssign(assignmentId, baseline.user.driverA1.id, bidWindowId!, baseline.org.a.id),
					manualAssignDriverToAssignment({
						assignmentId,
						driverId: baseline.user.driverA2.id,
						actorId: baseline.user.managerA.id,
						organizationId: baseline.org.a.id
					})
				]);

				const assignment = await pool.query<{
					status: string;
					user_id: string | null;
					assigned_by: string | null;
				}>(
					`SELECT status, user_id, assigned_by
					 FROM assignments
					 WHERE id = $1
					 LIMIT 1;`,
					[assignmentId]
				);
				const window = await pool.query<{ status: string; winner_id: string | null }>(
					`SELECT status, winner_id
					 FROM bid_windows
					 WHERE id = $1
					 LIMIT 1;`,
					[bidWindowId]
				);
				const wonBids = await pool.query<{ user_id: string }>(
					`SELECT user_id
					 FROM bids
					 WHERE bid_window_id = $1
						AND status = 'won'
					 ORDER BY user_id ASC;`,
					[bidWindowId]
				);

				expect(assignment.rows[0]).toBeTruthy();
				expect(window.rows[0]).toBeTruthy();

				const assignmentRow = assignment.rows[0]!;
				const windowRow = window.rows[0]!;

				expect(assignmentRow.status).toBe('scheduled');
				expect(windowRow.status).toBe('resolved');

				if (assignmentRow.assigned_by === 'bid') {
					expect(assignmentRow.user_id).toBe(baseline.user.driverA1.id);
					expect(windowRow.winner_id).toBe(baseline.user.driverA1.id);
					expect(instantResult.instantlyAssigned).toBe(true);
					expect(managerResult).toMatchObject({ ok: false, code: 'assignment_not_assignable' });
					expect(wonBids.rows).toEqual([{ user_id: baseline.user.driverA1.id }]);
				} else {
					expect(assignmentRow.assigned_by).toBe('manager');
					expect(assignmentRow.user_id).toBe(baseline.user.driverA2.id);
					expect(windowRow.winner_id).toBeNull();
					expect(managerResult).toMatchObject({ ok: true, driverId: baseline.user.driverA2.id });
					expect(instantResult.instantlyAssigned).toBe(false);
					expect(instantResult.error).toMatch(
						/route already assigned|unable to accept shift right now/i
					);
					expect(wonBids.rows).toEqual([]);
				}

				await assertAtMostOneWinningBidForWindow({ bidWindowId: bidWindowId! });
				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
			}
		});
	});
});
