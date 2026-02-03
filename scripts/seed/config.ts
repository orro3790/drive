/**
 * Seed Configuration
 *
 * Scale settings for dev and staging environments.
 */

export interface SeedConfig {
	drivers: number;
	managers: number;
	warehouses: number;
	routes: number;
	pastWeeks: number;
	futureWeeks: number;
}

export const DEV_CONFIG: SeedConfig = {
	drivers: 10,
	managers: 2,
	warehouses: 2,
	routes: 10,
	pastWeeks: 2,
	futureWeeks: 2
};

export const STAGING_CONFIG: SeedConfig = {
	drivers: 100,
	managers: 5,
	warehouses: 4,
	routes: 40,
	pastWeeks: 3,
	futureWeeks: 2
};

export function getConfig(isStaging: boolean): SeedConfig {
	return isStaging ? STAGING_CONFIG : DEV_CONFIG;
}
