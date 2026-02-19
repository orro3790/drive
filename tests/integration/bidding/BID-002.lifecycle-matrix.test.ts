import { describe, expect, it } from 'vitest';

import {
	createBidWindow,
	instantAssign,
	resolveBidWindow
} from '../../../src/lib/server/services/bidding';

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

type BidRow = {
	id: string;
	user_id: string;
	score: number | null;
	status: string;
	bid_at: Date;
	resolved_at: Date | null;
};

async function insertUnfilledAssignment(params: {
	assignmentId: string;
	routeId: string;
	warehouseId: string;
	date: string;
}): Promise<void> {
	await pool.query(
		`INSERT INTO assignments (id, route_id, warehouse_id, date, status, user_id)
		 VALUES ($1, $2, $3, $4, $5, $6);`,
		[params.assignmentId, params.routeId, params.warehouseId, params.date, 'unfilled', null]
	);
}

async function getWindow(params: {
	bidWindowId: string;
}): Promise<{ mode: string; status: string; winner_id: string | null; closes_at: Date }> {
	const result = await pool.query<{
		mode: string;
		status: string;
		winner_id: string | null;
		closes_at: Date;
	}>(
		`SELECT mode, status, winner_id, closes_at
		 FROM bid_windows
		 WHERE id = $1
		 LIMIT 1;`,
		[params.bidWindowId]
	);

	const row = result.rows[0];
	if (!row) {
		throw new Error(`Window not found: ${params.bidWindowId}`);
	}

	return row;
}

async function insertPendingBid(params: {
	bidId: string;
	assignmentId: string;
	bidWindowId: string;
	userId: string;
	bidAt: Date;
	windowClosesAt: Date;
}): Promise<void> {
	await pool.query(
		`INSERT INTO bids (id, assignment_id, bid_window_id, user_id, score, status, bid_at, window_closes_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
		[
			params.bidId,
			params.assignmentId,
			params.bidWindowId,
			params.userId,
			null,
			'pending',
			params.bidAt,
			params.windowClosesAt
		]
	);
}

async function getBidsByDecisionOrder(params: { bidWindowId: string }): Promise<BidRow[]> {
	const result = await pool.query<BidRow>(
		`SELECT id, user_id, score, status, bid_at, resolved_at
		 FROM bids
		 WHERE bid_window_id = $1
		 ORDER BY score DESC NULLS LAST, bid_at ASC, id ASC;`,
		[params.bidWindowId]
	);

	return result.rows;
}

async function assertNoBidWindowLeakageOutsideOrg(params: {
	organizationId: string;
}): Promise<void> {
	const result = await pool.query<{ bid_window_id: string; warehouse_organization_id: string }>(
		`SELECT bw.id AS bid_window_id, w.organization_id AS warehouse_organization_id
		 FROM bid_windows bw
		 INNER JOIN assignments a ON a.id = bw.assignment_id
		 INNER JOIN warehouses w ON w.id = a.warehouse_id
		 WHERE w.organization_id <> $1;`,
		[params.organizationId]
	);

	expect(result.rows).toEqual([]);
}

describe('BID lifecycle matrix', () => {
	const h = useIntegrationHarness();

	it('BID-002: transitions competitive->instant and keeps winner selection deterministic', async () => {
		await withScenarioEvidence({
			scenarioId: 'BID-002',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T10:00:00.000Z');

				const assignmentId = 'b0020000-0000-4000-8000-000000000002';
				await insertUnfilledAssignment({
					assignmentId,
					routeId: baseline.route.a.id,
					warehouseId: baseline.warehouse.a.id,
					date: '2026-03-12'
				});

				const createResult = await createBidWindow(assignmentId, {
					organizationId: baseline.org.a.id
				});

				expect(createResult.success).toBe(true);
				const bidWindowId = createResult.bidWindowId!;

				const initialWindow = await getWindow({ bidWindowId });
				expect(initialWindow.mode).toBe('competitive');
				expect(initialWindow.status).toBe('open');

				const resolveResult = await resolveBidWindow(
					bidWindowId,
					{ actorType: 'system', actorId: null },
					baseline.org.a.id
				);

				expect(resolveResult).toMatchObject({
					resolved: false,
					reason: 'transitioned_to_instant',
					transitioned: true,
					bidCount: 0
				});

				const transitionedWindow = await getWindow({ bidWindowId });
				expect(transitionedWindow.mode).toBe('instant');
				expect(transitionedWindow.status).toBe('open');

				const firstAccept = await instantAssign(
					assignmentId,
					baseline.user.driverA2.id,
					bidWindowId,
					baseline.org.a.id
				);
				expect(firstAccept.instantlyAssigned).toBe(true);

				const secondAccept = await instantAssign(
					assignmentId,
					baseline.user.driverA1.id,
					bidWindowId,
					baseline.org.a.id
				);
				expect(secondAccept.instantlyAssigned).toBe(false);

				await assertAssignmentAssigned({
					assignmentId,
					expectedDriverId: baseline.user.driverA2.id
				});
				await assertBidWindowResolved({
					bidWindowId,
					expectedWinnerId: baseline.user.driverA2.id
				});
				await assertAtMostOneWinningBidForWindow({ bidWindowId });

				const notifications = await pool.query<{ type: string; organization_id: string | null }>(
					`SELECT type, organization_id
					 FROM notifications
					 WHERE type = 'bid_open'
					 ORDER BY id ASC;`
				);
				expect(notifications.rows).toHaveLength(4);
				expect(
					notifications.rows.every(
						(notification) => notification.organization_id === baseline.org.a.id
					)
				).toBe(true);

				const decisionEvidence = {
					scenarioId: 'BID-002',
					resolutionPath: 'competitive_to_instant_then_first_accept',
					transitionReason: resolveResult.reason,
					winnerId: baseline.user.driverA2.id,
					loserError: secondAccept.error ?? null
				};
				expect(decisionEvidence).toEqual({
					scenarioId: 'BID-002',
					resolutionPath: 'competitive_to_instant_then_first_accept',
					transitionReason: 'transitioned_to_instant',
					winnerId: baseline.user.driverA2.id,
					loserError: 'Route already assigned'
				});

				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
				await assertNoBidWindowLeakageOutsideOrg({ organizationId: baseline.org.a.id });
			}
		});
	});

	it('BID-003: covers emergency first-accept flow with org-scoped side effects', async () => {
		await withScenarioEvidence({
			scenarioId: 'BID-003',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T11:00:00.000Z');

				const assignmentId = 'b0030000-0000-4000-8000-000000000003';
				await insertUnfilledAssignment({
					assignmentId,
					routeId: baseline.route.a.id,
					warehouseId: baseline.warehouse.a.id,
					date: '2026-03-10'
				});

				const createResult = await createBidWindow(assignmentId, {
					organizationId: baseline.org.a.id,
					mode: 'emergency',
					trigger: 'manager',
					allowPastShift: true
				});

				expect(createResult.success).toBe(true);
				const bidWindowId = createResult.bidWindowId!;

				const window = await getWindow({ bidWindowId });
				expect(window.mode).toBe('emergency');

				const assignResult = await instantAssign(
					assignmentId,
					baseline.user.driverA1.id,
					bidWindowId,
					baseline.org.a.id
				);
				expect(assignResult.instantlyAssigned).toBe(true);

				await assertAssignmentAssigned({
					assignmentId,
					expectedDriverId: baseline.user.driverA1.id
				});
				await assertBidWindowResolved({
					bidWindowId,
					expectedWinnerId: baseline.user.driverA1.id
				});

				const emergencyNotifications = await pool.query<{
					type: string;
					user_id: string;
					organization_id: string | null;
				}>(
					`SELECT type, user_id, organization_id
					 FROM notifications
					 WHERE type = 'emergency_route_available'
					 ORDER BY user_id ASC;`
				);

				expect(emergencyNotifications.rows).toEqual([
					{
						type: 'emergency_route_available',
						user_id: baseline.user.driverA1.id,
						organization_id: baseline.org.a.id
					},
					{
						type: 'emergency_route_available',
						user_id: baseline.user.driverA2.id,
						organization_id: baseline.org.a.id
					}
				]);

				const decisionEvidence = {
					scenarioId: 'BID-003',
					resolutionPath: 'emergency_first_accept',
					winnerId: baseline.user.driverA1.id,
					windowMode: window.mode
				};
				expect(decisionEvidence).toEqual({
					scenarioId: 'BID-003',
					resolutionPath: 'emergency_first_accept',
					winnerId: baseline.user.driverA1.id,
					windowMode: 'emergency'
				});

				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
				await assertNoBidWindowLeakageOutsideOrg({ organizationId: baseline.org.a.id });
			}
		});
	});

	it('BID-004: open->resolve tie-break stays deterministic with explicit evidence', async () => {
		await withScenarioEvidence({
			scenarioId: 'BID-004',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T09:00:00.000Z');

				const assignmentId = 'b0040000-0000-4000-8000-000000000004';
				await insertUnfilledAssignment({
					assignmentId,
					routeId: baseline.route.a.id,
					warehouseId: baseline.warehouse.a.id,
					date: '2026-03-15'
				});

				const createResult = await createBidWindow(assignmentId, {
					organizationId: baseline.org.a.id
				});
				expect(createResult.success).toBe(true);

				const bidWindowId = createResult.bidWindowId!;
				const window = await getWindow({ bidWindowId });
				expect(window.mode).toBe('competitive');

				const tiedBidAt = new Date('2026-03-10T09:15:00.000Z');
				await insertPendingBid({
					bidId: '10000000-0000-4000-8000-000000000004',
					assignmentId,
					bidWindowId,
					userId: baseline.user.driverA1.id,
					bidAt: tiedBidAt,
					windowClosesAt: window.closes_at
				});
				await insertPendingBid({
					bidId: '20000000-0000-4000-8000-000000000004',
					assignmentId,
					bidWindowId,
					userId: baseline.user.driverA2.id,
					bidAt: tiedBidAt,
					windowClosesAt: window.closes_at
				});

				const resolveResult = await resolveBidWindow(
					bidWindowId,
					{ actorType: 'system', actorId: null },
					baseline.org.a.id
				);

				expect(resolveResult).toMatchObject({
					resolved: true,
					winnerId: baseline.user.driverA1.id,
					bidCount: 2
				});

				await assertAssignmentAssigned({
					assignmentId,
					expectedDriverId: baseline.user.driverA1.id
				});
				await assertBidWindowResolved({
					bidWindowId,
					expectedWinnerId: baseline.user.driverA1.id
				});

				const orderedBids = await getBidsByDecisionOrder({ bidWindowId });
				expect(orderedBids).toHaveLength(2);
				expect(orderedBids.map((bid) => bid.user_id)).toEqual([
					baseline.user.driverA1.id,
					baseline.user.driverA2.id
				]);

				const finalBidStates = await pool.query<{ user_id: string; status: string }>(
					`SELECT user_id, status
					 FROM bids
					 WHERE bid_window_id = $1
					 ORDER BY user_id ASC;`,
					[bidWindowId]
				);
				expect(finalBidStates.rows).toEqual([
					{ user_id: baseline.user.driverA1.id, status: 'won' },
					{ user_id: baseline.user.driverA2.id, status: 'lost' }
				]);

				const winLossNotifications = await pool.query<{ type: string; user_id: string }>(
					`SELECT type, user_id
					 FROM notifications
					 WHERE type IN ('bid_won', 'bid_lost')
					 ORDER BY user_id ASC, type ASC;`
				);
				expect(winLossNotifications.rows).toEqual([
					{ type: 'bid_won', user_id: baseline.user.driverA1.id },
					{ type: 'bid_lost', user_id: baseline.user.driverA2.id }
				]);

				const decisionEvidence = {
					scenarioId: 'BID-004',
					winnerId: resolveResult.winnerId,
					reasonCode: 'tie_break_bid_id',
					candidateOrder: orderedBids.map((bid) => ({
						userId: bid.user_id,
						score: bid.score,
						bidAt: bid.bid_at.toISOString(),
						bidId: bid.id,
						status: bid.status
					}))
				};
				expect(decisionEvidence).toEqual({
					scenarioId: 'BID-004',
					winnerId: baseline.user.driverA1.id,
					reasonCode: 'tie_break_bid_id',
					candidateOrder: [
						{
							userId: baseline.user.driverA1.id,
							score: 0,
							bidAt: tiedBidAt.toISOString(),
							bidId: '10000000-0000-4000-8000-000000000004',
							status: 'won'
						},
						{
							userId: baseline.user.driverA2.id,
							score: 0,
							bidAt: tiedBidAt.toISOString(),
							bidId: '20000000-0000-4000-8000-000000000004',
							status: 'lost'
						}
					]
				});

				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
				await assertNoBidWindowLeakageOutsideOrg({ organizationId: baseline.org.a.id });
			}
		});
	});

	it('BID-005: conflict retries stay deterministic under concurrent resolve pressure', async () => {
		await withScenarioEvidence({
			scenarioId: 'BID-005',
			run: async () => {
				const baseline = h.baseline;
				freezeTime('2026-03-10T08:00:00.000Z');

				await pool.query(
					`UPDATE driver_health_state
					 SET current_score = CASE user_id
						WHEN $1 THEN 95
						WHEN $2 THEN 20
						ELSE current_score
					 END
					 WHERE user_id IN ($1, $2);`,
					[baseline.user.driverA1.id, baseline.user.driverA2.id]
				);

				const runEvidence: Array<{
					runIndex: number;
					windowWinners: string[];
					retryAppliedWindowIds: string[];
				}> = [];

				for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
					const assignmentIdA = `b005${runIndex}000-0000-4000-8000-00000000000a`;
					const assignmentIdB = `b005${runIndex}000-0000-4000-8000-00000000000b`;

					await insertUnfilledAssignment({
						assignmentId: assignmentIdA,
						routeId: baseline.route.a.id,
						warehouseId: baseline.warehouse.a.id,
						date: `2026-03-${11 + runIndex}`
					});
					await insertUnfilledAssignment({
						assignmentId: assignmentIdB,
						routeId: baseline.route.a.id,
						warehouseId: baseline.warehouse.a.id,
						date: `2026-03-${11 + runIndex}`
					});

					const windowA = await createBidWindow(assignmentIdA, {
						organizationId: baseline.org.a.id
					});
					const windowB = await createBidWindow(assignmentIdB, {
						organizationId: baseline.org.a.id
					});

					expect(windowA.success).toBe(true);
					expect(windowB.success).toBe(true);

					const bidWindowIdA = windowA.bidWindowId!;
					const bidWindowIdB = windowB.bidWindowId!;

					const windowMetaA = await getWindow({ bidWindowId: bidWindowIdA });
					const windowMetaB = await getWindow({ bidWindowId: bidWindowIdB });

					const bidAt = new Date(`2026-03-${10 + runIndex}T08:30:00.000Z`);

					await insertPendingBid({
						bidId: `15000000-0000-4000-8000-0000000000${runIndex}1`,
						assignmentId: assignmentIdA,
						bidWindowId: bidWindowIdA,
						userId: baseline.user.driverA1.id,
						bidAt,
						windowClosesAt: windowMetaA.closes_at
					});
					await insertPendingBid({
						bidId: `25000000-0000-4000-8000-0000000000${runIndex}1`,
						assignmentId: assignmentIdA,
						bidWindowId: bidWindowIdA,
						userId: baseline.user.driverA2.id,
						bidAt,
						windowClosesAt: windowMetaA.closes_at
					});

					await insertPendingBid({
						bidId: `15000000-0000-4000-8000-0000000000${runIndex}2`,
						assignmentId: assignmentIdB,
						bidWindowId: bidWindowIdB,
						userId: baseline.user.driverA1.id,
						bidAt,
						windowClosesAt: windowMetaB.closes_at
					});
					await insertPendingBid({
						bidId: `25000000-0000-4000-8000-0000000000${runIndex}2`,
						assignmentId: assignmentIdB,
						bidWindowId: bidWindowIdB,
						userId: baseline.user.driverA2.id,
						bidAt,
						windowClosesAt: windowMetaB.closes_at
					});

					const [resolveA, resolveB] = await Promise.all([
						resolveBidWindow(
							bidWindowIdA,
							{ actorType: 'system', actorId: null },
							baseline.org.a.id
						),
						resolveBidWindow(
							bidWindowIdB,
							{ actorType: 'system', actorId: null },
							baseline.org.a.id
						)
					]);

					expect(resolveA.resolved).toBe(true);
					expect(resolveB.resolved).toBe(true);

					const windowAfterA = await getWindow({ bidWindowId: bidWindowIdA });
					const windowAfterB = await getWindow({ bidWindowId: bidWindowIdB });

					const winners = [windowAfterA.winner_id, windowAfterB.winner_id].filter(
						(winnerId): winnerId is string => winnerId !== null
					);
					expect(winners.sort()).toEqual([baseline.user.driverA1.id, baseline.user.driverA2.id]);

					const orderedBidsA = await getBidsByDecisionOrder({ bidWindowId: bidWindowIdA });
					const orderedBidsB = await getBidsByDecisionOrder({ bidWindowId: bidWindowIdB });

					const retryAppliedWindowIds = [
						{
							bidWindowId: bidWindowIdA,
							winnerId: windowAfterA.winner_id,
							topCandidate: orderedBidsA[0]
						},
						{
							bidWindowId: bidWindowIdB,
							winnerId: windowAfterB.winner_id,
							topCandidate: orderedBidsB[0]
						}
					]
						.filter((row) => row.winnerId !== row.topCandidate?.user_id)
						.map((row) => row.bidWindowId);

					expect(retryAppliedWindowIds).toHaveLength(1);

					await assertAtMostOneWinningBidForWindow({ bidWindowId: bidWindowIdA });
					await assertAtMostOneWinningBidForWindow({ bidWindowId: bidWindowIdB });

					runEvidence.push({
						runIndex,
						windowWinners: winners,
						retryAppliedWindowIds
					});
				}

				const decisionEvidence = {
					scenarioId: 'BID-005',
					reasonCode: 'winner_conflict_retry',
					runs: runEvidence
				};
				expect(decisionEvidence.runs).toHaveLength(3);
				expect(
					decisionEvidence.runs.every(
						(run) =>
							run.windowWinners.includes(baseline.user.driverA1.id) &&
							run.windowWinners.includes(baseline.user.driverA2.id) &&
							run.retryAppliedWindowIds.length === 1
					)
				).toBe(true);

				await assertNoCrossOrgNotificationLeakage();
				await assertNoCrossOrgAssignmentLeakage();
				await assertNoCrossOrgBidWinnerLeakage();
				await assertNoBidWindowLeakageOutsideOrg({ organizationId: baseline.org.a.id });
			}
		});
	});
});
