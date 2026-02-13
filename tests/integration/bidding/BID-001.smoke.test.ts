import { describe, expect, it } from 'vitest';

import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';

import {
	assertAssignmentAssigned,
	assertBidWindowResolved
} from '../invariants/assignmentIntegrity';
import {
	assertNoCrossOrgAssignmentLeakage,
	assertNoCrossOrgBidWinnerLeakage,
	assertNoCrossOrgNotificationLeakage
} from '../invariants/tenantIsolation';

import { createBidWindow, instantAssign } from '../../../src/lib/server/services/bidding';

describe('BID-001 (smoke)', () => {
	const h = useIntegrationHarness();

	it('creates an instant bid window and assigns a single winner (org-scoped)', async () => {
		const baseline = h.baseline;
		freezeTime('2026-03-10T10:00:00.000Z'); // 06:00 Toronto (DST)

		const assignmentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[assignmentId, baseline.route.a.id, baseline.warehouse.a.id, '2026-03-11', 'unfilled', null]
		);

		const windowResult = await createBidWindow(assignmentId, {
			organizationId: baseline.org.a.id
		});

		expect(windowResult.success).toBe(true);
		expect(windowResult.bidWindowId).toEqual(expect.any(String));
		expect(windowResult.notifiedCount).toBe(2);

		const notificationsResult = await pool.query<{
			type: string;
			user_id: string;
			organization_id: string | null;
		}>(`SELECT type, user_id, organization_id FROM notifications ORDER BY user_id;`);

		expect(notificationsResult.rows).toEqual([
			{
				type: 'bid_open',
				user_id: baseline.user.driverA1.id,
				organization_id: baseline.org.a.id
			},
			{
				type: 'bid_open',
				user_id: baseline.user.driverA2.id,
				organization_id: baseline.org.a.id
			}
		]);

		await assertNoCrossOrgNotificationLeakage();

		const instantResult = await instantAssign(
			assignmentId,
			baseline.user.driverA1.id,
			windowResult.bidWindowId!,
			baseline.org.a.id
		);
		expect(instantResult.instantlyAssigned).toBe(true);

		await assertAssignmentAssigned({
			assignmentId,
			expectedDriverId: baseline.user.driverA1.id
		});
		await assertBidWindowResolved({
			bidWindowId: windowResult.bidWindowId!,
			expectedWinnerId: baseline.user.driverA1.id
		});
		await assertNoCrossOrgAssignmentLeakage();
		await assertNoCrossOrgBidWinnerLeakage();

		const bids = await pool.query<{
			status: string;
			user_id: string;
			bid_window_id: string;
		}>(
			`SELECT status, user_id, bid_window_id
			 FROM bids
			 ORDER BY bid_at ASC;`
		);
		expect(bids.rows).toEqual([
			{
				status: 'won',
				user_id: baseline.user.driverA1.id,
				bid_window_id: windowResult.bidWindowId!
			}
		]);
	});
});
