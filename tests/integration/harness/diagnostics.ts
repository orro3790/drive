import fs from 'node:fs/promises';
import path from 'node:path';

import { pool } from './db';

type EvidenceRow = Record<string, unknown>;

export type EvidenceBundle = {
	scenarioId: string;
	label: string;
	createdAt: string;
	counts: Record<string, number>;
	samples: Record<string, EvidenceRow[]>;
};

const DEFAULT_TABLES = [
	'organizations',
	'organization_dispatch_settings',
	'user',
	'warehouses',
	'warehouse_managers',
	'routes',
	'assignments',
	'shifts',
	'bid_windows',
	'bids',
	'notifications'
] as const;

function safeFilename(value: string): string {
	return value.replaceAll(/[^a-zA-Z0-9_.-]/g, '_');
}

export async function captureEvidence(params: {
	scenarioId: string;
	label: string;
	tables?: readonly string[];
	sampleLimit?: number;
}): Promise<{ filePath: string; bundle: EvidenceBundle }> {
	const { scenarioId, label } = params;
	const tables = params.tables ?? DEFAULT_TABLES;
	const sampleLimit = params.sampleLimit ?? 25;

	const counts: Record<string, number> = {};
	const samples: Record<string, EvidenceRow[]> = {};

	for (const table of tables) {
		const countResult = await pool.query<{ count: string }>(
			`SELECT count(*)::text AS count FROM ${table === 'user' ? '"user"' : table};`
		);
		counts[table] = Number.parseInt(countResult.rows[0]?.count ?? '0', 10);

		const sampleResult = await pool.query<EvidenceRow>(
			`SELECT * FROM ${table === 'user' ? '"user"' : table} LIMIT ${sampleLimit};`
		);
		samples[table] = sampleResult.rows;
	}

	const bundle: EvidenceBundle = {
		scenarioId,
		label,
		createdAt: new Date().toISOString(),
		counts,
		samples
	};

	const dir = path.resolve(process.cwd(), 'tests', 'integration', '.evidence');
	await fs.mkdir(dir, { recursive: true });

	const fileName = `${safeFilename(scenarioId)}.${safeFilename(label)}.${Date.now()}.json`;
	const filePath = path.join(dir, fileName);
	await fs.writeFile(filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

	return { filePath, bundle };
}

export async function withScenarioEvidence<T>(params: {
	scenarioId: string;
	labelOnError?: string;
	run: () => Promise<T>;
}): Promise<T> {
	try {
		return await params.run();
	} catch (error) {
		await captureEvidence({
			scenarioId: params.scenarioId,
			label: params.labelOnError ?? 'error'
		});
		throw error;
	}
}
