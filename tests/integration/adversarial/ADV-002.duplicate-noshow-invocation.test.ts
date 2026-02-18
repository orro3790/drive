import { describe, expect, it } from 'vitest';

import { detectNoShowsForOrganization } from '../../../src/lib/server/services/noshow';
import { toTorontoDateString } from '../../../src/lib/server/time/toronto';

import { pool } from '../harness/db';
import { withScenarioEvidence } from '../harness/diagnostics';
import { useIntegrationHarness } from '../harness/setup';
import { freezeTime } from '../harness/time';

import {
	assertNoDuplicateNoShowManagerAlerts,
	assertNoDuplicateOpenBidWindows
} from '../invariants/idempotency';
import { assertNoCrossOrgNotificationLeakage } from '../invariants/tenantIsolation';

describe('ADV-002 (adversarial)', () => {
	const h = useIntegrationHarness();

	it('stays idempotent for duplicate no-show invocations (same tick + rerun)', async () => {
		await withScenarioEvidence({
			scenarioId: 'ADV-002',
			run: async () => {
				const baseline = h.baseline;

				freezeTime('2026-03-10T15:30:00.000Z');
				const today = toTorontoDateString(new Date());

				const assignmentId = 'a0020000-0000-4000-8000-000000000002';
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

				const [runA, runB] = await Promise.all([
					detectNoShowsForOrganization(baseline.org.a.id),
					detectNoShowsForOrganization(baseline.org.a.id)
				]);
				const rerun = await detectNoShowsForOrganization(baseline.org.a.id);

				expect(runA.errors).toBe(0);
				expect(runB.errors).toBe(0);
				expect(rerun.errors).toBe(0);
				expect(runA.bidWindowsCreated + runB.bidWindowsCreated).toBe(1);
				expect(rerun.bidWindowsCreated).toBe(0);

				await assertNoDuplicateOpenBidWindows({
					assignmentIds: [assignmentId],
					trigger: 'no_show'
				});
				await assertNoDuplicateNoShowManagerAlerts({
					organizationId: baseline.org.a.id,
					date: today,
					routeId: baseline.route.a.id
				});

				const windows = await pool.query<{ id: string }>(
					`SELECT id
					 FROM bid_windows
					 WHERE assignment_id = $1
						AND trigger = 'no_show'
						AND status = 'open';`,
					[assignmentId]
				);
				expect(windows.rows).toHaveLength(1);

				const metrics = await pool.query<{ no_shows: number }>(
					`SELECT no_shows
					 FROM driver_metrics
					 WHERE user_id = $1
					 LIMIT 1;`,
					[baseline.user.driverA1.id]
				);
				expect(metrics.rows[0]?.no_shows).toBe(1);

				await assertNoCrossOrgNotificationLeakage();
			}
		});
	});
});
