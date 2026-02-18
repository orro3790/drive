import { describe, expect, it } from 'vitest';

import {
	canDriverTakeAssignment,
	generateWeekSchedule,
	getDriverWeeklyAssignmentCount
} from '../../../src/lib/server/services/scheduling';

import { pool } from '../harness/db';
import { useIntegrationHarness } from '../harness/setup';

describe('SCH-003/SCH-004 (real-db)', () => {
	const h = useIntegrationHarness();

	it('SCH-003: keeps DST spring/fall week generation stable and idempotent', async () => {
		const baseline = h.baseline;

		await pool.query(
			`UPDATE "user"
			 SET weekly_cap = 7
			 WHERE id = $1;`,
			[baseline.user.driverA1.id]
		);

		await pool.query(
			`INSERT INTO driver_preferences (user_id, preferred_days, preferred_routes)
			 VALUES ($1, $2, $3);`,
			[baseline.user.driverA1.id, [1, 2, 3, 4, 5, 6, 7], [baseline.route.a.id]]
		);

		const springWeek = new Date('2026-03-09T12:00:00.000Z');
		const springFirst = await generateWeekSchedule(springWeek, baseline.org.a.id);
		expect(springFirst).toMatchObject({ created: 7, skipped: 0, unfilled: 0, errors: [] });

		const springSecond = await generateWeekSchedule(springWeek, baseline.org.a.id);
		expect(springSecond).toMatchObject({ created: 0, skipped: 7, unfilled: 0, errors: [] });

		const springDates = await pool.query<{ date: string }>(
			`SELECT date::text AS date
			 FROM assignments
			 WHERE route_id = $1
			 ORDER BY date ASC;`,
			[baseline.route.a.id]
		);
		expect(springDates.rows.map((row) => row.date)).toEqual([
			'2026-03-09',
			'2026-03-10',
			'2026-03-11',
			'2026-03-12',
			'2026-03-13',
			'2026-03-14',
			'2026-03-15'
		]);

		const fallWeek = new Date('2026-11-02T12:00:00.000Z');
		const fallFirst = await generateWeekSchedule(fallWeek, baseline.org.a.id);
		expect(fallFirst).toMatchObject({ created: 7, skipped: 0, unfilled: 0, errors: [] });

		const fallSecond = await generateWeekSchedule(fallWeek, baseline.org.a.id);
		expect(fallSecond).toMatchObject({ created: 0, skipped: 7, unfilled: 0, errors: [] });

		const orgBCount = await pool.query<{ count: number }>(
			`SELECT count(*)::int AS count
			 FROM assignments a
			 INNER JOIN warehouses w ON w.id = a.warehouse_id
			 WHERE w.organization_id = $1;`,
			[baseline.org.b.id]
		);
		expect(orgBCount.rows[0]?.count ?? 0).toBe(0);
	});

	it('SCH-004: weekly-cap checks are week-boundary safe and org-scoped', async () => {
		const baseline = h.baseline;
		const weekStart = new Date('2026-03-09T12:00:00.000Z');

		await pool.query(
			`UPDATE "user"
			 SET weekly_cap = 1
			 WHERE id = $1;`,
			[baseline.user.driverA1.id]
		);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				'6f5d8d18-2c6a-45ff-8f53-6ea1958c13e1',
				baseline.route.b.id,
				baseline.warehouse.b.id,
				'2026-03-10',
				'scheduled',
				baseline.user.driverA1.id
			]
		);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				'c50340f8-2f5b-446e-94c9-95dbc8ff8111',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-08',
				'scheduled',
				baseline.user.driverA1.id
			]
		);

		const beforeInWeek = await getDriverWeeklyAssignmentCount(
			baseline.user.driverA1.id,
			weekStart,
			baseline.org.a.id
		);
		expect(beforeInWeek).toBe(0);

		expect(
			await canDriverTakeAssignment(baseline.user.driverA1.id, weekStart, baseline.org.a.id)
		).toBe(true);

		await pool.query(
			`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
			 VALUES ($1, $2, $3, $4, $5, $6);`,
			[
				'a69d9623-1d4e-45f0-bf98-e3348e4df77b',
				baseline.route.a.id,
				baseline.warehouse.a.id,
				'2026-03-10',
				'scheduled',
				baseline.user.driverA1.id
			]
		);

		const afterInWeek = await getDriverWeeklyAssignmentCount(
			baseline.user.driverA1.id,
			weekStart,
			baseline.org.a.id
		);
		expect(afterInWeek).toBe(1);

		expect(
			await canDriverTakeAssignment(baseline.user.driverA1.id, weekStart, baseline.org.a.id)
		).toBe(false);
	});
});
