/**
 * Extended types for the DataTable component
 *
 * These types extend TanStack Table's base types with additional
 * metadata specific to our design system and UI requirements.
 */
import type { RowData, ColumnDef } from '@tanstack/table-core';
import type { Component, Snippet } from 'svelte';

/**
 * Column sizing mode options
 * - 'hug': Column width shrinks to fit content (width: max-content)
 * - 'fill': Column expands to fill remaining space (flex: 1)
 * - 'fixed': Column has explicit pixel width
 */
export type ColumnSizing = 'hug' | 'fill' | 'fixed';

/**
 * Column alignment options
 * - 'left': Left-align content (default for text)
 * - 'center': Center content (for buttons, actions)
 * - 'right': Right-align content (for numbers)
 * - 'separator': Center on separator character (for ratios like "1 : 3")
 */
export type ColumnAlignment = 'left' | 'center' | 'right' | 'separator';

/**
 * Filter type options for column filtering
 * - 'select': Dropdown with unique values (categorical data)
 * - 'range': Min/max inputs (numeric data)
 * - 'text': Free-text search
 * - 'boolean': Checkbox toggle
 */
export type FilterType = 'select' | 'range' | 'text' | 'boolean';

/**
 * Extended column metadata for our DataTable component.
 * This is added to TanStack Table's column definitions via the `meta` property.
 */
export interface DataTableColumnMeta {
	/** How the column should be sized */
	sizing?: ColumnSizing;

	/** Fixed width in pixels (only used when sizing is 'fixed') */
	width?: number;

	/** Minimum width in pixels */
	minWidth?: number;

	/** Maximum width in pixels */
	maxWidth?: number;

	/** How content should be aligned within the cell */
	align?: ColumnAlignment;

	/** For separator alignment, the character to center on */
	separator?: string;

	/** Whether the column header should be sticky */
	stickyHeader?: boolean;

	/** Whether the column should be sticky to the left */
	stickyLeft?: boolean;

	/** Whether this column can be hidden by the user */
	hideable?: boolean;

	/** CSS class to apply to cells in this column */
	cellClass?: string;

	/** CSS class to apply to the header of this column */
	headerClass?: string;

	/** Type of filter UI to render for this column */
	filterType?: FilterType;

	/** Display label for filter UI (defaults to column header) */
	filterLabel?: string;

	/** Placeholder text for text filter inputs */
	filterPlaceholder?: string;

	/** Whether to show this column on mobile (<600px). Defaults to false. */
	mobileVisible?: boolean;

	/** Priority order on mobile (lower = show first). Defaults to column order. */
	mobilePriority?: number;
}

/**
 * Extended ColumnDef with our custom meta type.
 * Use this instead of the base ColumnDef for full type safety.
 */
export type DataTableColumnDef<TData extends RowData, TValue = unknown> = ColumnDef<
	TData,
	TValue
> & {
	meta?: DataTableColumnMeta;
};

/**
 * Props for custom cell renderers.
 * Passed to cell components to give them context about the cell.
 */
export interface CellRendererProps<TData extends RowData, TValue = unknown> {
	/** The cell value */
	value: TValue;

	/** The full row data */
	row: TData;

	/** The row index (0-based) */
	rowIndex: number;

	/** The column ID */
	columnId: string;
}

/**
 * Function type for custom cell renderers.
 * Returns a Svelte component or snippet to render the cell.
 */
export type CellRenderer<TData extends RowData, TValue = unknown> = (
	props: CellRendererProps<TData, TValue>
) => Component | Snippet | string | number | null;

/**
 * Row click handler type
 */
export type RowClickHandler<TData extends RowData> = (row: TData, event: MouseEvent) => void;

/**
 * Row class function type - returns CSS classes for a row
 */
export type RowClassFn<TData extends RowData> = (row: TData, index: number) => string;

/**
 * Row selectability function type - determines if a row can be selected
 */
export type RowSelectableFn<TData extends RowData> = (row: TData) => boolean;

/**
 * Function to get the reason why a row cannot be selected (for tooltip).
 * Returns a string message if disabled, or undefined if selectable.
 */
export type DisabledSelectionReasonFn<TData extends RowData> = (row: TData) => string | undefined;

/**
 * Sorting direction
 */
export type SortDirection = 'asc' | 'desc' | false;

/**
 * Custom cell snippets map - maps column IDs to Svelte snippets.
 * Each snippet receives the row data as its parameter.
 */
export type CellSnippets<TData extends RowData> = Record<string, Snippet<[TData]>>;

/**
 * Context provided to header component renderers.
 * Allows headers to display tooltips, icons, or other rich content.
 */
export interface HeaderRendererContext {
	/** The column ID */
	columnId: string;
	/** The header text (from column definition) */
	headerText: string;
	/** Whether the column is sortable */
	canSort: boolean;
	/** Current sort direction if sorted */
	sortDirection: 'asc' | 'desc' | false;
}

/**
 * Header snippets map - maps column IDs to Svelte snippets for custom header rendering.
 * Each snippet receives header context as its parameter.
 */
export type HeaderSnippets = Record<string, Snippet<[HeaderRendererContext]>>;

/**
 * Context provided to cell component renderers.
 * Provides full context for interactive cells (editing, tooltips, etc.).
 */
export interface CellRendererContext<TData extends RowData, TValue = unknown> {
	/** The cell value */
	value: TValue;
	/** The full row data */
	row: TData;
	/** The row ID (from TanStack) */
	rowId: string;
	/** The row index in the current page (0-based) */
	rowIndex: number;
	/** The column ID */
	columnId: string;
	/** The column metadata */
	meta: DataTableColumnMeta;
	/** Whether the row is currently selected */
	isSelected: boolean;
	/** Whether the row is currently expanded */
	isExpanded: boolean;
}

/**
 * Cell component snippets map - maps column IDs to Svelte snippets with full cell context.
 * Use this instead of CellSnippets when you need access to cell value, selection state, etc.
 */
export type CellComponentSnippets<TData extends RowData> = Record<
	string,
	Snippet<[CellRendererContext<TData>]>
>;

/**
 * Module augmentation to extend TanStack Table's ColumnMeta type.
 * This allows our custom meta properties to be recognized by TypeScript.
 */
declare module '@tanstack/table-core' {
	// Module augmentation: extends ColumnMeta with our custom properties
	// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type
	interface ColumnMeta<TData extends RowData, TValue = unknown> extends DataTableColumnMeta {}
}
