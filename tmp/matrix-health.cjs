/**
 * Matrix test: health-system and flagging notifications.
 * Tests: warning, streak_advanced, streak_reset, bonus_eligible, corrective_warning
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const DRIVER = 'driver_0003';
const CRON_SECRET = process.env.CRON_SECRET;
const BASE = 'http://localhost:5173';

async function callCron(path) {
	const res = await fetch(`${BASE}${path}`, {
		headers: { Authorization: `Bearer ${CRON_SECRET}` }
	});
	const text = await res.text();
	console.log(`  ${path} => ${res.status}: ${text.slice(0, 300)}`);
	return { status: res.status, body: text };
}

(async () => {
	// --- corrective_warning: daily health eval detects low completion ---
	console.log('=== corrective_warning ===');
	// Save current health state so we can restore it
	const [origHealth] = await sql`
    SELECT current_score, current_stars, streak_weeks, hard_stop_active
    FROM driver_health_state WHERE user_id = ${DRIVER}
  `;
	console.log('  Original health:', origHealth);

	// We need the daily health cron to fire a corrective_warning.
	// This happens when completion rate drops below threshold.
	// Let's just run the daily health eval and see what happens.
	await callCron('/api/cron/daily-health');

	// Check for corrective_warning
	const [corrNotif] = await sql`
    SELECT type, body, created_at FROM notifications
    WHERE user_id = ${DRIVER} AND type = 'corrective_warning'
    ORDER BY created_at DESC LIMIT 1
  `;
	console.log(
		`  corrective_warning: ${corrNotif ? corrNotif.body : 'NOT TRIGGERED (expected if completion is fine)'}`
	);

	// --- streak_advanced / streak_reset / bonus_eligible: weekly health eval ---
	console.log('\n=== Weekly health (streak_advanced / streak_reset / bonus_eligible) ===');
	await callCron('/api/cron/weekly-health');

	const weeklyNotifs = await sql`
    SELECT type, body, created_at FROM notifications
    WHERE user_id = ${DRIVER} AND type IN ('streak_advanced', 'streak_reset', 'bonus_eligible')
    ORDER BY created_at DESC LIMIT 5
  `;
	console.log(`  Weekly health notifs: ${weeklyNotifs.length}`);
	for (const n of weeklyNotifs) console.log(`    ${n.type}: ${n.body}`);

	// --- warning: flagging check ---
	console.log('\n=== warning (flagging) ===');
	// The flagging check runs during shift completion. Let's check if there's already a warning.
	const [warnNotif] = await sql`
    SELECT type, body, created_at FROM notifications
    WHERE user_id = ${DRIVER} AND type = 'warning'
    ORDER BY created_at DESC LIMIT 1
  `;
	console.log(`  warning: ${warnNotif ? warnNotif.body : 'NOT TRIGGERED'}`);

	// Check overall health system notification coverage
	console.log('\n=== Health notification coverage ===');
	const allHealthTypes = [
		'corrective_warning',
		'streak_advanced',
		'streak_reset',
		'bonus_eligible',
		'warning'
	];
	for (const t of allHealthTypes) {
		const [n] = await sql`
      SELECT COUNT(*)::int as cnt FROM notifications WHERE type = ${t}
    `;
		console.log(`  ${t}: ${n.cnt} total notifications in DB`);
	}

	console.log('\n=== DONE ===');
})();
