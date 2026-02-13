import { pool } from './db';
import { ensureMigrated } from './migrate';

export default async function integrationGlobalSetup() {
	await ensureMigrated();

	return async () => {
		await pool.end();
	};
}
