require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

async function main() {
  // Assignments by status with dates for driver001
  const assignments = await sql`
    SELECT a.id, a.date, a.status, a.confirmed_at, r.name as route_name, a.user_id
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    WHERE a.user_id = 'driver_0001'
    ORDER BY a.date
  `;
  console.log('=== DRIVER 001 ASSIGNMENTS ===');
  assignments.forEach(a => console.log('  ' + a.date + ' | ' + a.status.padEnd(12) + ' | ' + a.route_name + ' | confirmed: ' + (a.confirmed_at ? 'yes' : 'no') + ' | id: ' + a.id));

  // Get today's assignments across all drivers
  console.log('\n=== TODAY (2026-02-08) ASSIGNMENTS ===');
  const today = await sql`
    SELECT a.id, a.status, a.user_id, r.name as route_name,
           s.arrived_at, s.started_at, s.completed_at, s.parcels_start
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    LEFT JOIN shifts s ON s.assignment_id = a.id
    WHERE a.date = '2026-02-08'
    ORDER BY a.user_id
  `;
  today.forEach(a => console.log('  ' + a.user_id + ' | ' + a.status.padEnd(12) + ' | ' + a.route_name + ' | arrived: ' + (a.arrived_at ? 'yes' : 'no') + ' | started: ' + (a.started_at ? 'yes' : 'no') + ' | completed: ' + (a.completed_at ? 'yes' : 'no') + ' | id: ' + a.id));

  // Get future unconfirmed assignments
  console.log('\n=== FUTURE UNCONFIRMED ASSIGNMENTS ===');
  const unconfirmed = await sql`
    SELECT a.id, a.date, a.status, a.user_id, r.name as route_name
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    WHERE a.date > '2026-02-08'
      AND a.status = 'scheduled'
      AND a.confirmed_at IS NULL
    ORDER BY a.date, a.user_id
    LIMIT 20
  `;
  unconfirmed.forEach(a => console.log('  ' + a.date + ' | ' + a.user_id + ' | ' + a.route_name + ' | id: ' + a.id));

  // Get active bid windows
  console.log('\n=== ACTIVE BID WINDOWS ===');
  const bids = await sql`
    SELECT bw.id, bw.mode, bw.closes_at, a.date as assignment_date, r.name as route_name, a.user_id
    FROM bid_windows bw
    JOIN assignments a ON a.id = bw.assignment_id
    JOIN routes r ON r.id = a.route_id
    WHERE bw.status = 'open'
    ORDER BY bw.closes_at
    LIMIT 10
  `;
  bids.forEach(b => console.log('  ' + b.assignment_date + ' | ' + b.mode + ' | ' + b.route_name + ' | closes: ' + b.closes_at + ' | id: ' + b.id));

  // Get assignments with active shifts (started but not completed)
  console.log('\n=== ACTIVE SHIFTS (started, not completed) ===');
  const active = await sql`
    SELECT a.id as assignment_id, a.date, a.user_id, r.name as route_name,
           s.id as shift_id, s.arrived_at, s.started_at, s.parcels_start
    FROM assignments a
    JOIN routes r ON r.id = a.route_id
    JOIN shifts s ON s.assignment_id = a.id
    WHERE s.started_at IS NOT NULL AND s.completed_at IS NULL
    ORDER BY a.date
  `;
  active.forEach(a => console.log('  ' + a.date + ' | ' + a.user_id + ' | ' + a.route_name + ' | parcelsStart: ' + a.parcels_start + ' | assignment: ' + a.assignment_id + ' | shift: ' + a.shift_id));

  // Summary by status
  console.log('\n=== ASSIGNMENT STATUS SUMMARY ===');
  const summary = await sql`
    SELECT status, count(*) as count FROM assignments GROUP BY status ORDER BY status
  `;
  summary.forEach(s => console.log('  ' + s.status + ': ' + s.count));
}

main().catch(console.error);
