import { describe, expect, it } from 'vitest';

import { detectNoShowsForOrganization } from '../../../src/lib/server/services/noshow';
import { toTorontoDateString } from '../../../src/lib/server/time/toronto';

import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';
import {
	assertNoCrossOrgNoShowNotificationLeakage,
	assertNoCrossOrgNotificationLeakage
} from '../invariants/tenantIsolation';

async function insertConfirmedAssignment(params: {
	id: string;
	routeId: string;
	warehouseId: string;
	date: string;
	userId: string;
}): Promise<void> {
	await pool.query(
		`INSERT INTO assignments (
			id,
			route_id,
			warehouse_id,
			date,
			status,
			user_id,
			confirmed_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7);`,
		[
			params.id,
			params.routeId,
			params.warehouseId,
			params.date,
			'scheduled',
			params.userId,
			new Date()
		]
	);
}

describe('NOS-001/NOS-002/NOS-003 (real-db)', () => {
	const h = useIntegrationHarness();

	it('NOS-001: enforces per-route cutoff boundaries (pre/deadline/post)', async () => {
		const baseline = h.baseline;
		const routeEarlyId = '13fe9ec0-c188-49a7-8252-7f4e5fe3a5f5';

		await pool.query(
			`INSERT INTO routes (id, name, warehouse_id, manager_id, start_time, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				routeEarlyId,
				'Route A Early',
				baseline.warehouse.a.id,
				baseline.user.managerA.id,
				'08:30',
				baseline.user.managerA.id
			]
		);

		freezeTime('2026-03-10T12:29:00.000Z'); // 08:29 Toronto (DST)
		const today = toTorontoDateString(new Date());

		await insertConfirmedAssignment({
			id: '9ffde9ab-7284-45c2-99a4-c18f0ff4b75d',
			routeId: routeEarlyId,
			warehouseId: baseline.warehouse.a.id,
			date: today,
			userId: baseline.user.driverA1.id
		});
		await insertConfirmedAssignment({
			id: '9026833b-8ca1-4dd8-881d-59c6f817dc2b',
			routeId: baseline.route.a.id,
			warehouseId: baseline.warehouse.a.id,
			date: today,
			userId: baseline.user.driverA2.id
		});

		const beforeDeadline = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(beforeDeadline.bidWindowsCreated).toBe(0);

		freezeTime('2026-03-10T12:30:00.000Z'); // 08:30 Toronto
		const atEarlyDeadline = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(atEarlyDeadline.bidWindowsCreated).toBe(1);

		freezeTime('2026-03-10T13:01:00.000Z'); // 09:01 Toronto
		const afterDefaultDeadline = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(afterDefaultDeadline.bidWindowsCreated).toBe(1);

		const windows = await pool.query<{ route_id: string; mode: string; status: string }>(
			`SELECT a.route_id, bw.mode, bw.status
			 FROM bid_windows bw
			 INNER JOIN assignments a ON a.id = bw.assignment_id
			 ORDER BY a.route_id;`
		);
		expect(windows.rows).toEqual([
			{ route_id: baseline.route.a.id, mode: 'emergency', status: 'open' },
			{ route_id: routeEarlyId, mode: 'emergency', status: 'open' }
		]);
	});

	it('NOS-002: honors DST spring/fall boundary cutoffs with deterministic clocks', async () => {
		const baseline = h.baseline;

		freezeTime('2026-03-08T12:59:00.000Z'); // 08:59 Toronto (DST spring day)
		const springDate = toTorontoDateString(new Date());
		await insertConfirmedAssignment({
			id: '2f878f6c-8578-46fd-a817-3e1e2f04e889',
			routeId: baseline.route.a.id,
			warehouseId: baseline.warehouse.a.id,
			date: springDate,
			userId: baseline.user.driverA1.id
		});

		expect((await detectNoShowsForOrganization(baseline.org.a.id)).bidWindowsCreated).toBe(0);
		freezeTime('2026-03-08T13:01:00.000Z'); // 09:01 Toronto
		expect((await detectNoShowsForOrganization(baseline.org.a.id)).bidWindowsCreated).toBe(1);

		const springCount = await pool.query<{ count: number }>(
			`SELECT count(*)::int AS count FROM bid_windows WHERE trigger = 'no_show';`
		);
		expect(springCount.rows[0]?.count ?? 0).toBe(1);
	});

	it('NOS-002: honors DST fall boundary cutoffs with deterministic clocks', async () => {
		const baseline = h.baseline;

		freezeTime('2026-11-01T13:59:00.000Z'); // 08:59 Toronto (EST after fallback)
		const fallDate = toTorontoDateString(new Date());
		await insertConfirmedAssignment({
			id: '9d0c63f2-f3e0-4dc1-a34d-efc67f93065d',
			routeId: baseline.route.a.id,
			warehouseId: baseline.warehouse.a.id,
			date: fallDate,
			userId: baseline.user.driverA1.id
		});

		expect((await detectNoShowsForOrganization(baseline.org.a.id)).bidWindowsCreated).toBe(0);
		freezeTime('2026-11-01T14:01:00.000Z'); // 09:01 Toronto
		expect((await detectNoShowsForOrganization(baseline.org.a.id)).bidWindowsCreated).toBe(1);
	});

	it('NOS-003: persists org-specific emergency bonus and proves no-show tenant isolation', async () => {
		const baseline = h.baseline;
		freezeTime('2026-03-10T15:30:00.000Z'); // 11:30 Toronto (DST)
		const today = toTorontoDateString(new Date());

		await pool.query(
			`UPDATE organization_dispatch_settings
			 SET emergency_bonus_percent = CASE
				WHEN organization_id = $1 THEN 35
				WHEN organization_id = $2 THEN 5
				ELSE emergency_bonus_percent
			 END,
			 updated_at = now();`,
			[baseline.org.a.id, baseline.org.b.id]
		);

		await insertConfirmedAssignment({
			id: '852393ea-e7a3-4f00-a8ec-9ee9096f52ba',
			routeId: baseline.route.a.id,
			warehouseId: baseline.warehouse.a.id,
			date: today,
			userId: baseline.user.driverA1.id
		});

		const orgBBefore = await pool.query<{ windows: number; notifications: number }>(
			`SELECT
				(SELECT count(*)::int
				 FROM bid_windows bw
				 INNER JOIN assignments a ON a.id = bw.assignment_id
				 INNER JOIN warehouses w ON w.id = a.warehouse_id
				 WHERE w.organization_id = $1) AS windows,
				(SELECT count(*)::int
				 FROM notifications n
				 INNER JOIN "user" u ON u.id = n.user_id
				 WHERE u.organization_id = $1) AS notifications;`,
			[baseline.org.b.id]
		);

		const orgAResult = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(orgAResult.bidWindowsCreated).toBe(1);

		await insertConfirmedAssignment({
			id: '8fce2ec2-4fe5-4522-a02f-8f8277e5794e',
			routeId: baseline.route.b.id,
			warehouseId: baseline.warehouse.b.id,
			date: today,
			userId: baseline.user.driverB1.id
		});

		const orgBResult = await detectNoShowsForOrganization(baseline.org.b.id);
		expect(orgBResult.bidWindowsCreated).toBe(1);

		const windowBonuses = await pool.query<{ organization_id: string; pay_bonus_percent: number }>(
			`SELECT w.organization_id, bw.pay_bonus_percent
			 FROM bid_windows bw
			 INNER JOIN assignments a ON a.id = bw.assignment_id
			 INNER JOIN warehouses w ON w.id = a.warehouse_id
			 WHERE bw.trigger = 'no_show'
			 ORDER BY w.organization_id;`
		);
		expect(windowBonuses.rows).toEqual([
			{ organization_id: baseline.org.a.id, pay_bonus_percent: 35 },
			{ organization_id: baseline.org.b.id, pay_bonus_percent: 5 }
		]);

		const orgBAfter = await pool.query<{ windows: number; notifications: number }>(
			`SELECT
				(SELECT count(*)::int
				 FROM bid_windows bw
				 INNER JOIN assignments a ON a.id = bw.assignment_id
				 INNER JOIN warehouses w ON w.id = a.warehouse_id
				 WHERE w.organization_id = $1) AS windows,
				(SELECT count(*)::int
				 FROM notifications n
				 INNER JOIN "user" u ON u.id = n.user_id
				 WHERE u.organization_id = $1) AS notifications;`,
			[baseline.org.b.id]
		);
		expect((orgBAfter.rows[0]?.windows ?? 0) - (orgBBefore.rows[0]?.windows ?? 0)).toBe(1);
		expect((orgBAfter.rows[0]?.notifications ?? 0) - (orgBBefore.rows[0]?.notifications ?? 0)).toBe(
			2
		);

		const orgARecipients = await pool.query<{ type: string; user_id: string }>(
			`SELECT type, user_id
			 FROM notifications
			 WHERE organization_id = $1
			 ORDER BY type, user_id;`,
			[baseline.org.a.id]
		);
		expect(orgARecipients.rows).toEqual([
			{ type: 'driver_no_show', user_id: baseline.user.managerA.id },
			{ type: 'emergency_route_available', user_id: baseline.user.driverA1.id },
			{ type: 'emergency_route_available', user_id: baseline.user.driverA2.id }
		]);

		await assertNoCrossOrgNoShowNotificationLeakage(baseline.org.a.id);
		await assertNoCrossOrgNoShowNotificationLeakage(baseline.org.b.id);
		await assertNoCrossOrgNotificationLeakage();
	});
});
