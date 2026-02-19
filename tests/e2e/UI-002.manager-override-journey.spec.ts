import { expect, test } from '@playwright/test';

import { assertNoCrossTenantLeakage, login, seedUiBaseline, withDb } from './harness/world';

const ORG_A_ASSIGNMENT_ID = '4c703273-513f-42f6-a06d-ed89c6722e1d';
const ORG_B_ASSIGNMENT_ID = '8ff479e8-f5ce-4c8d-9cf5-e2b9fba2f5da';

/** Today in YYYY-MM-DD (UTC) — matches the routes page default date filter. */
function todayYmd(): string {
	return new Date().toISOString().slice(0, 10);
}

test.describe('UI-002 manager override critical journey', () => {
	test('UI-002 @smoke: manager suspend route applies in-org and does not bleed tenants', async ({
		page
	}) => {
		const assignmentDate = todayYmd();

		const baseline = await withDb(async (pool) => {
			const seeded = await seedUiBaseline(pool);

			await pool.query(
				`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
				 VALUES
				 ($1, $2, $3, $4, $5, $6),
				 ($7, $8, $9, $10, $11, $12);`,
				[
					ORG_A_ASSIGNMENT_ID,
					seeded.route.a.id,
					seeded.warehouse.a.id,
					assignmentDate,
					'scheduled',
					seeded.user.driverA2.id,
					ORG_B_ASSIGNMENT_ID,
					seeded.route.b.id,
					seeded.warehouse.b.id,
					assignmentDate,
					'scheduled',
					seeded.user.driverB1.id
				]
			);

			return seeded;
		});

		await login(page, baseline.user.managerA.email);
		await page.goto('/routes');
		// Wait for routes table to load (Route A should appear with today's assignment)
		await page.waitForSelector('table tbody tr', { timeout: 10000 });
		await page.getByText('Route A', { exact: false }).first().click();
		// Wait for detail panel footer to render the Suspend Route button
		await page.waitForSelector('button:has-text("Suspend Route")', { timeout: 10000 });
		await page
			.getByRole('button', { name: /suspend route/i })
			.first()
			.click();
		// Wait for ConfirmationDialog to appear and click its confirm button
		const dialog = page.locator('[role="dialog"]');
		await dialog.waitFor({ timeout: 5000 });
		await dialog.getByRole('button', { name: /suspend route/i }).click();

		await expect(page.getByText(/suspended/i).first()).toBeVisible({ timeout: 10000 });

		await withDb(async (pool) => {
			const assignments = await pool.query<{
				id: string;
				status: string;
				user_id: string | null;
			}>(
				`SELECT id, status, user_id
				 FROM assignments
				 WHERE id IN ($1, $2);`,
				[ORG_A_ASSIGNMENT_ID, ORG_B_ASSIGNMENT_ID]
			);

			const byId = new Map(assignments.rows.map((row) => [row.id, row]));
			expect(byId.get(ORG_A_ASSIGNMENT_ID)).toMatchObject({
				status: 'cancelled',
				user_id: null
			});
			expect(byId.get(ORG_B_ASSIGNMENT_ID)).toMatchObject({
				status: 'scheduled',
				user_id: baseline.user.driverB1.id
			});

			await assertNoCrossTenantLeakage(pool);
		});
	});
});
