import { describe, expect, it } from 'vitest';

import { createRequestEvent } from '../../harness/requestEvent';
import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';
import {
	assertNoCrossOrgAssignmentLeakage,
	assertNoCrossOrgBidWinnerLeakage,
	assertNoCrossOrgNotificationLeakage
} from '../invariants/tenantIsolation';

import { POST as submitBid } from '../../../src/routes/api/bids/+server';
import { POST as overrideAssignment } from '../../../src/routes/api/assignments/[id]/override/+server';
import { PATCH as patchDispatchSettings } from '../../../src/routes/api/settings/dispatch/+server';
import { GET as getHistory } from '../../../src/routes/api/history/+server';

const ORG_A_ASSIGNMENT_ID = '2db5f319-f309-4e18-9afe-6a911999aa11';
const ORG_B_ASSIGNMENT_ID = 'f4250bb7-ea10-4e48-8ecb-db7f9f995892';
const ORG_A_WINDOW_ID = '7c04e0cd-df7d-48fd-aaf0-2fdd570ed9c0';
const ORG_B_WINDOW_ID = 'f50aff7d-1519-4486-be47-d14745f5fbe5';

function createUser(
	role: 'manager' | 'driver',
	id: string,
	organizationId: string
): App.Locals['user'] {
	return {
		id,
		role,
		name: `${role}-${id}`,
		email: `${id}@integration.test`,
		organizationId
	} as App.Locals['user'];
}

async function seedBidAndOverrideFixtures(
	h: ReturnType<typeof useIntegrationHarness>
): Promise<void> {
	const baseline = h.baseline;

	await pool.query(
		`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
		 VALUES ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12);`,
		[
			ORG_A_ASSIGNMENT_ID,
			baseline.route.a.id,
			baseline.warehouse.a.id,
			'2026-03-18',
			'scheduled',
			baseline.user.driverA2.id,
			ORG_B_ASSIGNMENT_ID,
			baseline.route.b.id,
			baseline.warehouse.b.id,
			'2026-03-18',
			'scheduled',
			baseline.user.driverB1.id
		]
	);

	await pool.query(
		`INSERT INTO bid_windows (id, assignment_id, mode, trigger, pay_bonus_percent, opens_at, closes_at, status)
		 VALUES
		 ($1, $2, $3, $4, $5, $6, $7, $8),
		 ($9, $10, $11, $12, $13, $14, $15, $16);`,
		[
			ORG_A_WINDOW_ID,
			ORG_A_ASSIGNMENT_ID,
			'instant',
			'manager',
			20,
			new Date(Date.now() - 60_000),
			new Date(Date.now() + 3 * 60 * 60 * 1000),
			'open',
			ORG_B_WINDOW_ID,
			ORG_B_ASSIGNMENT_ID,
			'instant',
			'manager',
			20,
			new Date(Date.now() - 60_000),
			new Date(Date.now() + 3 * 60 * 60 * 1000),
			'open'
		]
	);
}

describe('API-002/API-003/API-004/API-005 (smoke)', () => {
	const h = useIntegrationHarness();

	it('API-002: driver accepts in-org bid window and cannot bid into foreign org', async () => {
		const baseline = h.baseline;
		await seedBidAndOverrideFixtures(h);

		const allowedEvent = createRequestEvent({
			method: 'POST',
			body: { assignmentId: ORG_A_ASSIGNMENT_ID },
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('driver', baseline.user.driverA1.id, baseline.org.a.id)
			}
		}) as Parameters<typeof submitBid>[0];

		const allowedResponse = await submitBid(allowedEvent);
		expect(allowedResponse.status).toBe(200);

		const payload = await allowedResponse.json();
		expect(payload).toMatchObject({
			success: true,
			status: 'won',
			assignmentId: ORG_A_ASSIGNMENT_ID
		});

		const assigned = await pool.query<{ user_id: string | null; status: string }>(
			`SELECT user_id, status
			 FROM assignments
			 WHERE id = $1
			 LIMIT 1;`,
			[ORG_A_ASSIGNMENT_ID]
		);
		expect(assigned.rows[0]).toMatchObject({
			user_id: baseline.user.driverA1.id,
			status: 'scheduled'
		});

		const deniedEvent = createRequestEvent({
			method: 'POST',
			body: { assignmentId: ORG_B_ASSIGNMENT_ID },
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('driver', baseline.user.driverA1.id, baseline.org.a.id)
			}
		}) as Parameters<typeof submitBid>[0];

		await expect(submitBid(deniedEvent)).rejects.toMatchObject({ status: 404 });

		await assertNoCrossOrgAssignmentLeakage();
		await assertNoCrossOrgBidWinnerLeakage();
		await assertNoCrossOrgNotificationLeakage();
	});

	it('API-003: manager override is org-scoped with explicit foreign-org denial', async () => {
		const baseline = h.baseline;
		await seedBidAndOverrideFixtures(h);

		const allowedEvent = createRequestEvent({
			method: 'POST',
			params: { id: ORG_A_ASSIGNMENT_ID },
			body: { action: 'suspend_route' },
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('manager', baseline.user.managerA.id, baseline.org.a.id)
			}
		}) as Parameters<typeof overrideAssignment>[0];

		const allowedResponse = await overrideAssignment(allowedEvent);
		expect(allowedResponse.status).toBe(200);

		const allowedPayload = await allowedResponse.json();
		expect(allowedPayload).toMatchObject({
			action: 'suspend_route',
			assignment: {
				id: ORG_A_ASSIGNMENT_ID,
				status: 'cancelled',
				userId: null
			}
		});

		const deniedEvent = createRequestEvent({
			method: 'POST',
			params: { id: ORG_B_ASSIGNMENT_ID },
			body: { action: 'suspend_route' },
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('manager', baseline.user.managerA.id, baseline.org.a.id)
			}
		}) as Parameters<typeof overrideAssignment>[0];

		const deniedResponse = await overrideAssignment(deniedEvent);
		expect(deniedResponse.status).toBe(403);

		await assertNoCrossOrgAssignmentLeakage();
		await assertNoCrossOrgBidWinnerLeakage();
		await assertNoCrossOrgNotificationLeakage();
	});

	it('API-004: dispatch settings updates stay tenant-bound', async () => {
		const baseline = h.baseline;

		await pool.query(
			`UPDATE organizations
			 SET owner_user_id = CASE
				WHEN id = $1 THEN $2
				WHEN id = $3 THEN $4
				ELSE owner_user_id
			 END,
			 updated_at = now();`,
			[baseline.org.a.id, baseline.user.managerA.id, baseline.org.b.id, baseline.user.managerB.id]
		);

		const patchAllowedEvent = createRequestEvent({
			method: 'PATCH',
			body: {
				emergencyBonusPercent: 35,
				rewardMinAttendancePercent: 91,
				correctiveCompletionThresholdPercent: 94
			},
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('manager', baseline.user.managerA.id, baseline.org.a.id)
			}
		}) as Parameters<typeof patchDispatchSettings>[0];

		const patchAllowedResponse = await patchDispatchSettings(patchAllowedEvent);
		expect(patchAllowedResponse.status).toBe(200);

		const settingsResult = await pool.query<{
			organization_id: string;
			emergency_bonus_percent: number;
			reward_min_attendance_percent: number;
			corrective_completion_threshold_percent: number;
		}>(
			`SELECT organization_id,
					emergency_bonus_percent,
					reward_min_attendance_percent,
					corrective_completion_threshold_percent
			 FROM organization_dispatch_settings
			 ORDER BY organization_id;`
		);

		expect(settingsResult.rows).toEqual([
			{
				organization_id: baseline.org.a.id,
				emergency_bonus_percent: 35,
				reward_min_attendance_percent: 91,
				corrective_completion_threshold_percent: 94
			},
			{
				organization_id: baseline.org.b.id,
				emergency_bonus_percent: 20,
				reward_min_attendance_percent: 95,
				corrective_completion_threshold_percent: 98
			}
		]);

		const patchDeniedEvent = createRequestEvent({
			method: 'PATCH',
			body: {
				emergencyBonusPercent: 10,
				rewardMinAttendancePercent: 70,
				correctiveCompletionThresholdPercent: 70
			},
			locals: {
				organizationId: baseline.org.b.id,
				user: createUser('manager', baseline.user.managerA.id, baseline.org.a.id)
			}
		}) as Parameters<typeof patchDispatchSettings>[0];

		await expect(patchDispatchSettings(patchDeniedEvent)).rejects.toMatchObject({ status: 403 });

		await assertNoCrossOrgAssignmentLeakage();
		await assertNoCrossOrgBidWinnerLeakage();
		await assertNoCrossOrgNotificationLeakage();
	});

	it('API-005: history timeline stays scoped to the signed-in driver tenant', async () => {
		const baseline = h.baseline;

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id, confirmed_at)
			 VALUES
			 ($1, $2, $3, $4, $5, $6, $7),
			 ($8, $9, $10, $11, $12, $13, $14);`,
			[
				'2fe9b9ac-d992-441e-b639-bf9f88207d36',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-10',
				'completed',
				baseline.user.driverA1.id,
				new Date('2026-03-10T11:00:00.000Z'),
				'f8f112f7-2eb2-4a32-bf8d-b77203f6f77f',
				baseline.route.b.id,
				baseline.warehouse.b.id,
				'2026-03-10',
				'completed',
				baseline.user.driverB1.id,
				new Date('2026-03-10T11:00:00.000Z')
			]
		);

		const driverAEvent = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/history?offset=0&limit=10',
			locals: {
				organizationId: baseline.org.a.id,
				user: createUser('driver', baseline.user.driverA1.id, baseline.org.a.id)
			}
		}) as Parameters<typeof getHistory>[0];

		const driverAResponse = await getHistory(driverAEvent);
		expect(driverAResponse.status).toBe(200);
		const driverAHistory = (await driverAResponse.json()) as {
			history: Array<{ id: string }>;
		};
		expect(driverAHistory.history.map((entry) => entry.id)).toEqual([
			'2fe9b9ac-d992-441e-b639-bf9f88207d36'
		]);

		const driverBEvent = createRequestEvent({
			method: 'GET',
			url: 'http://localhost/api/history?offset=0&limit=10',
			locals: {
				organizationId: baseline.org.b.id,
				user: createUser('driver', baseline.user.driverB1.id, baseline.org.b.id)
			}
		}) as Parameters<typeof getHistory>[0];

		const driverBResponse = await getHistory(driverBEvent);
		expect(driverBResponse.status).toBe(200);
		const driverBHistory = (await driverBResponse.json()) as {
			history: Array<{ id: string }>;
		};
		expect(driverBHistory.history.map((entry) => entry.id)).toEqual([
			'f8f112f7-2eb2-4a32-bf8d-b77203f6f77f'
		]);

		await assertNoCrossOrgAssignmentLeakage();
		await assertNoCrossOrgBidWinnerLeakage();
		await assertNoCrossOrgNotificationLeakage();
	});
});
