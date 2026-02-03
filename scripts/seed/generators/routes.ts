/**
 * Routes Generator
 *
 * Creates routes with prefix codes linked to warehouses.
 */

import type { SeedConfig } from '../config';

// Route prefix by warehouse (2-letter code)
const WAREHOUSE_PREFIXES: Record<string, string> = {
	'Mississauga West': 'MW',
	'Scarborough East': 'SE',
	'Brampton North': 'BN',
	'Vaughan Central': 'VC',
	Markham: 'MK',
	Etobicoke: 'ET',
	'North York': 'NY',
	Ajax: 'AJ'
};

export interface GeneratedRoute {
	name: string;
	warehouseIndex: number; // Index into warehouses array for linking
}

export function generateRoutes(config: SeedConfig, warehouseNames: string[]): GeneratedRoute[] {
	const routes: GeneratedRoute[] = [];
	const routesPerWarehouse = Math.ceil(config.routes / config.warehouses);

	for (let whIdx = 0; whIdx < config.warehouses; whIdx++) {
		const warehouseName = warehouseNames[whIdx];
		const prefix = WAREHOUSE_PREFIXES[warehouseName] || 'RT';

		for (let routeNum = 1; routeNum <= routesPerWarehouse; routeNum++) {
			if (routes.length >= config.routes) break;

			const routeCode = String(routeNum).padStart(3, '0');
			routes.push({
				name: `${prefix}-${routeCode}`,
				warehouseIndex: whIdx
			});
		}
	}

	return routes;
}
