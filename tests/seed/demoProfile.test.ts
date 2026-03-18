import { describe, expect, it } from 'vitest';

import { getOrgConfigs } from '../../scripts/seed/config';
import { generateUsers } from '../../scripts/seed/generators/users';
import { generatePreferences } from '../../scripts/seed/generators/preferences';
import { generateAssignments } from '../../scripts/seed/generators/assignments';
import { generateMetrics } from '../../scripts/seed/generators/metrics';
import { generateRouteCompletions } from '../../scripts/seed/generators/route-completions';
import { generateHealth } from '../../scripts/seed/generators/health';
import { generateBidding } from '../../scripts/seed/generators/bidding';
import { generateNotifications } from '../../scripts/seed/generators/notifications';
import { configureSeedRuntime } from '../../scripts/seed/utils/runtime';

function normalizeDates(value: unknown): unknown {
	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map((item) => normalizeDates(item));
	}

	if (value && typeof value === 'object') {
		const output: Record<string, unknown> = {};
		for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
			output[key] = normalizeDates(nestedValue);
		}
		return output;
	}

	return value;
}

async function buildDemoOrgSnapshot(seed: number, slug: 'seed-org-a' | 'seed-org-b') {
	configureSeedRuntime({
		deterministic: true,
		seed,
		anchorDate: '2026-03-18'
	});

	const orgConfig = getOrgConfigs('demo', {
		deterministic: true,
		seed,
		anchorDate: '2026-03-18'
	}).find((candidate) => candidate.slug === slug);

	if (!orgConfig?.demoFixture) {
		throw new Error(`Missing demo org config for ${slug}`);
	}

	const fixture = orgConfig.demoFixture;
	const users = await generateUsers(orgConfig.config, {
		driverEmailDomain: orgConfig.driverEmailDomain,
		managerEmailDomain: orgConfig.managerEmailDomain,
		idPrefix: slug === 'seed-org-b' ? 'orgb' : '',
		demoFixture: fixture
	});
	const drivers = users.users.filter((user) => user.role === 'driver');
	const managers = users.users.filter((user) => user.role === 'manager');

	const warehouseIds = fixture.warehouses.map(
		(warehouse, index) => `${slug}-warehouse-${index + 1}`
	);
	const warehouseIdByKey = new Map(
		fixture.warehouses.map((warehouse, index) => [warehouse.key, warehouseIds[index]])
	);
	const routeIds = fixture.routes.map((route, index) => `${slug}-route-${index + 1}`);
	const routeIdByKey = new Map(fixture.routes.map((route, index) => [route.key, routeIds[index]]));
	const warehouseIdByRoute = new Map(
		fixture.routes.map((route, index) => {
			const warehouseId = warehouseIdByKey.get(route.warehouseKey);
			if (!warehouseId) {
				throw new Error(`Missing warehouse mapping for ${route.key}`);
			}
			return [routeIds[index], warehouseId] as const;
		})
	);
	const routeStartTimeById = new Map(
		fixture.routes.map((route, index) => [routeIds[index], route.startTime])
	);

	const preferences = generatePreferences(drivers, routeIds, {
		demoFixture: fixture,
		routeIdByKey
	});
	const assignments = generateAssignments(
		orgConfig.config,
		drivers,
		preferences,
		routeIds,
		warehouseIdByRoute,
		routeStartTimeById,
		{ demoFixture: fixture, routeIdByKey }
	);
	const metrics = generateMetrics(drivers, assignments.assignments, assignments.shifts);
	const routeCompletions = generateRouteCompletions(assignments.assignments);
	const health = generateHealth(drivers, assignments.assignments, assignments.shifts, metrics, {
		demoFixture: fixture
	});
	const bidding = generateBidding(assignments.assignments, drivers, assignments.noShowIndices, {
		healthStates: health.states,
		routeCompletions,
		preferences,
		demoFixture: fixture,
		routeIdByKey
	});

	const routeManagerIdByRouteId = new Map(
		fixture.routes.map((route, index) => {
			const managerEmail = fixture.managers.find(
				(manager) => manager.key === route.managerKey
			)?.email;
			const manager = managers.find((candidate) => candidate.email === managerEmail);
			if (!manager) {
				throw new Error(`Missing manager mapping for ${route.key}`);
			}
			return [routeIds[index], manager.id] as const;
		})
	);

	const assignmentIdByIndex = new Map<number, string>();
	for (let index = 0; index < assignments.assignments.length; index++) {
		assignmentIdByIndex.set(index, `${slug}-assignment-${index + 1}`);
	}

	const notifications = generateNotifications(
		users.users,
		fixture.routes.map((route, index) => ({
			id: routeIds[index],
			name: route.name,
			warehouseId: warehouseIdByKey.get(route.warehouseKey) ?? 'warehouse',
			warehouseName:
				fixture.warehouses.find((warehouse) => warehouse.key === route.warehouseKey)?.name ??
				'Warehouse'
		})),
		{
			assignments: assignments.assignments,
			shifts: assignments.shifts,
			bidWindows: bidding.bidWindows,
			bids: bidding.bids,
			healthStates: health.states,
			personas: assignments.personas,
			noShowIndices: assignments.noShowIndices,
			assignmentIdByIndex,
			demoFixture: fixture,
			routeManagerIdByRouteId,
			warehouseManagerUserIdsByWarehouseId: new Map()
		}
	);

	return {
		orgConfig,
		fixture,
		users,
		drivers,
		managers,
		preferences,
		assignments,
		metrics,
		routeCompletions,
		health,
		bidding,
		notifications,
		routeManagerIdByRouteId
	};
}

describe('demo seed profile', () => {
	it('produces identical org-a snapshots for the same seed and anchor date', async () => {
		const firstRun = await buildDemoOrgSnapshot(42, 'seed-org-a');
		const secondRun = await buildDemoOrgSnapshot(42, 'seed-org-a');

		expect(
			JSON.parse(
				JSON.stringify(
					normalizeDates({
						users: firstRun.users,
						preferences: firstRun.preferences,
						assignments: firstRun.assignments,
						metrics: firstRun.metrics,
						health: firstRun.health,
						bidding: firstRun.bidding,
						notifications: firstRun.notifications
					})
				)
			)
		).toEqual(
			JSON.parse(
				JSON.stringify(
					normalizeDates({
						users: secondRun.users,
						preferences: secondRun.preferences,
						assignments: secondRun.assignments,
						metrics: secondRun.metrics,
						health: secondRun.health,
						bidding: secondRun.bidding,
						notifications: secondRun.notifications
					})
				)
			)
		);
	});

	it('builds the curated org-a roster and health story', async () => {
		const snapshot = await buildDemoOrgSnapshot(42, 'seed-org-a');
		const orgADriverEmails = snapshot.drivers.map((driver) => driver.email);
		const flaggedDrivers = snapshot.drivers
			.filter((driver) => driver.isFlagged)
			.map((driver) => driver.email);
		const healthByUserId = new Map(snapshot.health.states.map((state) => [state.userId, state]));
		const notificationCounts = new Map<string, number>();

		for (const notification of snapshot.notifications) {
			notificationCounts.set(
				notification.userId,
				(notificationCounts.get(notification.userId) ?? 0) + 1
			);
		}

		expect(orgADriverEmails).toEqual(snapshot.fixture.drivers.map((driver) => driver.email));
		expect(flaggedDrivers).toEqual(['driver008@driver.test']);
		expect(snapshot.health.states.filter((state) => !state.assignmentPoolEligible)).toHaveLength(2);

		for (const key of ['driver001', 'driver002', 'driver003', 'driver004', 'driver005']) {
			const user = snapshot.drivers.find((driver) => driver.email.startsWith(key));
			expect(user?.isFlagged).toBe(false);
			expect(user ? healthByUserId.get(user.id)?.assignmentPoolEligible : false).toBe(true);
		}

		for (const key of ['driver006', 'driver007', 'driver008']) {
			const user = snapshot.drivers.find((driver) => driver.email.startsWith(key));
			expect(user ? healthByUserId.get(user.id)?.assignmentPoolEligible : false).toBe(true);
		}

		for (const key of ['driver009', 'driver010']) {
			const user = snapshot.drivers.find((driver) => driver.email.startsWith(key));
			expect(user ? healthByUserId.get(user.id)?.assignmentPoolEligible : true).toBe(false);
		}

		for (const driverFixture of snapshot.fixture.drivers) {
			const user = snapshot.drivers.find((driver) => driver.email === driverFixture.email);
			expect(user).toBeTruthy();
			expect(notificationCounts.get(user?.id ?? '') ?? 0).toBeLessThanOrEqual(
				driverFixture.notificationBudget.maxTotal
			);
		}

		const routeOwnershipCounts = new Map<string, number>();
		for (const managerId of snapshot.routeManagerIdByRouteId.values()) {
			routeOwnershipCounts.set(managerId, (routeOwnershipCounts.get(managerId) ?? 0) + 1);
		}
		expect(snapshot.managers).toHaveLength(2);
		expect([...routeOwnershipCounts.values()].sort((a, b) => a - b)).toEqual([4, 4]);
	});

	it('keeps both demo orgs self-owned by seeded managers', async () => {
		const orgA = await buildDemoOrgSnapshot(42, 'seed-org-a');
		const orgB = await buildDemoOrgSnapshot(42, 'seed-org-b');

		expect(orgA.drivers).toHaveLength(10);
		expect(orgA.managers).toHaveLength(2);
		expect(orgA.fixture.routes).toHaveLength(8);
		expect(orgB.drivers).toHaveLength(3);
		expect(orgB.managers).toHaveLength(1);
		expect(orgB.fixture.routes).toHaveLength(3);

		expect(
			orgA.managers.some(
				(manager) =>
					manager.email ===
					orgA.fixture.managers.find((candidate) => candidate.key === orgA.fixture.ownerManagerKey)
						?.email
			)
		).toBe(true);
		expect(
			orgB.managers.some(
				(manager) =>
					manager.email ===
					orgB.fixture.managers.find((candidate) => candidate.key === orgB.fixture.ownerManagerKey)
						?.email
			)
		).toBe(true);
	});
});
