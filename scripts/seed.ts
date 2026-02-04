#!/usr/bin/env tsx
/**
 * Seed Script
 *
 * Generates realistic test data for the Drive app.
 *
 * Usage:
 *   pnpm seed           # Dev mode: 10 drivers
 *   pnpm seed:staging   # Staging mode: 100 drivers
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, inArray } from 'drizzle-orm';
import { config } from 'dotenv';

// Schema imports
import { user, account } from '../src/lib/server/db/auth-schema';
import {
	warehouses,
	warehouseManagers,
	routes,
	driverPreferences,
	driverMetrics,
	assignments,
	shifts,
	routeCompletions,
	bidWindows,
	bids,
	notifications,
	auditLogs
} from '../src/lib/server/db/schema';

// Seed modules
import { getConfig, type SeedConfig } from './seed/config';
import { generateWarehouses } from './seed/generators/warehouses';
import { generateRoutes } from './seed/generators/routes';
import { generateUsers, getSeedPassword } from './seed/generators/users';
import { generatePreferences } from './seed/generators/preferences';
import { generateMetrics } from './seed/generators/metrics';
import { generateAssignments } from './seed/generators/assignments';
import { generateRouteCompletions } from './seed/generators/route-completions';
import { generateBidding } from './seed/generators/bidding';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const sql = neon(DATABASE_URL);
const db = drizzle(sql);

async function clearData() {
	console.log('Clearing existing data...');

	// Delete in reverse dependency order
	await db.delete(auditLogs);
	await db.delete(notifications);
	await db.delete(bids);
	await db.delete(bidWindows);
	await db.delete(routeCompletions);
	await db.delete(shifts);
	await db.delete(assignments);
	await db.delete(driverMetrics);
	await db.delete(driverPreferences);
	await db.delete(warehouseManagers);
	await db.delete(routes);
	await db.delete(warehouses);

	// Delete driver/manager accounts but keep existing managers if they have a different email domain
	// For simplicity, we'll delete all seeded users (test domains)
	const seededUsers = await db.select({ id: user.id }).from(user).where(eq(user.role, 'driver'));

	if (seededUsers.length > 0) {
		const userIds = seededUsers.map((u) => u.id);
		await db.delete(account).where(inArray(account.userId, userIds));
		await db.delete(user).where(inArray(user.id, userIds));
	}

	// Also delete seeded managers (those with test domain)
	const testManagers = await db.select({ id: user.id, email: user.email }).from(user);
	const seedManagerIds = testManagers
		.filter((u) => u.email.includes('@drivermanager.test'))
		.map((u) => u.id);

	if (seedManagerIds.length > 0) {
		await db.delete(account).where(inArray(account.userId, seedManagerIds));
		await db.delete(user).where(inArray(user.id, seedManagerIds));
	}

	console.log('Data cleared.');
}

async function seed(seedConfig: SeedConfig) {
	console.log(`\nSeeding with config:`, seedConfig);

	// 1. Generate warehouses
	console.log('\n1. Creating warehouses...');
	const warehouseData = generateWarehouses(seedConfig);
	const insertedWarehouses = await db
		.insert(warehouses)
		.values(warehouseData.map((w) => ({ name: w.name, address: w.address })))
		.returning({ id: warehouses.id, name: warehouses.name });
	console.log(`   Created ${insertedWarehouses.length} warehouses`);

	// 2. Generate routes
	console.log('\n2. Creating routes...');
	const warehouseNames = insertedWarehouses.map((w) => w.name);
	const routeData = generateRoutes(seedConfig, warehouseNames);
	const insertedRoutes = await db
		.insert(routes)
		.values(
			routeData.map((r) => ({
				name: r.name,
				warehouseId: insertedWarehouses[r.warehouseIndex].id
			}))
		)
		.returning({ id: routes.id, name: routes.name, warehouseId: routes.warehouseId });
	console.log(`   Created ${insertedRoutes.length} routes`);

	// Build warehouse lookup by route
	const warehouseIdByRoute = new Map(insertedRoutes.map((r) => [r.id, r.warehouseId]));

	// 3. Generate users
	console.log('\n3. Creating users...');
	const userData = await generateUsers(seedConfig);
	await db.insert(user).values(
		userData.users.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email,
			phone: u.phone,
			role: u.role,
			weeklyCap: u.weeklyCap,
			isFlagged: u.isFlagged,
			flagWarningDate: u.flagWarningDate,
			createdAt: u.createdAt,
			updatedAt: u.createdAt
		}))
	);
	await db.insert(account).values(
		userData.accounts.map((a) => ({
			id: a.id,
			userId: a.userId,
			accountId: a.accountId,
			providerId: a.providerId,
			password: a.password,
			createdAt: a.createdAt,
			updatedAt: a.createdAt
		}))
	);
	const drivers = userData.users.filter((u) => u.role === 'driver');
	const managers = userData.users.filter((u) => u.role === 'manager');
	console.log(`   Created ${drivers.length} drivers, ${managers.length} managers`);

	// 3b. Assign managers to warehouses
	console.log('\n3b. Assigning managers to warehouses...');
	const warehouseManagerAssignments: { warehouseId: string; userId: string }[] = [];

	// Assign each seeded manager to 1-2 warehouses
	managers.forEach((manager, idx) => {
		// Assign to primary warehouse (round-robin)
		const primaryWarehouseIdx = idx % insertedWarehouses.length;
		warehouseManagerAssignments.push({
			warehouseId: insertedWarehouses[primaryWarehouseIdx].id,
			userId: manager.id
		});

		// Some managers get a second warehouse
		if (idx % 3 === 0 && insertedWarehouses.length > 1) {
			const secondaryIdx = (primaryWarehouseIdx + 1) % insertedWarehouses.length;
			warehouseManagerAssignments.push({
				warehouseId: insertedWarehouses[secondaryIdx].id,
				userId: manager.id
			});
		}
	});

	// Also add the test user (from .env) to all warehouses if they exist
	const testUserEmail = process.env.TEST_USER_EMAIL;
	if (testUserEmail) {
		const [testUser] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, testUserEmail));

		if (testUser) {
			// Add test user to all warehouses so they can see everything
			for (const warehouse of insertedWarehouses) {
				warehouseManagerAssignments.push({
					warehouseId: warehouse.id,
					userId: testUser.id
				});
			}
			console.log(
				`   Added test user ${testUserEmail} to all ${insertedWarehouses.length} warehouses`
			);
		}
	}

	if (warehouseManagerAssignments.length > 0) {
		await db.insert(warehouseManagers).values(warehouseManagerAssignments);
	}
	console.log(`   Created ${warehouseManagerAssignments.length} warehouse-manager assignments`);

	// 4. Generate preferences
	console.log('\n4. Creating preferences...');
	const routeIds = insertedRoutes.map((r) => r.id);
	const prefsData = generatePreferences(drivers, routeIds);
	await db.insert(driverPreferences).values(
		prefsData.map((p) => ({
			userId: p.userId,
			preferredDays: p.preferredDays,
			preferredRoutes: p.preferredRoutes,
			updatedAt: new Date()
		}))
	);
	console.log(`   Created ${prefsData.length} preference records`);

	// 5. Generate metrics
	console.log('\n5. Creating metrics...');
	const metricsData = generateMetrics(drivers);
	await db.insert(driverMetrics).values(
		metricsData.map((m) => ({
			userId: m.userId,
			totalShifts: m.totalShifts,
			completedShifts: m.completedShifts,
			attendanceRate: m.attendanceRate,
			completionRate: m.completionRate,
			updatedAt: new Date()
		}))
	);
	console.log(`   Created ${metricsData.length} metric records`);

	// 6. Generate assignments and shifts
	console.log('\n6. Creating assignments and shifts...');
	const assignmentData = generateAssignments(
		seedConfig,
		drivers,
		prefsData,
		routeIds,
		warehouseIdByRoute
	);

	const insertedAssignments = await db
		.insert(assignments)
		.values(
			assignmentData.assignments.map((a) => ({
				routeId: a.routeId,
				userId: a.userId,
				warehouseId: a.warehouseId,
				date: a.date,
				status: a.status,
				assignedBy: a.assignedBy,
				assignedAt: a.assignedAt
			}))
		)
		.returning({ id: assignments.id });

	// Create shifts linked to assignments
	if (assignmentData.shifts.length > 0) {
		await db.insert(shifts).values(
			assignmentData.shifts.map((s) => ({
				assignmentId: insertedAssignments[s.assignmentIndex].id,
				parcelsStart: s.parcelsStart,
				parcelsDelivered: s.parcelsDelivered,
				parcelsReturned: s.parcelsReturned,
				startedAt: s.startedAt,
				completedAt: s.completedAt,
				cancelledAt: s.cancelledAt,
				cancelReason: s.cancelReason as
					| 'vehicle_breakdown'
					| 'medical_emergency'
					| 'family_emergency'
					| 'traffic_accident'
					| 'weather_conditions'
					| 'personal_emergency'
					| 'other'
					| null,
				cancelNotes: s.cancelNotes
			}))
		);
	}

	const statusCounts = assignmentData.assignments.reduce(
		(acc, a) => {
			acc[a.status] = (acc[a.status] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);
	console.log(`   Created ${insertedAssignments.length} assignments:`, statusCounts);
	console.log(`   Created ${assignmentData.shifts.length} shifts`);

	// 7. Generate route completions
	console.log('\n7. Creating route completions...');
	const completionsData = generateRouteCompletions(assignmentData.assignments);
	if (completionsData.length > 0) {
		await db.insert(routeCompletions).values(
			completionsData.map((c) => ({
				userId: c.userId,
				routeId: c.routeId,
				completionCount: c.completionCount,
				lastCompletedAt: c.lastCompletedAt
			}))
		);
	}
	console.log(`   Created ${completionsData.length} route completion records`);

	// 8. Generate bidding
	console.log('\n8. Creating bid windows and bids...');
	const biddingData = generateBidding(assignmentData.assignments, drivers);

	if (biddingData.bidWindows.length > 0) {
		await db.insert(bidWindows).values(
			biddingData.bidWindows.map((w) => ({
				assignmentId: insertedAssignments[w.assignmentIndex].id,
				opensAt: w.opensAt,
				closesAt: w.closesAt,
				status: w.status,
				winnerId: w.winnerId
			}))
		);
	}

	if (biddingData.bids.length > 0) {
		await db.insert(bids).values(
			biddingData.bids.map((b) => ({
				assignmentId: insertedAssignments[b.assignmentIndex].id,
				userId: b.userId,
				score: b.score,
				status: b.status,
				bidAt: b.bidAt,
				windowClosesAt: b.windowClosesAt,
				resolvedAt: b.resolvedAt
			}))
		);
	}

	console.log(`   Created ${biddingData.bidWindows.length} bid windows`);
	console.log(`   Created ${biddingData.bids.length} bids`);

	// Summary
	console.log('\n========================================');
	console.log('Seed complete!');
	console.log('========================================');
	console.log(`\nTest credentials:`);
	console.log(`  Password for all users: ${getSeedPassword()}`);
	console.log(`\nSample driver emails:`);
	drivers.slice(0, 3).forEach((d) => console.log(`  - ${d.email}`));
	console.log(`\nSample manager emails:`);
	managers.slice(0, 2).forEach((m) => console.log(`  - ${m.email}`));
}

async function main() {
	const args = process.argv.slice(2);
	const isStaging = args.includes('--staging');
	const seedConfig = getConfig(isStaging);

	console.log(`\n🌱 Drive Seed Script`);
	console.log(`Mode: ${isStaging ? 'STAGING' : 'DEV'}`);

	await clearData();
	await seed(seedConfig);
}

main().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
