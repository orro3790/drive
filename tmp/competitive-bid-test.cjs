/**
 * Competitive bid test: 3 drivers bid on the same window.
 * We predict the winner based on the scoring formula, then verify.
 *
 * Score = health*0.45 + familiarity*0.25 + seniority*0.15 + preference*0.15
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const DRIVERS = ['driver_0003', 'driver_0006', 'driver_0010'];
const MGR_ORG = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';

(async () => {
	// 1. Pick a route in Manager 001's org
	const [route] = await sql`
    SELECT r.id, r.name, r.warehouse_id FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE w.organization_id = ${MGR_ORG}
    LIMIT 1
  `;
	console.log(`Route: ${route.name} (${route.id})\n`);

	// 2. Find a date with no conflicts for any of the 3 drivers
	const conflicts = await sql`
    SELECT DISTINCT date::text FROM assignments
    WHERE user_id = ANY(${DRIVERS}) AND status != 'cancelled' AND date >= '2026-03-15'
  `;
	const busyDates = new Set(conflicts.map((r) => r.date));
	let testDate = null;
	for (let d = 15; d <= 31; d++) {
		const candidate = `2026-03-${String(d).padStart(2, '0')}`;
		if (!busyDates.has(candidate)) {
			testDate = candidate;
			break;
		}
	}
	if (!testDate) {
		console.log('No free date found!');
		process.exit(1);
	}
	console.log(`Test date: ${testDate} (no conflicts for any driver)\n`);

	// 3. Gather scoring inputs for each driver
	console.log('=== SCORING INPUTS ===');
	for (const driverId of DRIVERS) {
		// Health score
		const [health] = await sql`
      SELECT current_score FROM driver_health_state WHERE user_id = ${driverId}
    `;
		const healthScore = health ? Number(health.current_score) : 0;

		// Familiarity (completions on this route)
		const [fam] = await sql`
      SELECT completion_count FROM route_completions
      WHERE user_id = ${driverId} AND route_id = ${route.id}
    `;
		const completions = fam ? Number(fam.completion_count) : 0;

		// Seniority (months since hire)
		const [usr] = await sql`
      SELECT created_at FROM "user" WHERE id = ${driverId}
    `;
		const tenureMonths = usr
			? (Date.now() - new Date(usr.created_at).getTime()) / (30.44 * 24 * 60 * 60 * 1000)
			: 0;

		// Preference (is this route in their preferred_routes array?)
		const [prefs] = await sql`
      SELECT preferred_routes FROM driver_preferences
      WHERE user_id = ${driverId}
    `;
		const prefRoutes = prefs?.preferred_routes || [];
		const inTop3 = prefRoutes.includes(route.id);

		// Calculate score using the formula
		const healthNorm = Math.min(healthScore / 96, 1);
		const famNorm = Math.min(completions / 20, 1);
		const senNorm = Math.min(tenureMonths / 12, 1);
		const prefNorm = inTop3 ? 1 : 0;

		const finalScore = healthNorm * 0.45 + famNorm * 0.25 + senNorm * 0.15 + prefNorm * 0.15;

		console.log(`${driverId}:`);
		console.log(`  health=${healthScore} (norm=${healthNorm.toFixed(3)})`);
		console.log(`  familiarity=${completions} completions (norm=${famNorm.toFixed(3)})`);
		console.log(`  seniority=${tenureMonths.toFixed(1)} months (norm=${senNorm.toFixed(3)})`);
		console.log(`  preference=${inTop3 ? 'YES' : 'no'} (norm=${prefNorm})`);
		console.log(`  >>> PREDICTED SCORE: ${finalScore.toFixed(4)}`);
		console.log();
	}

	// 4. Create assignment + bid window
	const [assignment] = await sql`
    INSERT INTO assignments (route_id, warehouse_id, date, status)
    VALUES (${route.id}, ${route.warehouse_id}, ${testDate}, 'unfilled')
    RETURNING id
  `;

	const now = new Date();
	const closesAt = new Date(now.getTime() + 10 * 60 * 1000);
	const [window] = await sql`
    INSERT INTO bid_windows (assignment_id, mode, status, opens_at, closes_at)
    VALUES (${assignment.id}, 'competitive', 'open', ${now.toISOString()}, ${closesAt.toISOString()})
    RETURNING id
  `;

	// 5. Place bids for all 3 drivers (stagger bid times slightly)
	for (const driverId of DRIVERS) {
		await sql`
      INSERT INTO bids (assignment_id, user_id, status, bid_window_id, window_closes_at)
      VALUES (${assignment.id}, ${driverId}, 'pending', ${window.id}, ${closesAt.toISOString()})
    `;
	}

	console.log('=== TEST READY ===');
	console.log(`Window ID: ${window.id}`);
	console.log(`Assignment ID: ${assignment.id}`);
	console.log(`3 bids placed. Close this window to resolve.\n`);
})();
