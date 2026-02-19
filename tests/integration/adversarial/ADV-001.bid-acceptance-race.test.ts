import { describe, expect, it } from 'vitest';

import { createBidWindow, instantAssign } from '../../../src/lib/server/services/bidding';

import { pool } from '../harness/db';
import { withScenarioEvidence } from '../harness/diagnostics';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';

import {
	assertAssignmentAssigned,
	assertBidWindowResolved
} from '../invariants/assignmentIntegrity';
import { assertAtMostOneWinningBidForWindow } from '../invariants/idempotency';
import {
	assertNoCrossOrgAssignmentLeakage,
	assertNoCrossOrgBidWinnerLeakage,
	assertNoCrossOrgNotificationLeakage
} from '../invariants/tenantIsolation';

describe('ADV-001 (adversarial)', () => {
	const h = useIntegrationHarness();

	it('keeps first-accept winner deterministic under near-simultaneous accepts', async () => {
		await withScenarioEvidence({
			scenarioId: 'ADV-001',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T10:00:00.000Z');

				const assignmentId = 'a0010000-0000-4000-8000-000000000001';
				await pool.query(
					`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
					 VALUES ($1, $2, $3, $4, $5, $6);`,
					[
						assignmentId,
						baseline.route.a.id,
						baseline.warehouse.a.id,
						'2026-03-11',
						'unfilled',
						null
					]
				);

				const windowResult = await createBidWindow(assignmentId, {
					organizationId: baseline.org.a.id,
					mode: 'instant',
					trigger: 'manager'
				});

				expect(windowResult.success).toBe(true);
				const bidWindowId = windowResult.bidWindowId;
				expect(bidWindowId).toBeTruthy();

				const [acceptA, acceptB] = await Promise.all([
					instantAssign(assignmentId, baseline.user.driverA1.id, bidWindowId!, baseline.org.a.id),
					instantAssign(assignmentId, baseline.user.driverA2.id, bidWindowId!, baseline.org.a.id)
				]);

				const successful = [acceptA, acceptB].filter((result) => result.instantlyAssigned);
				const failed = [acceptA, acceptB].filter((result) => !result.instantlyAssigned);

				expect(successful).toHaveLength(1);
				expect(failed).toHaveLength(1);
				expect(failed[0]?.error).toMatch(
					/route already assigned|unable to accept shift right now/i
				);

				const winnerDriverId = acceptA.instantlyAssigned
					? baseline.user.driverA1.id
					: baseline.user.driverA2.id;

				await assertAssignmentAssigned({
					assignmentId,
					expectedDriverId: winnerDriverId
				});
				await assertBidWindowResolved({
					bidWindowId: bidWindowId!,
					expectedWinnerId: winnerDriverId
				});

				await assertAtMostOneWinningBidForWindow({ bidWindowId: bidWindowId! });

				const wonBids = await pool.query<{ user_id: string }>(
					`SELECT user_id
					 FROM bids
					 WHERE bid_window_id = $1
						AND status = 'won';`,
					[bidWindowId]
				);
				expect(wonBids.rows).toEqual([{ user_id: winnerDriverId }]);

				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
			}
		});
	});
});
