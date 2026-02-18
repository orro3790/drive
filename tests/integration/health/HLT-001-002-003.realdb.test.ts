import { describe, expect, it } from 'vitest';

import { detectNoShowsForOrganization } from '../../../src/lib/server/services/noshow';
import {
	runDailyHealthEvaluation,
	runWeeklyHealthEvaluation
} from '../../../src/lib/server/services/health';

import { PATCH } from '../../../src/routes/api/drivers/[id]/+server';

import { createRequestEvent } from '../../harness/requestEvent';
import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';
import {
	assertNoCrossOrgHealthNotificationLeakage,
	assertNoCrossOrgNoShowNotificationLeakage
} from '../invariants/tenantIsolation';

describe('HLT-001/HLT-002/HLT-003 (real-db)', () => {
	const h = useIntegrationHarness();

	it('HLT-001: daily scoring is org-scoped with deterministic score/streak state', async () => {
		const baseline = h.baseline;
		freezeTime('2026-03-10T16:00:00.000Z');

		await pool.query(
			`UPDATE driver_metrics
			 SET total_shifts = 1,
			 	 attendance_rate = 1,
			 	 completion_rate = 1
			 WHERE user_id IN ($1, $2);`,
			[baseline.user.driverA1.id, baseline.user.driverB1.id]
		);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id, confirmed_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
			[
				'588ec54f-7a59-4994-bec8-b9e6e5fb3d24',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-10',
				'completed',
				baseline.user.driverA1.id,
				new Date('2026-03-10T11:00:00.000Z')
			]
		);

		await pool.query(
			`INSERT INTO shifts (
				id,
				assignment_id,
				arrived_at,
				parcels_start,
				parcels_returned,
				parcels_delivered,
				completed_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7);`,
			[
				'42ef8ad2-fd43-4866-a392-c198bc60cb52',
				'588ec54f-7a59-4994-bec8-b9e6e5fb3d24',
				new Date('2026-03-10T12:30:00.000Z'),
				100,
				2,
				98,
				new Date('2026-03-10T15:00:00.000Z')
			]
		);

		const daily = await runDailyHealthEvaluation(baseline.org.a.id);
		expect(daily).toMatchObject({ evaluated: 2, scored: 1, skippedNewDrivers: 1, errors: 0 });

		const snapshots = await pool.query<{ user_id: string; score: number }>(
			`SELECT user_id, score
			 FROM driver_health_snapshots
			 ORDER BY user_id;`
		);
		expect(snapshots.rows).toEqual([{ user_id: baseline.user.driverA1.id, score: 6 }]);

		const orgBState = await pool.query<{
			current_score: number;
			stars: number;
			streak_weeks: number;
		}>(
			`SELECT current_score, stars, streak_weeks
			 FROM driver_health_state
			 WHERE user_id = $1
			 LIMIT 1;`,
			[baseline.user.driverB1.id]
		);
		expect(orgBState.rows[0]).toMatchObject({ current_score: 0, stars: 0, streak_weeks: 0 });

		await assertNoCrossOrgHealthNotificationLeakage();
	});

	it('HLT-002: weekly evaluation advances streak/stars on qualifying week', async () => {
		const baseline = h.baseline;
		freezeTime('2026-03-16T12:00:00.000Z');

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id, confirmed_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
			[
				'eadf0b21-abf9-4314-a22c-4e6bdbfcf0ec',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-10',
				'completed',
				baseline.user.driverA1.id,
				new Date('2026-03-10T11:00:00.000Z')
			]
		);

		await pool.query(
			`INSERT INTO shifts (id, assignment_id, parcels_start, parcels_returned, parcels_delivered, completed_at)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				'4fbeb752-d4cc-48c8-89ed-d4f0266aa86e',
				'eadf0b21-abf9-4314-a22c-4e6bdbfcf0ec',
				100,
				2,
				98,
				new Date('2026-03-10T15:00:00.000Z')
			]
		);

		const weekly = await runWeeklyHealthEvaluation(baseline.org.a.id);
		expect(weekly).toMatchObject({ evaluated: 2, qualified: 1, hardStopResets: 0, neutral: 1 });

		const state = await pool.query<{
			stars: number;
			streak_weeks: number;
			assignment_pool_eligible: boolean;
		}>(
			`SELECT stars, streak_weeks, assignment_pool_eligible
			 FROM driver_health_state
			 WHERE user_id = $1
			 LIMIT 1;`,
			[baseline.user.driverA1.id]
		);
		expect(state.rows[0]).toMatchObject({
			stars: 1,
			streak_weeks: 1,
			assignment_pool_eligible: true
		});

		await assertNoCrossOrgHealthNotificationLeakage();
	});

	it('HLT-003: hard-stop provenance + manager reinstatement keeps eligibility without new events', async () => {
		const baseline = h.baseline;

		await pool.query(
			`UPDATE driver_metrics
			 SET total_shifts = 2,
			 	 attendance_rate = 0.9,
			 	 completion_rate = 0.95
			 WHERE user_id = $1;`,
			[baseline.user.driverA1.id]
		);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id, confirmed_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
			[
				'3f91a9bc-a8af-4200-beb0-9f89f8f1df3d',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-10',
				'scheduled',
				baseline.user.driverA1.id,
				new Date('2026-03-10T11:00:00.000Z')
			]
		);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id, confirmed_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7);`,
			[
				'f7d40942-9995-45e5-9314-086eb3a7e683',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-11',
				'completed',
				baseline.user.driverA1.id,
				new Date('2026-03-11T11:00:00.000Z')
			]
		);

		await pool.query(
			`INSERT INTO shifts (id, assignment_id, parcels_start, parcels_returned, parcels_delivered, completed_at)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				'54381570-bf2e-4eb2-8d1b-1245ecdd53f8',
				'f7d40942-9995-45e5-9314-086eb3a7e683',
				100,
				1,
				99,
				new Date('2026-03-11T15:00:00.000Z')
			]
		);

		freezeTime('2026-03-10T13:30:00.000Z');
		const noShow = await detectNoShowsForOrganization(baseline.org.a.id);
		expect(noShow.bidWindowsCreated).toBe(1);

		const hardStopState = await pool.query<{
			assignment_pool_eligible: boolean;
			requires_manager_intervention: boolean;
		}>(
			`SELECT assignment_pool_eligible, requires_manager_intervention
			 FROM driver_health_state
			 WHERE user_id = $1
			 LIMIT 1;`,
			[baseline.user.driverA1.id]
		);
		expect(hardStopState.rows[0]).toMatchObject({
			assignment_pool_eligible: false,
			requires_manager_intervention: true
		});

		freezeTime('2026-03-10T14:00:00.000Z');
		const reinstateEvent = createRequestEvent({
			method: 'PATCH',
			params: { id: baseline.user.driverA1.id },
			body: { reinstate: true },
			locals: {
				organizationId: baseline.org.a.id,
				user: {
					id: baseline.user.managerA.id,
					role: 'manager',
					name: 'Manager A',
					email: 'manager.a@integration.test',
					organizationId: baseline.org.a.id
				} as App.Locals['user']
			}
		}) as Parameters<typeof PATCH>[0];

		const reinstateResponse = await PATCH(reinstateEvent);
		expect(reinstateResponse.status).toBe(200);

		const reinstatedState = await pool.query<{
			assignment_pool_eligible: boolean;
			requires_manager_intervention: boolean;
			reinstated_at: Date | null;
		}>(
			`SELECT assignment_pool_eligible, requires_manager_intervention, reinstated_at
			 FROM driver_health_state
			 WHERE user_id = $1
			 LIMIT 1;`,
			[baseline.user.driverA1.id]
		);
		expect(reinstatedState.rows[0].assignment_pool_eligible).toBe(true);
		expect(reinstatedState.rows[0].requires_manager_intervention).toBe(false);
		expect(reinstatedState.rows[0].reinstated_at).toBeTruthy();

		const daily = await runDailyHealthEvaluation(baseline.org.a.id);
		expect(daily).toMatchObject({ evaluated: 2, scored: 1, skippedNewDrivers: 1, errors: 0 });

		freezeTime('2026-03-16T12:00:00.000Z');
		const weekly = await runWeeklyHealthEvaluation(baseline.org.a.id);
		expect(weekly.hardStopResets).toBe(1);

		const finalState = await pool.query<{
			assignment_pool_eligible: boolean;
			requires_manager_intervention: boolean;
		}>(
			`SELECT assignment_pool_eligible, requires_manager_intervention
			 FROM driver_health_state
			 WHERE user_id = $1
			 LIMIT 1;`,
			[baseline.user.driverA1.id]
		);
		expect(finalState.rows[0]).toMatchObject({
			assignment_pool_eligible: true,
			requires_manager_intervention: false
		});

		await assertNoCrossOrgNoShowNotificationLeakage(baseline.org.a.id);
		await assertNoCrossOrgHealthNotificationLeakage();
	});
});
