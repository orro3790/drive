/**
 * Seed Configuration
 *
 * Scale settings for dev, staging, and curated demo environments.
 * Supports multi-org seeding with per-org config overrides.
 */

import {
	DEMO_FUTURE_WEEKS,
	DEMO_PAST_WEEKS,
	getDemoOrgFixture,
	type DemoOrgFixture
} from './demo-fixtures';

export type SeedProfile = 'dev' | 'staging' | 'demo';

export interface SeedConfig {
	profile: SeedProfile;
	drivers: number;
	managers: number;
	warehouses: number;
	routes: number;
	pastWeeks: number;
	futureWeeks: number;
	deterministic: boolean;
	seed: number | null;
	anchorDate: string | null;
	curated: boolean;
}

export interface DemoSeedConfig extends SeedConfig {
	profile: 'demo';
	curated: true;
	deterministic: true;
}

export interface OrgSeedConfig {
	slug: string;
	name: string;
	driverEmailDomain: string;
	managerEmailDomain: string;
	warehouseOffset: number;
	config: SeedConfig;
	demoFixture?: DemoOrgFixture;
}

export const DEV_CONFIG: SeedConfig = {
	profile: 'dev',
	drivers: 10,
	managers: 2,
	warehouses: 2,
	routes: 10,
	pastWeeks: 4,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null,
	curated: false
};

export const STAGING_CONFIG: SeedConfig = {
	profile: 'staging',
	drivers: 100,
	managers: 5,
	warehouses: 4,
	routes: 40,
	pastWeeks: 3,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null,
	curated: false
};

export const DEMO_CONFIG: DemoSeedConfig = {
	profile: 'demo',
	drivers: 10,
	managers: 2,
	warehouses: 2,
	routes: 8,
	pastWeeks: DEMO_PAST_WEEKS,
	futureWeeks: DEMO_FUTURE_WEEKS,
	deterministic: true,
	seed: null,
	anchorDate: null,
	curated: true
};

/**
 * Org-B config: smaller secondary organization.
 */
export const ORG_B_CONFIG: SeedConfig = {
	profile: 'dev',
	drivers: 3,
	managers: 1,
	warehouses: 1,
	routes: 3,
	pastWeeks: 4,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null,
	curated: false
};

export const DEMO_ORG_B_CONFIG: DemoSeedConfig = {
	profile: 'demo',
	drivers: 3,
	managers: 1,
	warehouses: 1,
	routes: 3,
	pastWeeks: DEMO_PAST_WEEKS,
	futureWeeks: DEMO_FUTURE_WEEKS,
	deterministic: true,
	seed: null,
	anchorDate: null,
	curated: true
};

function applyRuntimeOptions<T extends SeedConfig>(
	base: T,
	runtimeOptions?: {
		deterministic?: boolean;
		seed?: number | null;
		anchorDate?: string | null;
	}
): T {
	const deterministic =
		base.profile === 'demo'
			? (runtimeOptions?.deterministic ?? true)
			: (runtimeOptions?.deterministic ?? false);

	return {
		...base,
		deterministic,
		seed: runtimeOptions?.seed ?? null,
		anchorDate: runtimeOptions?.anchorDate ?? null
	};
}

function resolveProfile(profileOrIsStaging: SeedProfile | boolean): SeedProfile {
	if (typeof profileOrIsStaging === 'boolean') {
		return profileOrIsStaging ? 'staging' : 'dev';
	}
	return profileOrIsStaging;
}

export function getConfig(
	profileOrIsStaging: SeedProfile | boolean,
	runtimeOptions?: {
		deterministic?: boolean;
		seed?: number | null;
		anchorDate?: string | null;
	}
): SeedConfig {
	const profile = resolveProfile(profileOrIsStaging);
	if (profile === 'demo') {
		return applyRuntimeOptions(DEMO_CONFIG, runtimeOptions);
	}
	return applyRuntimeOptions(profile === 'staging' ? STAGING_CONFIG : DEV_CONFIG, runtimeOptions);
}

/**
 * Get multi-org configs for seeding.
 */
export function getOrgConfigs(
	profileOrIsStaging: SeedProfile | boolean,
	runtimeOptions?: {
		deterministic?: boolean;
		seed?: number | null;
		anchorDate?: string | null;
	}
): OrgSeedConfig[] {
	const profile = resolveProfile(profileOrIsStaging);
	if (profile === 'demo') {
		return [
			{
				slug: 'seed-org-a',
				name: 'Toronto Metro Logistics',
				driverEmailDomain: 'driver.test',
				managerEmailDomain: 'drivermanager.test',
				warehouseOffset: 0,
				config: applyRuntimeOptions(DEMO_CONFIG, runtimeOptions),
				demoFixture: getDemoOrgFixture('seed-org-a')
			},
			{
				slug: 'seed-org-b',
				name: 'Hamilton Delivery Co',
				driverEmailDomain: 'hamilton-driver.test',
				managerEmailDomain: 'hamiltonmanager.test',
				warehouseOffset: 2,
				config: applyRuntimeOptions(DEMO_ORG_B_CONFIG, runtimeOptions),
				demoFixture: getDemoOrgFixture('seed-org-b')
			}
		];
	}

	const baseConfig = getConfig(profile, runtimeOptions);
	const orgBBase = applyRuntimeOptions(
		{
			...ORG_B_CONFIG,
			profile
		},
		runtimeOptions
	);

	return [
		{
			slug: 'seed-org-a',
			name: 'Toronto Metro Logistics',
			driverEmailDomain: 'driver.test',
			managerEmailDomain: 'drivermanager.test',
			warehouseOffset: 0,
			config: baseConfig
		},
		{
			slug: 'seed-org-b',
			name: 'Hamilton Delivery Co',
			driverEmailDomain: 'hamilton-driver.test',
			managerEmailDomain: 'hamiltonmanager.test',
			warehouseOffset: 2,
			config: orgBBase
		}
	];
}

export function isDemoConfig(config: SeedConfig): config is DemoSeedConfig {
	return config.profile === 'demo';
}
