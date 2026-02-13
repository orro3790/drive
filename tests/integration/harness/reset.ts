import { pool } from './db';

const EXCLUDED_TABLE_PREFIXES = ['__drizzle', 'drizzle'];

function shouldExcludeTable(tableName: string): boolean {
	return EXCLUDED_TABLE_PREFIXES.some((prefix) => tableName.startsWith(prefix));
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

export async function resetDatabase(): Promise<void> {
	const result = await pool.query<{ tablename: string }>(
		"SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
	);

	const tables = result.rows
		.map((row) => row.tablename)
		.filter((name) => name && !shouldExcludeTable(name))
		.sort();

	if (tables.length === 0) {
		return;
	}

	const tableList = tables
		.map((name) => `${quoteIdentifier('public')}.${quoteIdentifier(name)}`)
		.join(', ');
	await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}
