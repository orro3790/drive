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
	deterministic: boolean;
	seed: number | null;
	anchorDate: string | null;
}

export const DEV_CONFIG: SeedConfig = {
	drivers: 10,
	managers: 2,
	warehouses: 2,
	routes: 10,
	pastWeeks: 2,
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
