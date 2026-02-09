import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.DATABASE_URL);

const open = await sql`SELECT COUNT(*) as count FROM bid_windows WHERE status = 'open'`;
const resolved = await sql`SELECT COUNT(*) as count FROM bid_windows WHERE status = 'resolved'`;
const closed = await sql`SELECT COUNT(*) as count FROM bid_windows WHERE status = 'closed'`;
console.log('Open:', open[0].count, '| Resolved:', resolved[0].count, '| Closed:', closed[0].count);

const perDriver = await sql`
  SELECT u.email, COUNT(*) as pending_count
  FROM bids b JOIN "user" u ON b.user_id = u.id
  WHERE b.status = 'pending'
  GROUP BY u.email ORDER BY pending_count DESC
`;
console.log('\nPending bids per driver:');
perDriver.forEach(r => console.log(' ', r.email, '-', r.pending_count));

const dupes = await sql`
  SELECT b.user_id, a.date, COUNT(*) as bid_count
  FROM bids b JOIN assignments a ON b.assignment_id = a.id
  WHERE b.status = 'pending'
  GROUP BY b.user_id, a.date
  HAVING COUNT(*) > 1
`;
console.log('\nDrivers with >1 pending bid on same date:', dupes.length);
