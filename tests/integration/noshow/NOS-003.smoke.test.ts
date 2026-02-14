import { describe, expect, it } from 'vitest';

import { detectNoShowsForOrganization } from '../../../src/lib/server/services/noshow';
import { toTorontoDateString } from '../../../src/lib/server/time/toronto';

import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';

import { assertNoCrossOrgNotificationLeakage } from '../invariants/tenantIsolation';

describe('NOS-003 (smoke)', () => {
	const h = useIntegrationHarness();

	it('detects a no-show and opens an emergency bid window (org-scoped)', async () => {
		const baseline = h.baseline;

		freezeTime('2026-03-10T15:30:00.000Z'); // 11:30 Toronto (DST) - after 09:00 route deadline
		const today = toTorontoDateString(new Date());

		const assignmentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
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
				assignmentId,
				baseline.route.a.id,
				baseline.warehouse.a.id,
				today,
				'scheduled',
				baseline.user.driverA1.id,
				new Date()
			]
		);

		const result = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(result.bidWindowsCreated).toBe(1);
		expect(result.managerAlertsSent).toBe(1);
		expect(result.errors).toBe(0);

		const window = await pool.query<{
			id: string;
			mode: string;
			status: string;
			assignment_id: string;
		}>(
			`SELECT id, mode, status, assignment_id
			 FROM bid_windows
			 ORDER BY opens_at DESC
			 LIMIT 1;`
		);
		expect(window.rows[0]).toMatchObject({
			mode: 'emergency',
			status: 'open',
			assignment_id: assignmentId
		});

		const assignment = await pool.query<{ status: string; user_id: string | null }>(
			`SELECT status, user_id FROM assignments WHERE id = $1 LIMIT 1;`,
			[assignmentId]
		);
		expect(assignment.rows[0]).toMatchObject({ status: 'unfilled', user_id: null });

		const types = await pool.query<{ type: string; user_id: string }>(
			`SELECT type, user_id FROM notifications ORDER BY type, user_id;`
		);
		expect(types.rows).toEqual([
			{ type: 'driver_no_show', user_id: baseline.user.managerA.id },
			{ type: 'emergency_route_available', user_id: baseline.user.driverA1.id },
			{ type: 'emergency_route_available', user_id: baseline.user.driverA2.id }
		]);

		await assertNoCrossOrgNotificationLeakage();
	});
});
