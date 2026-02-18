import { expect, test } from '@playwright/test';

import { assertNoCrossTenantLeakage, login, seedUiBaseline, withDb } from './harness/world';

const ORG_A_ASSIGNMENT_ID = 'c4ed4d8b-c5f5-4652-9ceb-f3beec925c97';
const ORG_B_ASSIGNMENT_ID = '9b56cd63-6f0d-44ed-89f8-aae26da00a30';

test.describe('UI-001 manager/driver critical journey', () => {
	test('UI-001 @smoke: driver accepts in-org bidding and foreign org remains isolated', async ({
		page,
		context
	}) => {
		const baseline = await withDb(async (pool) => {
			const seeded = await seedUiBaseline(pool);

			await pool.query(
				`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
				 VALUES
				 ($1, $2, $3, $4, $5, NULL),
				 ($6, $7, $8, $9, $10, NULL);`,
				[
					ORG_A_ASSIGNMENT_ID,
					seeded.route.a.id,
					seeded.warehouse.a.id,
					'2026-03-18',
					'unfilled',
					ORG_B_ASSIGNMENT_ID,
					seeded.route.b.id,
					seeded.warehouse.b.id,
					'2026-03-18',
					'unfilled'
				]
			);

			await pool.query(
				`INSERT INTO bid_windows (assignment_id, mode, trigger, pay_bonus_percent, opens_at, closes_at, status)
				 VALUES
				 ($1, $2, $3, $4, now(), now() + interval '3 hours', $5),
				 ($6, $7, $8, $9, now(), now() + interval '3 hours', $10);`,
				[
					ORG_A_ASSIGNMENT_ID,
					'instant',
					'manager',
					20,
					'open',
					ORG_B_ASSIGNMENT_ID,
					'instant',
					'manager',
					20,
					'open'
				]
			);

			return seeded;
		});

		await login(page, baseline.user.driverA1.email);
		await page.goto('/bids');
		await page.locator('#available-bids button').first().click();

		await page.goto('/schedule');
		await page.waitForSelector('[data-testid="schedule-list"][data-loaded="true"]');
		await expect(page.locator(`[data-assignment-id="${ORG_A_ASSIGNMENT_ID}"]`)).toHaveCount(1);

		await withDb(async (pool) => {
			const orgBAssignment = await pool.query<{ user_id: string | null }>(
				`SELECT user_id FROM assignments WHERE id = $1 LIMIT 1;`,
				[ORG_B_ASSIGNMENT_ID]
			);
			expect(orgBAssignment.rows[0]?.user_id ?? null).toBeNull();
			await assertNoCrossTenantLeakage(pool);
		});

		await context.clearCookies();
		await login(page, baseline.user.driverB1.email);
		await page.goto('/schedule');
		await page.waitForSelector('[data-testid="schedule-list"][data-loaded="true"]');
		await expect(page.locator(`[data-assignment-id="${ORG_A_ASSIGNMENT_ID}"]`)).toHaveCount(0);
	});
});
