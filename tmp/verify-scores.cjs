require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);

const WINDOW_ID = '08f3c3fc-d96b-41a3-b690-13afcd421968';

(async () => {
	const bids = await sql`
    SELECT user_id, score, status, resolved_at
    FROM bids
    WHERE bid_window_id = ${WINDOW_ID}
    ORDER BY score DESC NULLS LAST
  `;

	console.log('=== ACTUAL RESULTS (from server) ===');
	for (const b of bids) {
		const marker = b.status === 'won' ? '>>> WINNER' : '    loser';
		console.log(`${marker}  ${b.user_id}  score=${b.score}  status=${b.status}`);
	}

	console.log('\n=== PREDICTIONS vs ACTUAL ===');
	const predictions = {
		driver_0003: 0.4656,
		driver_0006: 0.0215,
		driver_0010: 0.1684
	};
	for (const b of bids) {
		const predicted = predictions[b.user_id];
		const actual = Number(b.score);
		const diff = Math.abs(predicted - actual);
		const match = diff < 0.01 ? 'MATCH' : `DIFF=${diff.toFixed(4)}`;
		console.log(
			`${b.user_id}: predicted=${predicted.toFixed(4)} actual=${actual.toFixed(4)} ${match}`
		);
	}
})();
