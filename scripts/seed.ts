#!/usr/bin/env tsx
/**
 * Seed Script
 *
 * Generates realistic test data for the Drive app.
 * Creates two organizations (org-a primary, org-b secondary) for multi-tenant testing.
 *
 * Usage:
 *   pnpm seed           # Dev mode: 10 drivers
 *   pnpm seed:staging   # Staging mode: 100 drivers
 *   pnpm seed -- --deterministic --seed=42 --anchor-date=2026-02-01
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, inArray } from 'drizzle-orm';
import { config } from 'dotenv';
import { faker } from '@faker-js/faker';

// Schema imports
import { user, account } from '../src/lib/server/db/auth-schema';
import { createHash, randomBytes } from 'node:crypto';
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
	auditLogs,
	driverHealthSnapshots,
	driverHealthState,
	organizations,
	organizationDispatchSettings,
	signupOnboarding
} from '../src/lib/server/db/schema';

// Seed modules
import { getOrgConfigs, type OrgSeedConfig, type SeedConfig } from './seed/config';
import { generateWarehouses } from './seed/generators/warehouses';
import { generateRoutes } from './seed/generators/routes';
import { generateUsers, getSeedPassword, type GeneratedUser } from './seed/generators/users';
import { generatePreferences } from './seed/generators/preferences';
import { generateMetrics } from './seed/generators/metrics';
import { generateAssignments } from './seed/generators/assignments';
import { generateRouteCompletions } from './seed/generators/route-completions';
import { generateBidding } from './seed/generators/bidding';
import { generateNotifications } from './seed/generators/notifications';
import { generateHealth } from './seed/generators/health';
import { configureSeedRuntime, getSeedNow } from './seed/utils/runtime';

config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error('DATABASE_URL not set');
	process.exit(1);
}

const sqlClient = neon(DATABASE_URL);
const db = drizzle(sqlClient);

const SEED_ORG_SLUGS = ['seed-org-a', 'seed-org-b'];

function hashJoinCode(code: string): string {
	return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

async function createSeedOrganization(slug: string, name: string): Promise<string> {
	const joinCode = randomBytes(6).toString('hex').toUpperCase();
	const [org] = await db
		.insert(organizations)
		.values({
			name,
			slug,
			joinCodeHash: hashJoinCode(joinCode),
			ownerUserId: null
		})
		.onConflictDoUpdate({
			target: organizations.slug,
			set: {
				name,
				joinCodeHash: hashJoinCode(joinCode)
			}
		})
		.returning({ id: organizations.id });

	if (!org) throw new Error(`Failed to create seed organization: ${slug}`);

	await db
		.insert(organizationDispatchSettings)
		.values({ organizationId: org.id, updatedBy: null })
		.onConflictDoNothing();

	console.log(`   Created org "${name}" (${slug}): ${org.id} (join code: ${joinCode})`);
	return org.id;
}

async function clearData(): Promise<Map<string, string>> {
	console.log('Clearing existing data...');
	const existingSeedOrgs = await db
		.select({ id: organizations.id, slug: organizations.slug })
		.from(organizations)
		.where(inArray(organizations.slug, SEED_ORG_SLUGS));
	const existingOrgIds = existingSeedOrgs.map((org) => org.id);

	if (existingOrgIds.length > 0) {
		const seedWarehouses = await db
			.select({ id: warehouses.id })
			.from(warehouses)
			.where(inArray(warehouses.organizationId, existingOrgIds));
		const warehouseIds = seedWarehouses.map((warehouse) => warehouse.id);

		const seedRoutes = warehouseIds.length
			? await db
					.select({ id: routes.id })
					.from(routes)
					.where(inArray(routes.warehouseId, warehouseIds))
			: [];
		const routeIds = seedRoutes.map((route) => route.id);

		const seedUsers = await db
			.select({ id: user.id })
			.from(user)
			.where(inArray(user.organizationId, existingOrgIds));
		const userIds = seedUsers.map((seedUser) => seedUser.id);

		const seedAssignments = warehouseIds.length
			? await db
					.select({ id: assignments.id })
					.from(assignments)
					.where(inArray(assignments.warehouseId, warehouseIds))
			: [];
		const assignmentIds = seedAssignments.map((assignment) => assignment.id);

		if (userIds.length > 0) {
			await db.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
			await db.delete(driverHealthSnapshots).where(inArray(driverHealthSnapshots.userId, userIds));
			await db.delete(driverHealthState).where(inArray(driverHealthState.userId, userIds));
			await db.delete(driverMetrics).where(inArray(driverMetrics.userId, userIds));
			await db.delete(driverPreferences).where(inArray(driverPreferences.userId, userIds));
		}

		if (existingOrgIds.length > 0) {
			await db.delete(auditLogs).where(inArray(auditLogs.organizationId, existingOrgIds));
			await db
				.delete(signupOnboarding)
				.where(inArray(signupOnboarding.organizationId, existingOrgIds));
			await db.delete(notifications).where(inArray(notifications.organizationId, existingOrgIds));
		}

		if (assignmentIds.length > 0) {
			await db.delete(bids).where(inArray(bids.assignmentId, assignmentIds));
			await db.delete(bidWindows).where(inArray(bidWindows.assignmentId, assignmentIds));
			await db.delete(shifts).where(inArray(shifts.assignmentId, assignmentIds));
			await db.delete(assignments).where(inArray(assignments.id, assignmentIds));
		}

		if (routeIds.length > 0) {
			await db.delete(routeCompletions).where(inArray(routeCompletions.routeId, routeIds));
			await db.delete(routes).where(inArray(routes.id, routeIds));
		}

		if (warehouseIds.length > 0) {
			await db
				.delete(warehouseManagers)
				.where(inArray(warehouseManagers.warehouseId, warehouseIds));
			await db.delete(warehouses).where(inArray(warehouses.id, warehouseIds));
		}

		if (userIds.length > 0) {
			await db.delete(account).where(inArray(account.userId, userIds));
			await db.delete(user).where(inArray(user.id, userIds));
		}

		await db
			.delete(organizationDispatchSettings)
			.where(inArray(organizationDispatchSettings.organizationId, existingOrgIds));
		await db.delete(organizations).where(inArray(organizations.id, existingOrgIds));
	}

	// Create seed orgs fresh after scoped cleanup
	console.log('\n   Creating seed organizations...');
	const orgIds = new Map<string, string>();
	const orgAId = await createSeedOrganization('seed-org-a', 'Toronto Metro Logistics');
	const orgBId = await createSeedOrganization('seed-org-b', 'Hamilton Delivery Co');
	orgIds.set('seed-org-a', orgAId);
	orgIds.set('seed-org-b', orgBId);

	console.log('Data cleared.');
	return orgIds;
}

async function seedOrg(orgConfig: OrgSeedConfig, orgId: string, isPrimary: boolean): Promise<void> {
	const seedConfig = orgConfig.config;
	const label = orgConfig.slug;
	const demoFixture = orgConfig.demoFixture;

	console.log(`\n${'='.repeat(50)}`);
	console.log(`Seeding ${orgConfig.name} (${label})`);
	console.log(
		`Config: ${seedConfig.drivers} drivers, ${seedConfig.managers} managers, ${seedConfig.routes} routes`
	);
	console.log(`${'='.repeat(50)}`);

	// 1. Generate warehouses
	console.log('\n1. Creating warehouses...');
	const warehouseData = demoFixture
		? demoFixture.warehouses.map((warehouse) => ({
				name: warehouse.name,
				address: warehouse.address
			}))
		: generateWarehouses(seedConfig, orgConfig.warehouseOffset);
	const insertedWarehouses = await db
		.insert(warehouses)
		.values(warehouseData.map((w) => ({ name: w.name, address: w.address, organizationId: orgId })))
		.returning({ id: warehouses.id, name: warehouses.name });
	console.log(`   Created ${insertedWarehouses.length} warehouses`);
	const warehouseNameById = new Map(insertedWarehouses.map((w) => [w.id, w.name]));
	const warehouseIdByKey = new Map<string, string>();
	if (demoFixture) {
		demoFixture.warehouses.forEach((warehouse, index) => {
			const inserted = insertedWarehouses[index];
			if (inserted) {
				warehouseIdByKey.set(warehouse.key, inserted.id);
			}
		});
	}

	// 2. Generate routes
	console.log('\n2. Creating routes...');
	const warehouseNames = insertedWarehouses.map((w) => w.name);
	const routeData = demoFixture
		? demoFixture.routes.map((route) => ({
				name: route.name,
				warehouseIndex: demoFixture.warehouses.findIndex(
					(warehouse) => warehouse.key === route.warehouseKey
				),
				startTime: route.startTime
			}))
		: generateRoutes(seedConfig, warehouseNames);
	const insertedRoutes = await db
		.insert(routes)
		.values(
			routeData.map((r) => ({
				name: r.name,
				warehouseId: insertedWarehouses[r.warehouseIndex].id,
				startTime: r.startTime
			}))
		)
		.returning({
			id: routes.id,
			name: routes.name,
			warehouseId: routes.warehouseId,
			startTime: routes.startTime
		});
	console.log(`   Created ${insertedRoutes.length} routes`);
	const routesWithWarehouses = insertedRoutes.map((route) => ({
		id: route.id,
		name: route.name,
		warehouseId: route.warehouseId,
		warehouseName: warehouseNameById.get(route.warehouseId) ?? 'Warehouse'
	}));

	// Build warehouse and start time lookups by route
	const warehouseIdByRoute = new Map(insertedRoutes.map((r) => [r.id, r.warehouseId]));
	const routeStartTimeById = new Map(insertedRoutes.map((r) => [r.id, r.startTime]));
	const routeIdByKey = new Map<string, string>();
	if (demoFixture) {
		demoFixture.routes.forEach((route, index) => {
			const inserted = insertedRoutes[index];
			if (inserted) {
				routeIdByKey.set(route.key, inserted.id);
			}
		});
	}

	// 3. Generate users
	console.log('\n3. Creating users...');
	const userData = await generateUsers(seedConfig, {
		driverEmailDomain: orgConfig.driverEmailDomain,
		managerEmailDomain: orgConfig.managerEmailDomain,
		idPrefix: isPrimary ? '' : 'orgb',
		demoFixture
	});
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
			organizationId: orgId,
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
	const managerByEmail = new Map(managers.map((manager) => [manager.email, manager]));
	console.log(`   Created ${drivers.length} drivers, ${managers.length} managers`);

	const ownerManagerEmail = demoFixture
		? demoFixture.managers.find((manager) => manager.key === demoFixture.ownerManagerKey)?.email
		: managers[0]?.email;
	if (ownerManagerEmail) {
		const ownerManager = managerByEmail.get(ownerManagerEmail);
		if (ownerManager) {
			await db
				.update(organizations)
				.set({ ownerUserId: ownerManager.id, updatedAt: getSeedNow() })
				.where(eq(organizations.id, orgId));
		}
	}

	// 3b. Assign managers to warehouses
	console.log('\n3b. Assigning managers to warehouses...');
	const warehouseManagerAssignments: { warehouseId: string; userId: string }[] = [];
	let testUserForNotifications: GeneratedUser | null = null;
	const warehouseManagerUserIdsByWarehouseId = new Map<string, string[]>();

	if (demoFixture) {
		for (const warehouse of demoFixture.warehouses) {
			const warehouseId = warehouseIdByKey.get(warehouse.key);
			if (!warehouseId) {
				throw new Error(`Missing warehouse ID for demo key ${warehouse.key}`);
			}
			for (const managerKey of warehouse.managerKeys) {
				const managerEmail = demoFixture.managers.find(
					(manager) => manager.key === managerKey
				)?.email;
				const manager = managerEmail ? managerByEmail.get(managerEmail) : null;
				if (!manager) {
					throw new Error(`Missing seeded manager for ${managerKey}`);
				}
				warehouseManagerAssignments.push({ warehouseId, userId: manager.id });
				warehouseManagerUserIdsByWarehouseId.set(warehouseId, [
					...(warehouseManagerUserIdsByWarehouseId.get(warehouseId) ?? []),
					manager.id
				]);
			}
		}
	} else {
		// Assign each seeded manager to 1-2 warehouses
		managers.forEach((manager, idx) => {
			const primaryWarehouseIdx = idx % insertedWarehouses.length;
			warehouseManagerAssignments.push({
				warehouseId: insertedWarehouses[primaryWarehouseIdx].id,
				userId: manager.id
			});

			warehouseManagerUserIdsByWarehouseId.set(insertedWarehouses[primaryWarehouseIdx].id, [
				...(warehouseManagerUserIdsByWarehouseId.get(insertedWarehouses[primaryWarehouseIdx].id) ??
					[]),
				manager.id
			]);

			if (idx % 3 === 0 && insertedWarehouses.length > 1) {
				const secondaryIdx = (primaryWarehouseIdx + 1) % insertedWarehouses.length;
				warehouseManagerAssignments.push({
					warehouseId: insertedWarehouses[secondaryIdx].id,
					userId: manager.id
				});
				warehouseManagerUserIdsByWarehouseId.set(insertedWarehouses[secondaryIdx].id, [
					...(warehouseManagerUserIdsByWarehouseId.get(insertedWarehouses[secondaryIdx].id) ?? []),
					manager.id
				]);
			}
		});
	}

	// For primary org, add the test user to all warehouses
	if (isPrimary && !demoFixture) {
		const testUserEmail = process.env.TEST_USER_EMAIL;
		if (testUserEmail) {
			const [testUser] = await db
				.select({
					id: user.id,
					name: user.name,
					email: user.email,
					phone: user.phone,
					role: user.role,
					weeklyCap: user.weeklyCap,
					isFlagged: user.isFlagged,
					flagWarningDate: user.flagWarningDate,
					createdAt: user.createdAt
				})
				.from(user)
				.where(eq(user.email, testUserEmail));

			if (testUser) {
				for (const warehouse of insertedWarehouses) {
					warehouseManagerAssignments.push({
						warehouseId: warehouse.id,
						userId: testUser.id
					});
				}
				// Set test user as org owner
				await db
					.update(organizations)
					.set({ ownerUserId: testUser.id, updatedAt: new Date() })
					.where(eq(organizations.id, orgId));
				testUserForNotifications = {
					id: testUser.id,
					name: testUser.name,
					email: testUser.email,
					phone: testUser.phone ?? '',
					role: testUser.role === 'manager' ? 'manager' : 'driver',
					weeklyCap: testUser.weeklyCap ?? 4,
					isFlagged: testUser.isFlagged ?? false,
					flagWarningDate: testUser.flagWarningDate ?? null,
					createdAt: testUser.createdAt ?? new Date()
				};
				console.log(
					`   Added test user ${testUserEmail} to all ${insertedWarehouses.length} warehouses`
				);
			}
		}
	}

	if (warehouseManagerAssignments.length > 0) {
		await db.insert(warehouseManagers).values(warehouseManagerAssignments);
	}
	console.log(`   Created ${warehouseManagerAssignments.length} warehouse-manager assignments`);

	// 3c. Assign a primary manager to each route (for manager alert verification)
	console.log('\n3c. Assigning primary managers to routes...');
	const routeManagerIdByRouteId = new Map<string, string>();
	if (demoFixture) {
		for (let index = 0; index < demoFixture.routes.length; index++) {
			const routeFixture = demoFixture.routes[index];
			const insertedRoute = insertedRoutes[index];
			const managerEmail = demoFixture.managers.find(
				(manager) => manager.key === routeFixture.managerKey
			)?.email;
			const manager = managerEmail ? managerByEmail.get(managerEmail) : null;
			if (!insertedRoute || !manager) {
				throw new Error(`Missing route manager mapping for ${routeFixture.key}`);
			}
			routeManagerIdByRouteId.set(insertedRoute.id, manager.id);
		}
		if (routeManagerIdByRouteId.size > 0) {
			for (const [routeId, managerId] of routeManagerIdByRouteId.entries()) {
				await db
					.update(routes)
					.set({ managerId, updatedAt: getSeedNow() })
					.where(eq(routes.id, routeId));
			}
			console.log(`   Assigned named managers to ${routeManagerIdByRouteId.size} routes`);
		} else {
			console.log('   No demo route managers mapped');
		}
	} else if (managers.length > 0) {
		const primaryManagerId = managers[0].id;
		insertedRoutes.forEach((route) => routeManagerIdByRouteId.set(route.id, primaryManagerId));
		await db
			.update(routes)
			.set({ managerId: primaryManagerId, updatedAt: getSeedNow() })
			.where(
				inArray(
					routes.id,
					insertedRoutes.map((r) => r.id)
				)
			);
		console.log(`   Assigned primary manager to ${insertedRoutes.length} routes`);
	} else {
		console.log('   No managers seeded; skipping route manager assignment');
	}

	// 4. Generate preferences
	console.log('\n4. Creating preferences...');
	const routeIds = insertedRoutes.map((r) => r.id);
	const prefsData = generatePreferences(drivers, routeIds, {
		demoFixture,
		routeIdByKey
	});
	await db.insert(driverPreferences).values(
		prefsData.map((p) => ({
			userId: p.userId,
			preferredDays: p.preferredDays,
			preferredRoutes: p.preferredRoutes,
			updatedAt: getSeedNow()
		}))
	);
	console.log(`   Created ${prefsData.length} preference records`);

	// 5. Generate assignments and shifts
	console.log('\n5. Creating assignments and shifts...');
	const assignmentData = generateAssignments(
		seedConfig,
		drivers,
		prefsData,
		routeIds,
		warehouseIdByRoute,
		routeStartTimeById,
		{ demoFixture, routeIdByKey }
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
				assignedAt: a.assignedAt,
				confirmedAt: a.confirmedAt,
				cancelType: a.cancelType
			}))
		)
		.returning({ id: assignments.id });

	// Create shifts linked to assignments
	if (assignmentData.shifts.length > 0) {
		await db.insert(shifts).values(
			assignmentData.shifts.map((s) => ({
				assignmentId: insertedAssignments[s.assignmentIndex].id,
				arrivedAt: s.arrivedAt,
				parcelsStart: s.parcelsStart,
				parcelsDelivered: s.parcelsDelivered,
				parcelsReturned: s.parcelsReturned,
				startedAt: s.startedAt,
				completedAt: s.completedAt,
				editableUntil: s.editableUntil,
				exceptedReturns: s.exceptedReturns,
				exceptionNotes: s.exceptionNotes,
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
	console.log(`   No-show assignments: ${assignmentData.noShowIndices.length}`);
	console.log(
		`   Personas: exemplary=${assignmentData.personas.exemplary.length}, good=${assignmentData.personas.good.length}, unreliable=${assignmentData.personas.unreliable.length}, new=${assignmentData.personas.new.length}`
	);

	// 6. Generate route completions
	console.log('\n6. Creating route completions...');
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

	// 7. Generate metrics
	console.log('\n7. Creating metrics...');
	const metricsData = generateMetrics(drivers, assignmentData.assignments, assignmentData.shifts);
	await db.insert(driverMetrics).values(
		metricsData.map((m) => ({
			userId: m.userId,
			totalShifts: m.totalShifts,
			completedShifts: m.completedShifts,
			attendanceRate: m.attendanceRate,
			completionRate: m.completionRate,
			avgParcelsDelivered: m.avgParcelsDelivered,
			totalAssigned: m.totalAssigned,
			confirmedShifts: m.confirmedShifts,
			autoDroppedShifts: m.autoDroppedShifts,
			lateCancellations: m.lateCancellations,
			noShows: m.noShows,
			bidPickups: m.bidPickups,
			arrivedOnTimeCount: m.arrivedOnTimeCount,
			highDeliveryCount: m.highDeliveryCount,
			urgentPickups: m.urgentPickups,
			updatedAt: getSeedNow()
		}))
	);
	console.log(`   Created ${metricsData.length} metric records`);

	// 8. Generate health snapshots and state
	console.log('\n8. Creating health snapshots and state...');
	const healthData = generateHealth(
		drivers,
		assignmentData.assignments,
		assignmentData.shifts,
		metricsData,
		{ demoFixture }
	);

	if (healthData.snapshots.length > 0) {
		await db.insert(driverHealthSnapshots).values(
			healthData.snapshots.map((s) => ({
				userId: s.userId,
				evaluatedAt: s.evaluatedAt,
				score: s.score,
				attendanceRate: s.attendanceRate,
				completionRate: s.completionRate,
				lateCancellationCount30d: s.lateCancellationCount30d,
				noShowCount30d: s.noShowCount30d,
				hardStopTriggered: s.hardStopTriggered,
				reasons: s.reasons,
				contributions: s.contributions
			}))
		);
	}

	if (healthData.states.length > 0) {
		await db.insert(driverHealthState).values(
			healthData.states.map((s) => ({
				userId: s.userId,
				currentScore: s.currentScore,
				streakWeeks: s.streakWeeks,
				stars: s.stars,
				lastQualifiedWeekStart: s.lastQualifiedWeekStart,
				assignmentPoolEligible: s.assignmentPoolEligible,
				requiresManagerIntervention: s.requiresManagerIntervention,
				nextMilestoneStars: s.nextMilestoneStars,
				lastScoreResetAt: s.lastScoreResetAt,
				updatedAt: getSeedNow()
			}))
		);
	}

	console.log(`   Created ${healthData.snapshots.length} health snapshots`);
	console.log(`   Created ${healthData.states.length} health state records`);

	// Log star distribution
	const starDist = healthData.states.reduce(
		(acc, s) => {
			acc[s.stars] = (acc[s.stars] || 0) + 1;
			return acc;
		},
		{} as Record<number, number>
	);
	console.log(`   Star distribution:`, starDist);
	const hardStopCount = healthData.states.filter((s) => !s.assignmentPoolEligible).length;
	if (hardStopCount > 0) {
		console.log(`   Hard-stop drivers: ${hardStopCount}`);
	}

	// 9. Generate bidding
	console.log('\n9. Creating bid windows and bids...');
	const biddingData = generateBidding(
		assignmentData.assignments,
		drivers,
		assignmentData.noShowIndices,
		{
			healthStates: healthData.states,
			routeCompletions: completionsData,
			preferences: prefsData,
			demoFixture,
			routeIdByKey
		}
	);
	const bidWindowIdsByAssignmentId = new Map<string, string>();

	if (biddingData.bidWindows.length > 0) {
		const bidWindowRows = biddingData.bidWindows.map((w) => ({
			assignmentId: insertedAssignments[w.assignmentIndex].id,
			opensAt: w.opensAt,
			closesAt: w.closesAt,
			status: w.status,
			winnerId: w.winnerId,
			mode: w.mode,
			trigger: w.trigger,
			payBonusPercent: w.payBonusPercent
		}));

		const insertedBidWindows = await db
			.insert(bidWindows)
			.values(bidWindowRows)
			.returning({ id: bidWindows.id, assignmentId: bidWindows.assignmentId });

		for (const row of insertedBidWindows) {
			bidWindowIdsByAssignmentId.set(row.assignmentId, row.id);
		}
	}

	if (biddingData.bids.length > 0) {
		await db.insert(bids).values(
			biddingData.bids
				.map((b) => {
					const assignmentId = insertedAssignments[b.assignmentIndex].id;
					const bidWindowId = bidWindowIdsByAssignmentId.get(assignmentId);

					if (!bidWindowId) {
						return null;
					}

					return {
						assignmentId,
						bidWindowId,
						userId: b.userId,
						score: b.score,
						status: b.status,
						bidAt: b.bidAt,
						windowClosesAt: b.windowClosesAt,
						resolvedAt: b.resolvedAt
					};
				})
				.filter((row): row is NonNullable<typeof row> => row !== null)
		);
	}

	const modeCounts = biddingData.bidWindows.reduce(
		(acc, w) => {
			acc[w.mode] = (acc[w.mode] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>
	);
	console.log(`   Created ${biddingData.bidWindows.length} bid windows:`, modeCounts);
	console.log(`   Created ${biddingData.bids.length} bids`);

	// 10. Generate notifications
	console.log('\n10. Creating notifications...');
	const notificationUsers = testUserForNotifications
		? userData.users.some((u) => u.id === testUserForNotifications?.id)
			? userData.users
			: [...userData.users, testUserForNotifications]
		: userData.users;
	// Build assignment ID lookup for notifications
	const assignmentIdByIndex = new Map<number, string>();
	for (let i = 0; i < insertedAssignments.length; i++) {
		assignmentIdByIndex.set(i, insertedAssignments[i].id);
	}

	const notificationData = generateNotifications(notificationUsers, routesWithWarehouses, {
		assignments: assignmentData.assignments,
		shifts: assignmentData.shifts,
		bidWindows: biddingData.bidWindows,
		bids: biddingData.bids,
		healthStates: healthData.states,
		personas: assignmentData.personas,
		noShowIndices: assignmentData.noShowIndices,
		assignmentIdByIndex,
		demoFixture,
		routeManagerIdByRouteId,
		warehouseManagerUserIdsByWarehouseId
	});
	if (notificationData.length > 0) {
		await db.insert(notifications).values(
			notificationData.map((notification) => ({
				userId: notification.userId,
				organizationId: orgId,
				type: notification.type,
				title: notification.title,
				body: notification.body,
				data: notification.data,
				read: notification.read,
				createdAt: notification.createdAt
			}))
		);
	}
	console.log(`   Created ${notificationData.length} notifications`);

	// Summary for this org
	console.log(`\n   ${orgConfig.name} seeding complete.`);
	console.log(`   Sample driver emails:`);
	drivers.slice(0, 3).forEach((d) => console.log(`     - ${d.email}`));
	console.log(`   Sample manager emails:`);
	managers.slice(0, 2).forEach((m) => console.log(`     - ${m.email}`));
}

async function main() {
	const args = process.argv.slice(2);
	const profileArg = args.find((arg) => arg.startsWith('--profile='));
	const profileFromEquals = profileArg ? profileArg.split('=')[1] : null;
	const profileFromNext = (() => {
		const profileIndex = args.indexOf('--profile');
		if (profileIndex === -1) return null;
		return args[profileIndex + 1] ?? null;
	})();
	const profile = (profileFromEquals ??
		profileFromNext ??
		(args.includes('--staging') ? 'staging' : 'dev')) as 'dev' | 'staging' | 'demo';
	const deterministic = args.includes('--deterministic') || profile === 'demo';

	const seedArg = args.find((arg) => arg.startsWith('--seed='));
	const seedFromEquals = seedArg ? Number(seedArg.split('=')[1]) : null;
	const seedFromNext = (() => {
		const seedIndex = args.indexOf('--seed');
		if (seedIndex === -1) return null;
		const next = args[seedIndex + 1];
		return next ? Number(next) : null;
	})();
	const seedValue = Number.isFinite(seedFromEquals) ? seedFromEquals : seedFromNext;

	const anchorArg = args.find((arg) => arg.startsWith('--anchor-date='));
	const anchorFromEquals = anchorArg ? anchorArg.split('=')[1] : null;
	const anchorFromNext = (() => {
		const anchorIndex = args.indexOf('--anchor-date');
		if (anchorIndex === -1) return null;
		return args[anchorIndex + 1] ?? null;
	})();
	const anchorDate = anchorFromEquals ?? anchorFromNext;

	configureSeedRuntime({
		deterministic,
		seed: seedValue ?? undefined,
		anchorDate: anchorDate ?? undefined
	});
	if (seedValue !== null && Number.isFinite(seedValue)) {
		faker.seed(seedValue);
	}
	if (anchorDate) {
		faker.setDefaultRefDate(new Date(`${anchorDate}T12:00:00.000Z`));
	}

	const orgConfigs = getOrgConfigs(profile, {
		deterministic,
		seed: seedValue ?? null,
		anchorDate: anchorDate ?? null
	});

	console.log(`\n🌱 Drive Seed Script`);
	console.log(`Mode: ${profile.toUpperCase()}`);
	console.log(`Organizations: ${orgConfigs.length}`);
	if (deterministic) {
		console.log(`Deterministic mode: ON${seedValue !== null ? ` (seed=${seedValue})` : ''}`);
		if (anchorDate) {
			console.log(`Anchor date: ${anchorDate}`);
		}
	}

	const orgIds = await clearData();

	for (let i = 0; i < orgConfigs.length; i++) {
		const orgConfig = orgConfigs[i];
		const orgId = orgIds.get(orgConfig.slug);
		if (!orgId) throw new Error(`Missing org ID for ${orgConfig.slug}`);
		await seedOrg(orgConfig, orgId, i === 0);
	}

	// Final summary
	console.log('\n========================================');
	console.log('Seed complete!');
	console.log('========================================');
	console.log(`\nTest credentials:`);
	console.log(`  Password for all users: ${getSeedPassword()}`);
	console.log(`\nOrganizations:`);
	for (const oc of orgConfigs) {
		console.log(
			`  - ${oc.name} (${oc.slug}): ${oc.config.drivers} drivers, ${oc.config.managers} managers`
		);
	}
}

main().catch((err) => {
	console.error('Seed failed:', err);
	process.exit(1);
});
