/**
 * Users Generator
 *
 * Creates drivers with both user and account records.
 * Account records are required for Better Auth login.
 * Supports configurable email domains for multi-org seeding.
 */

import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import type { SeedConfig } from '../config';
import { hashPassword } from '../utils/password';
import {
	getSeedNow,
	isDeterministicSeedRun,
	random,
	randomInt,
	getSeedValue
} from '../utils/runtime';

export interface GeneratedUser {
	id: string;
	name: string;
	email: string;
	phone: string;
	role: 'driver' | 'manager';
	weeklyCap: number;
	isFlagged: boolean;
	flagWarningDate: Date | null;
	createdAt: Date;
}

export interface GeneratedAccount {
	id: string;
	userId: string;
	accountId: string; // Better Auth uses email as accountId
	providerId: 'credential';
	password: string; // Hashed
	createdAt: Date;
}

export interface GeneratedUsers {
	users: GeneratedUser[];
	accounts: GeneratedAccount[];
}

export interface UserGeneratorOptions {
	driverEmailDomain?: string;
	managerEmailDomain?: string;
	idPrefix?: string;
}

// Default password for all seeded users
const SEED_PASSWORD = 'test1234';

function stableId(prefix: string, index: number): string {
	return `${prefix}_${String(index + 1).padStart(4, '0')}`;
}

function stablePhone(index: number): string {
	const suffix = String(1000 + (index % 9000));
	return `416-555-${suffix}`;
}

function createdAtDate(index: number): Date {
	const now = getSeedNow();
	const daysAgo = 30 + (index % 330);
	const value = new Date(now);
	value.setUTCDate(value.getUTCDate() - daysAgo);
	return value;
}

/**
 * Generate drivers and managers with their account records.
 */
export async function generateUsers(
	config: SeedConfig,
	options: UserGeneratorOptions = {}
): Promise<GeneratedUsers> {
	const users: GeneratedUser[] = [];
	const accounts: GeneratedAccount[] = [];
	const deterministic = config.deterministic || isDeterministicSeedRun();
	const driverDomain = options.driverEmailDomain ?? 'driver.test';
	const managerDomain = options.managerEmailDomain ?? 'drivermanager.test';
	const idPrefix = options.idPrefix ?? '';

	if (config.seed !== null) {
		faker.seed(config.seed);
	}

	faker.setDefaultRefDate(
		config.anchorDate ? new Date(`${config.anchorDate}T12:00:00.000Z`) : getSeedNow()
	);

	// Pre-hash the password once (all users share same password for testing)
	const hashedPassword = await hashPassword(
		SEED_PASSWORD,
		deterministic ? `seed-${config.seed ?? getSeedValue()}` : undefined
	);

	// Generate managers
	for (let i = 0; i < config.managers; i++) {
		const stablePrefix = idPrefix ? `${idPrefix}_manager` : 'manager';
		const id = deterministic ? stableId(stablePrefix, i) : nanoid(21);
		const firstName = deterministic ? 'Manager' : faker.person.firstName();
		const lastName = deterministic ? String(i + 1).padStart(3, '0') : faker.person.lastName();
		const emailPrefix = idPrefix
			? `${idPrefix}_manager${String(i + 1).padStart(3, '0')}`
			: deterministic
				? `manager${String(i + 1).padStart(3, '0')}`
				: null;
		const email = emailPrefix
			? `${emailPrefix}@${managerDomain}`
			: faker.internet.email({ firstName, lastName, provider: managerDomain }).toLowerCase();
		const createdAt = deterministic ? createdAtDate(i) : faker.date.past({ years: 1 });

		users.push({
			id,
			name: `${firstName} ${lastName}`,
			email,
			phone: deterministic ? stablePhone(i) : faker.phone.number({ style: 'national' }),
			role: 'manager',
			weeklyCap: 5,
			isFlagged: false,
			flagWarningDate: null,
			createdAt
		});

		accounts.push({
			id: deterministic ? stableId(`${stablePrefix}_acct`, i) : nanoid(21),
			userId: id,
			accountId: email,
			providerId: 'credential',
			password: hashedPassword,
			createdAt
		});
	}

	// Generate drivers
	for (let i = 0; i < config.drivers; i++) {
		const stablePrefix = idPrefix ? `${idPrefix}_driver` : 'driver';
		const id = deterministic ? stableId(stablePrefix, i) : nanoid(21);
		const firstName = deterministic ? 'Driver' : faker.person.firstName();
		const lastName = deterministic ? String(i + 1).padStart(3, '0') : faker.person.lastName();
		const emailPrefix = idPrefix
			? `${idPrefix}_driver${String(i + 1).padStart(3, '0')}`
			: deterministic
				? `driver${String(i + 1).padStart(3, '0')}`
				: null;
		const email = emailPrefix
			? `${emailPrefix}@${driverDomain}`
			: faker.internet.email({ firstName, lastName, provider: driverDomain }).toLowerCase();
		const createdAt = deterministic
			? createdAtDate(config.managers + i)
			: faker.date.past({ years: 1 });

		// Weekly cap distribution
		// 70% at default (4), 20% at elevated (6), 10% reduced (3)
		let weeklyCap = 4;
		const capRoll = random();
		if (capRoll < 0.1) {
			weeklyCap = 3;
		} else if (capRoll < 0.3) {
			weeklyCap = 6;
		}

		// 10% of drivers are flagged
		const isFlagged = random() < 0.1;
		const flagWarningDate = isFlagged
			? deterministic
				? (() => {
						const warningDate = new Date(getSeedNow());
						warningDate.setUTCDate(warningDate.getUTCDate() - randomInt(1, 8));
						return warningDate;
					})()
				: faker.date.recent({ days: 7 })
			: null;

		users.push({
			id,
			name: `${firstName} ${lastName}`,
			email,
			phone: deterministic
				? stablePhone(config.managers + i)
				: faker.phone.number({ style: 'national' }),
			role: 'driver',
			weeklyCap,
			isFlagged,
			flagWarningDate,
			createdAt
		});

		accounts.push({
			id: deterministic ? stableId(`${stablePrefix}_acct`, i) : nanoid(21),
			userId: id,
			accountId: email,
			providerId: 'credential',
			password: hashedPassword,
			createdAt
		});
	}

	return { users, accounts };
}

/**
 * Get the password used for all seeded users.
 * Useful for logging login credentials.
 */
export function getSeedPassword(): string {
	return SEED_PASSWORD;
}
