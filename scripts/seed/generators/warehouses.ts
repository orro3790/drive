/**
 * Warehouse Generator
 *
 * Creates warehouses with Toronto-area names and addresses.
 */

import type { SeedConfig } from '../config';

// Toronto-area warehouse locations
const WAREHOUSE_DATA = [
	{ name: 'Mississauga West', address: '5500 Dixie Road, Mississauga, ON L4W 4N3' },
	{ name: 'Scarborough East', address: '1500 Birchmount Road, Scarborough, ON M1P 2G5' },
	{ name: 'Brampton North', address: '8400 Dixie Road, Brampton, ON L6T 5R1' },
	{ name: 'Vaughan Central', address: '101 Edgeley Boulevard, Vaughan, ON L4K 3Y5' },
	{ name: 'Markham', address: '7800 Woodbine Avenue, Markham, ON L3R 2N7' },
	{ name: 'Etobicoke', address: '30 Carrier Drive, Etobicoke, ON M9W 5T7' },
	{ name: 'North York', address: '4800 Dufferin Street, North York, ON M3H 5S9' },
	{ name: 'Ajax', address: '75 Monarch Avenue, Ajax, ON L1S 2G8' }
];

export interface GeneratedWarehouse {
	name: string;
	address: string;
}

export function generateWarehouses(config: SeedConfig): GeneratedWarehouse[] {
	const warehouses: GeneratedWarehouse[] = [];

	for (let i = 0; i < config.warehouses; i++) {
		const data = WAREHOUSE_DATA[i % WAREHOUSE_DATA.length];
		warehouses.push({
			name: data.name,
			address: data.address
		});
	}

	return warehouses;
}
