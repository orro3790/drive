import { describe, expect, it } from 'vitest';

import { getConfig } from '../../scripts/seed/config';
import { generateUsers } from '../../scripts/seed/generators/users';
import { generatePreferences } from '../../scripts/seed/generators/preferences';
import { generateMetrics } from '../../scripts/seed/generators/metrics';
import { generateAssignments } from '../../scripts/seed/generators/assignments';
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

async function buildSeedSnapshot(seed: number) {
	configureSeedRuntime({
		deterministic: true,
		seed,
		anchorDate: '2026-02-01'
	});

	const config = getConfig(false, {
		deterministic: true,
		seed,
		anchorDate: '2026-02-01'
	});

	const users = await generateUsers(config);
	const drivers = users.users.filter((user) => user.role === 'driver');

	const routeIds = Array.from({ length: config.routes }, (_, index) => `route_${index + 1}`);
	const warehouseIds = ['warehouse_1', 'warehouse_2'];
	const warehouseIdByRoute = new Map(
		routeIds.map((routeId, index) => [routeId, warehouseIds[index % warehouseIds.length]])
	);

	const preferences = generatePreferences(drivers, routeIds);
	const metrics = generateMetrics(drivers);
	const assignments = generateAssignments(
		config,
		drivers,
		preferences,
		routeIds,
		warehouseIdByRoute
	);
	const bidding = generateBidding(assignments.assignments, drivers);
	const notifications = generateNotifications(
		assignments.assignments,
		users.users,
		routeIds.map((id) => ({
			id,
			name: id.toUpperCase(),
			warehouseId: warehouseIdByRoute.get(id) ?? 'warehouse_1',
			warehouseName: 'Warehouse'
		}))
	);

	return normalizeDates({
		users,
		preferences,
		metrics,
		assignments,
		bidding,
		notifications
	});
}

describe('deterministic seed mode', () => {
	it('produces identical snapshots for the same seed and anchor date', async () => {
		const firstRun = await buildSeedSnapshot(42);
		const secondRun = await buildSeedSnapshot(42);

		expect(firstRun).toEqual(secondRun);
	});

	it('changes snapshot when seed changes', async () => {
		const firstRun = await buildSeedSnapshot(42);
		const secondRun = await buildSeedSnapshot(99);

		expect(firstRun).not.toEqual(secondRun);
	});
});
