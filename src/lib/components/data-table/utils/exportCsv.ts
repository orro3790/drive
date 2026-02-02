import type { Table, RowData, Column } from '@tanstack/table-core';

export type ExportScope = 'filtered' | 'page' | 'selected' | 'all';

export interface ExportOptions {
	scope?: ExportScope;
	excludeColumns?: string[];
	filename?: string;
}

function getExportHeader<T extends RowData>(column: Column<T, unknown>): string {
	const def = column.columnDef;
	if (def.meta && typeof def.meta === 'object' && 'exportHeader' in def.meta) {
		const header = (def.meta as Record<string, unknown>).exportHeader;
		if (typeof header === 'string') return header;
	}
	if (typeof def.header === 'string') return def.header;
	return column.id;
}

function formatValue(value: unknown): string {
	if (value == null) return '';
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	const str = String(value);
	// Escape quotes and wrap if comma, quote, or newline present
	if (/[",\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function getRowsForScope<T extends RowData>(table: Table<T>, scope: ExportScope) {
	switch (scope) {
		case 'all':
			return table.getCoreRowModel().rows;
		case 'filtered':
			return table.getFilteredRowModel().rows;
		case 'page':
			return table.getRowModel().rows;
		case 'selected':
			return table.getSelectedRowModel().rows;
		default:
			return table.getFilteredRowModel().rows;
	}
}

export function exportTableToCsv<T extends RowData>(
	table: Table<T>,
	options: ExportOptions = {}
): void {
	if (typeof window === 'undefined') {
		return;
	}

	const {
		scope = 'filtered',
		excludeColumns = ['select', 'actions'],
		filename = 'export.csv'
	} = options;

	const rows = getRowsForScope(table, scope);
	const columns = table.getVisibleLeafColumns().filter((col) => !excludeColumns.includes(col.id));

	const headers = columns.map((col) => formatValue(getExportHeader(col)));

	const body = rows.map((row) =>
		columns.map((col) => {
			// Prefer cell value if rendered; fallback to row value
			const cell = row.getAllCells().find((c) => c.column.id === col.id);
			const value = cell ? cell.getValue() : row.getValue(col.id);
			return formatValue(value);
		})
	);

	const csv = [headers.join(','), ...body.map((r) => r.join(','))].join('\n');
	const blob = new Blob([csv], {
		type: 'text/csv;charset=utf-8;'
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
