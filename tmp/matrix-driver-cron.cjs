/**
 * Matrix test: cron-triggered driver notifications
 * Tests: confirmation_reminder, shift_auto_dropped, stale_shift_reminder, shift_reminder
 *
 * Sets up test data, then calls each cron endpoint.
 */
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const DRIVER = 'driver_0003';
const MGR_ORG = '5fa0c41d-3d25-49e8-96bd-ef41c73776eb';
const CRON_SECRET = process.env.CRON_SECRET;
const BASE = 'http://localhost:5173';

async function callCron(path) {
	const res = await fetch(`${BASE}${path}`, {
		headers: { Authorization: `Bearer ${CRON_SECRET}` }
	});
	const text = await res.text();
	console.log(`  ${path} => ${res.status}: ${text.slice(0, 200)}`);
	return res.status;
}

(async () => {
	// Get a route + warehouse in the org
	const [route] = await sql`
    SELECT r.id, r.name, r.warehouse_id FROM routes r
    JOIN warehouses w ON w.id = r.warehouse_id
    WHERE w.organization_id = ${MGR_ORG}
    LIMIT 1
  `;
	console.log(`Route: ${route.name}\n`);

	// --- 1. confirmation_reminder ---
	// Needs a scheduled assignment ~72h from now (not yet confirmed)
	console.log('=== confirmation_reminder ===');
	const reminderDate = new Date();
	reminderDate.setDate(reminderDate.getDate() + 3); // 3 days out
	const reminderDateStr = reminderDate.toISOString().split('T')[0];

	// Check for conflicts
	const [conflict1] = await sql`
    SELECT id FROM assignments WHERE user_id = ${DRIVER} AND date = ${reminderDateStr} AND status != 'cancelled'
  `;
	if (conflict1) {
		console.log(`  Conflict on ${reminderDateStr}, skipping setup (using existing)`);
	} else {
		await sql`
      INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
      VALUES (${route.id}, ${route.warehouse_id}, ${reminderDateStr}, 'scheduled', ${DRIVER}, 'algorithm', NOW())
    `;
		console.log(`  Created scheduled assignment for ${reminderDateStr}`);
	}
	await callCron('/api/cron/send-confirmation-reminders');

	// --- 2. shift_auto_dropped ---
	// Needs a scheduled (unconfirmed) assignment <48h from now
	console.log('\n=== shift_auto_dropped ===');
	const dropDate = new Date();
	dropDate.setHours(dropDate.getHours() + 24); // 24h from now (within 48h window)
	const dropDateStr = dropDate.toISOString().split('T')[0];

	const [conflict2] = await sql`
    SELECT id FROM assignments WHERE user_id = ${DRIVER} AND date = ${dropDateStr} AND status != 'cancelled'
  `;
	if (conflict2) {
		console.log(`  Conflict on ${dropDateStr}, using existing assignment ${conflict2.id}`);
		// Make sure it's scheduled (not confirmed) so it gets dropped
		await sql`UPDATE assignments SET status = 'scheduled' WHERE id = ${conflict2.id} AND status = 'scheduled'`;
	} else {
		await sql`
      INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
      VALUES (${route.id}, ${route.warehouse_id}, ${dropDateStr}, 'scheduled', ${DRIVER}, 'algorithm', NOW())
    `;
		console.log(`  Created unconfirmed assignment for ${dropDateStr}`);
	}
	await callCron('/api/cron/auto-drop-unconfirmed');

	// --- 3. stale_shift_reminder ---
	// Needs a shift with arrivedAt but no completedAt from yesterday
	console.log('\n=== stale_shift_reminder ===');
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const yesterdayStr = yesterday.toISOString().split('T')[0];

	// Find or create an assignment for yesterday
	let staleAssignmentId;
	const [existingYesterday] = await sql`
    SELECT id FROM assignments WHERE user_id = ${DRIVER} AND date = ${yesterdayStr} AND status != 'cancelled'
  `;
	if (existingYesterday) {
		staleAssignmentId = existingYesterday.id;
		console.log(`  Using existing assignment ${staleAssignmentId}`);
	} else {
		const [newAssign] = await sql`
      INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
      VALUES (${route.id}, ${route.warehouse_id}, ${yesterdayStr}, 'active', ${DRIVER}, 'algorithm', NOW())
      RETURNING id
    `;
		staleAssignmentId = newAssign.id;
		console.log(`  Created yesterday assignment ${staleAssignmentId}`);
	}

	// Create a shift with arrivedAt but no completedAt
	const [existingShift] = await sql`
    SELECT id FROM shifts WHERE assignment_id = ${staleAssignmentId}
  `;
	if (existingShift) {
		// Make it stale: clear completedAt
		await sql`UPDATE shifts SET completed_at = NULL WHERE id = ${existingShift.id}`;
		console.log(`  Made existing shift stale (cleared completedAt)`);
	} else {
		await sql`
      INSERT INTO shifts (assignment_id, arrived_at)
      VALUES (${staleAssignmentId}, ${new Date(yesterday.getTime() + 9 * 3600000).toISOString()})
    `;
		console.log(`  Created stale shift (arrived, not completed)`);
	}
	await callCron('/api/cron/stale-shift-reminder');

	// --- 4. shift_reminder (today) ---
	console.log('\n=== shift_reminder ===');
	const today = new Date().toISOString().split('T')[0];
	const [todayAssign] = await sql`
    SELECT id FROM assignments WHERE user_id = ${DRIVER} AND date = ${today} AND status IN ('scheduled', 'confirmed')
  `;
	if (todayAssign) {
		console.log(`  Today assignment exists: ${todayAssign.id}`);
	} else {
		const [conflict3] = await sql`
      SELECT id FROM assignments WHERE user_id = ${DRIVER} AND date = ${today} AND status != 'cancelled'
    `;
		if (!conflict3) {
			await sql`
        INSERT INTO assignments (route_id, warehouse_id, date, status, user_id, assigned_by, assigned_at)
        VALUES (${route.id}, ${route.warehouse_id}, ${today}, 'confirmed', ${DRIVER}, 'algorithm', NOW())
      `;
			console.log(`  Created today confirmed assignment`);
		} else {
			console.log(`  Today assignment exists but status may not trigger reminder`);
		}
	}
	await callCron('/api/cron/shift-reminders');

	console.log('\n=== DONE ===');
	console.log(
		'Check phone for: confirmation_reminder, shift_auto_dropped, stale_shift_reminder, shift_reminder'
	);
})();
