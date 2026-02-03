/**
 * Users Generator
 *
 * Creates drivers with both user and account records.
 * Account records are required for Better Auth login.
 */

import { faker } from '@faker-js/faker';
import { nanoid } from 'nanoid';
import type { SeedConfig } from '../config';
import { hashPassword } from '../utils/password';

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

// Default password for all seeded users
const SEED_PASSWORD = 'test1234';

/**
 * Generate drivers and managers with their account records.
 */
export async function generateUsers(config: SeedConfig): Promise<GeneratedUsers> {
	const users: GeneratedUser[] = [];
	const accounts: GeneratedAccount[] = [];

	// Pre-hash the password once (all users share same password for testing)
	const hashedPassword = await hashPassword(SEED_PASSWORD);

	// Generate managers
	for (let i = 0; i < config.managers; i++) {
		const id = nanoid(21);
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		const email = faker.internet
			.email({ firstName, lastName, provider: 'drivermanager.test' })
			.toLowerCase();
		const createdAt = faker.date.past({ years: 1 });

		users.push({
			id,
			name: `${firstName} ${lastName}`,
			email,
			phone: faker.phone.number({ style: 'national' }),
			role: 'manager',
			weeklyCap: 5, // Managers don't use cap, but set a value
			isFlagged: false,
			flagWarningDate: null,
			createdAt
		});

		accounts.push({
			id: nanoid(21),
			userId: id,
			accountId: email,
			providerId: 'credential',
			password: hashedPassword,
			createdAt
		});
	}

	// Generate drivers
	for (let i = 0; i < config.drivers; i++) {
		const id = nanoid(21);
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		const email = faker.internet
			.email({ firstName, lastName, provider: 'driver.test' })
			.toLowerCase();
		const createdAt = faker.date.past({ years: 1 });

		// Weekly cap distribution
		// 70% at default (4), 20% at elevated (6), 10% reduced (3)
		let weeklyCap = 4;
		const capRoll = Math.random();
		if (capRoll < 0.1) {
			weeklyCap = 3; // Reduced due to flagging
		} else if (capRoll < 0.3) {
			weeklyCap = 6; // Elevated for high performers
		}

		// 10% of drivers are flagged
		const isFlagged = Math.random() < 0.1;
		const flagWarningDate = isFlagged ? faker.date.recent({ days: 7 }) : null;

		users.push({
			id,
			name: `${firstName} ${lastName}`,
			email,
			phone: faker.phone.number({ style: 'national' }),
			role: 'driver',
			weeklyCap,
			isFlagged,
			flagWarningDate,
			createdAt
		});

		accounts.push({
			id: nanoid(21),
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
