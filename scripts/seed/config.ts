/**
 * Seed Configuration
 *
 * Scale settings for dev and staging environments.
 * Supports multi-org seeding with per-org config overrides.
 */

export interface SeedConfig {
	drivers: number;
	managers: number;
	warehouses: number;
	routes: number;
	pastWeeks: number;
	futureWeeks: number;
	deterministic: boolean;
	seed: number | null;
	anchorDate: string | null;
}

export interface OrgSeedConfig {
	slug: string;
	name: string;
	driverEmailDomain: string;
	managerEmailDomain: string;
	warehouseOffset: number;
	config: SeedConfig;
}

export const DEV_CONFIG: SeedConfig = {
	drivers: 10,
	managers: 2,
	warehouses: 2,
	routes: 10,
	pastWeeks: 4,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null
};

export const STAGING_CONFIG: SeedConfig = {
	drivers: 100,
	managers: 5,
	warehouses: 4,
	routes: 40,
	pastWeeks: 3,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null
};

/**
 * Org-B config: smaller secondary organization.
 */
export const ORG_B_CONFIG: SeedConfig = {
	drivers: 3,
	managers: 1,
	warehouses: 1,
	routes: 3,
	pastWeeks: 4,
	futureWeeks: 2,
	deterministic: false,
	seed: null,
	anchorDate: null
};

export function getConfig(
	isStaging: boolean,
	runtimeOptions?: {
		deterministic?: boolean;
		seed?: number | null;
		anchorDate?: string | null;
	}
): SeedConfig {
	const base = isStaging ? STAGING_CONFIG : DEV_CONFIG;

	return {
		...base,
		deterministic: runtimeOptions?.deterministic ?? false,
		seed: runtimeOptions?.seed ?? null,
		anchorDate: runtimeOptions?.anchorDate ?? null
	};
}

/**
 * Get multi-org configs for seeding.
 */
export function getOrgConfigs(
	isStaging: boolean,
	runtimeOptions?: {
		deterministic?: boolean;
		seed?: number | null;
		anchorDate?: string | null;
	}
): OrgSeedConfig[] {
	const baseConfig = getConfig(isStaging, runtimeOptions);
	const orgBBase = {
		...ORG_B_CONFIG,
		deterministic: runtimeOptions?.deterministic ?? false,
		seed: runtimeOptions?.seed ?? null,
		anchorDate: runtimeOptions?.anchorDate ?? null
	};

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
