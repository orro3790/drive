/**
 * Matrix test: fire health crons and check which notifications were created.
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const CRON_SECRET = process.env.CRON_SECRET;
const BASE = 'http://localhost:5173';

async function callCron(path) {
	const res = await fetch(`${BASE}${path}`, {
		headers: { Authorization: `Bearer ${CRON_SECRET}` }
	});
	const text = await res.text();
	console.log(`${path} => ${res.status}: ${text.slice(0, 300)}`);
	return res.status;
}

(async () => {
	console.log('=== Running health crons ===\n');

	await callCron('/api/cron/daily-health');
	console.log();
	await callCron('/api/cron/weekly-health');

	console.log('\n=== Checking all health-related notification counts ===\n');
	const types = [
		'corrective_warning',
		'streak_advanced',
		'streak_reset',
		'bonus_eligible',
		'warning',
		// Also check manager types while we're at it
		'route_unfilled',
		'route_cancelled',
		// And the ones we triggered earlier
		'bid_open',
		'emergency_route_available',
		'confirmation_reminder',
		'shift_auto_dropped',
		'stale_shift_reminder',
		'shift_reminder',
		'bid_won',
		'bid_lost',
		'assignment_confirmed',
		'driver_no_show',
		'return_exception',
		'shift_cancelled',
		'manual'
	];

	for (const t of types) {
		const [r] = await sql`SELECT COUNT(*)::int as cnt FROM notifications WHERE type = ${t}`;
		const marker = r.cnt > 0 ? 'COVERED' : 'MISSING';
		console.log(`  [${marker}] ${t}: ${r.cnt} records`);
	}
})();
