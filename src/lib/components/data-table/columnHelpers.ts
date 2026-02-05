/**
 * Column Helper Utilities for DataTable
 *
 * Factory functions for creating strongly-typed column definitions
 * with sensible defaults for common data types.
 *
 * @example
 * ```typescript
 * import { createColumnHelper } from '$lib/components/data-table';
 *
 * interface Material {
 *   name: string;
 *   inventoryCount: number;
 *   updatedAt: Date;
 * }
 *
 * const helper = createColumnHelper<Material>();
 *
 * const columns = [
 *   helper.text('name', { header: 'Name', sortable: true }),
 *   helper.number('inventoryCount', { header: 'Inventory' }),
 *   helper.date('updatedAt', { header: 'Updated' }),
 * ];
 * ```
 */

import type { ColumnDef, RowData, AccessorFn, FilterFnOption } from '@tanstack/table-core';
import type { DataTableColumnMeta, ColumnSizing, ColumnAlignment, FilterType } from './types';

/**
 * Common options for all column types
 */
interface BaseColumnOptions<TData extends RowData> {
	/** Column header text */
	header: string;
	/** Whether this column can be sorted */
	sortable?: boolean;
	/** Whether this column can be hidden */
	hideable?: boolean;
	/** Column sizing mode */
	sizing?: ColumnSizing;
	/** Fixed width in pixels (only when sizing is 'fixed') */
	width?: number;
	/** Minimum width in pixels */
	minWidth?: number;
	/** Maximum width in pixels */
	maxWidth?: number;
	/** Whether column should be sticky to the left */
	stickyLeft?: boolean;
	/** Custom CSS class for cells */
	cellClass?: string;
	/** Custom CSS class for header */
	headerClass?: string;
	/** Whether this column can be filtered */
	filterable?: boolean;
	/** Type of filter UI to render ('select' | 'range' | 'text' | 'boolean') */
	filterType?: FilterType;
	/** TanStack filter function name or custom function */
	filterFn?: FilterFnOption<TData>;
	/** Label for filter UI (defaults to header) */
	filterLabel?: string;
	/** Placeholder text for text filter inputs */
	filterPlaceholder?: string;
	/** Whether to show this column on mobile (<600px) */
	mobileVisible?: boolean;
	/** Priority order on mobile (lower = show first) */
	mobilePriority?: number;
}

/**
 * Options specific to text columns
 */
interface TextColumnOptions<TData extends RowData> extends BaseColumnOptions<TData> {
	/** Content alignment (default: 'left') */
	align?: 'left' | 'center' | 'right';
}

/**
 * Options specific to number columns
 */
interface NumberColumnOptions<TData extends RowData> extends BaseColumnOptions<TData> {
	/** Content alignment (default: 'right') */
	align?: 'left' | 'center' | 'right';
}

/**
 * Options specific to date columns
 */
interface DateColumnOptions<TData extends RowData> extends BaseColumnOptions<TData> {
	/** Whether to include time in display */
	includeTime?: boolean;
}

/**
 * Badge variant type that supports both semantic and legacy variants
 */
type BadgeVariant =
	| 'default'
	| 'secondary'
	| 'destructive'
	| 'outline'
	| 'success'
	| 'warning'
	| 'error'
	| 'info';

/**
 * Options specific to badge columns
 */
interface BadgeColumnOptions<TData extends RowData> extends BaseColumnOptions<TData> {
	/** Map values to badge variants */
	variantMap?: Record<string, BadgeVariant>;
}

/**
 * Options for display-only columns (no accessor)
 */
interface DisplayColumnOptions<TData extends RowData> extends Omit<
	BaseColumnOptions<TData>,
	'sortable'
> {
	/** Unique column ID */
	id: string;
	/** Content alignment */
	align?: ColumnAlignment;
}

/**
 * Type-safe path accessor for nested properties
 * Supports dot notation: 'metadata.updatedAt'
 */
type PathValue<T, P extends string> = P extends `${infer K}.${infer R}`
	? K extends keyof T
		? PathValue<T[K], R>
		: never
	: P extends keyof T
		? T[P]
		: never;

/**
 * Creates a column helper bound to a specific data type.
 * Provides factory methods for common column types with strong typing.
 */
export function createColumnHelper<TData extends RowData>() {
	/**
	 * Creates column metadata from options
	 */
	function createMeta(
		options: BaseColumnOptions<TData>,
		align: ColumnAlignment = 'left'
	): DataTableColumnMeta {
		if (!options) {
			throw new Error('columnHelpers: options are required for column definitions');
		}
		return {
			align,
			sizing: options.sizing,
			width: options.width,
			minWidth: options.minWidth,
			maxWidth: options.maxWidth,
			stickyLeft: options.stickyLeft,
			hideable: options.hideable,
			cellClass: options.cellClass,
			headerClass: options.headerClass,
			filterType: options.filterType,
			filterLabel: options.filterLabel,
			filterPlaceholder: options.filterPlaceholder,
			mobileVisible: options.mobileVisible,
			mobilePriority: options.mobilePriority
		};
	}

	/**
	 * Gets a nested value from an object using dot notation
	 */
	function getNestedValue(obj: TData, path: string): unknown {
		return path.split('.').reduce((acc: unknown, part) => {
			if (acc == null) return undefined;
			return (acc as Record<string, unknown>)[part];
		}, obj);
	}

	/**
	 * Build TanStack sizing props from options.
	 * Sets size/minSize/maxSize on ColumnDef so TanStack knows actual sizes
	 * and preserves them during column resizing.
	 *
	 * NOTE: When column resizing is enabled, use `sizing: 'fixed'` with explicit
	 * widths (or the header-width heuristic below). `sizing: 'fill'` is
	 * incompatible with TanStack's resize handler since CSS-driven widths don't
	 * match TanStack's internal state.
	 */
	function estimateHeaderWidth(options: BaseColumnOptions<TData>) {
		if (options.sizing !== 'fixed') return undefined;
		const headerText = options.header?.trim();
		if (!headerText) return undefined;
		const headerLength = Array.from(headerText).length;
		const headerCharWidth = 7.5;
		const headerBaseWidth = 40;
		const sortIconWidth = options.sortable ? 24 : 0;
		return Math.ceil(headerLength * headerCharWidth + headerBaseWidth + sortIconWidth);
	}

	function getSizingProps(options: BaseColumnOptions<TData>) {
		const props: { size?: number; minSize?: number; maxSize?: number } = {};
		const estimatedWidth = estimateHeaderWidth(options);
		let size = options.width;

		if (typeof estimatedWidth === 'number') {
			size = typeof size === 'number' ? Math.max(size, estimatedWidth) : estimatedWidth;
		}
		if (typeof options.minWidth === 'number') {
			props.minSize = options.minWidth;
			size = typeof size === 'number' ? Math.max(size, options.minWidth) : options.minWidth;
		}
		if (typeof options.maxWidth === 'number') {
			props.maxSize = options.maxWidth;
		}
		if (typeof size === 'number') {
			props.size = size;
		}
		return props;
	}

	return {
		/**
		 * Text column - for string data, left-aligned by default
		 */
		text<TKey extends string>(
			accessorKey: TKey,
			options: TextColumnOptions<TData>
		): ColumnDef<TData, PathValue<TData, TKey>> {
			const align = options.align ?? 'left';
			return {
				id: accessorKey,
				accessorFn: (row) => getNestedValue(row, accessorKey) as PathValue<TData, TKey>,
				header: options.header,
				enableSorting: options.sortable ?? false,
				enableHiding: options.hideable ?? true,
				enableColumnFilter: options.filterable ?? false,
				filterFn: options.filterFn ?? 'includesString',
				...getSizingProps(options),
				meta: createMeta(options, align)
			};
		},

		/**
		 * Number column - for numeric data, right-aligned with tabular-nums
		 */
		number<TKey extends string>(
			accessorKey: TKey,
			options: NumberColumnOptions<TData>
		): ColumnDef<TData, PathValue<TData, TKey>> {
			const align = options.align ?? 'right';
			return {
				id: accessorKey,
				accessorFn: (row) => getNestedValue(row, accessorKey) as PathValue<TData, TKey>,
				header: options.header,
				enableSorting: options.sortable ?? false,
				enableHiding: options.hideable ?? true,
				enableColumnFilter: options.filterable ?? false,
				filterFn: options.filterFn ?? 'inNumberRange',
				...getSizingProps(options),
				meta: createMeta(options, align)
			};
		},

		/**
		 * Date column - for Date objects, uses app's date formatting
		 */
		date<TKey extends string>(
			accessorKey: TKey,
			options: DateColumnOptions<TData>
		): ColumnDef<TData, PathValue<TData, TKey>> {
			return {
				id: accessorKey,
				accessorFn: (row) => getNestedValue(row, accessorKey) as PathValue<TData, TKey>,
				header: options.header,
				enableSorting: options.sortable ?? false,
				enableHiding: options.hideable ?? true,
				enableColumnFilter: options.filterable ?? false,
				filterFn: options.filterFn,
				...getSizingProps(options),
				meta: createMeta(options, 'left')
			};
		},

		/**
		 * Badge column - for status/category labels with visual variants
		 */
		badge<TKey extends string>(
			accessorKey: TKey,
			options: BadgeColumnOptions<TData>
		): ColumnDef<TData, PathValue<TData, TKey>> {
			return {
				id: accessorKey,
				accessorFn: (row) => getNestedValue(row, accessorKey) as PathValue<TData, TKey>,
				header: options.header,
				enableSorting: options.sortable ?? false,
				enableHiding: options.hideable ?? true,
				enableColumnFilter: options.filterable ?? false,
				filterFn: options.filterFn ?? 'equals',
				...getSizingProps(options),
				meta: {
					...createMeta(options, 'left'),
					// Store variant map in meta for cell renderer access
					...(options.variantMap && {
						variantMap: options.variantMap
					})
				} as DataTableColumnMeta
			};
		},

		/**
		 * Custom accessor column - for computed values
		 */
		accessor<TValue>(
			id: string,
			accessorFn: AccessorFn<TData, TValue>,
			options: BaseColumnOptions<TData> & { align?: ColumnAlignment }
		): ColumnDef<TData, TValue> {
			const align = options.align ?? 'left';
			return {
				id,
				accessorFn,
				header: options.header,
				enableSorting: options.sortable ?? false,
				enableHiding: options.hideable ?? true,
				enableColumnFilter: options.filterable ?? false,
				filterFn: options.filterFn,
				...getSizingProps(options),
				meta: createMeta(options, align)
			};
		},

		/**
		 * Display column - for actions or custom content (no data accessor)
		 */
		display(options: DisplayColumnOptions<TData>): ColumnDef<TData, unknown> {
			const align = options.align ?? 'left';
			return {
				id: options.id,
				header: options.header,
				enableSorting: false,
				enableHiding: options.hideable ?? false,
				...getSizingProps({ ...options, sortable: false }),
				meta: createMeta(
					{
						...options,
						sortable: false
					},
					align
				)
			};
		},

		/**
		 * Index column - shows row number
		 */
		index(header: string = '#'): ColumnDef<TData, number> {
			return {
				id: '__index',
				header,
				enableSorting: false,
				enableHiding: false,
				size: 48,
				meta: {
					align: 'center',
					sizing: 'fixed',
					width: 48
				}
			};
		}
	};
}

/**
 * Re-export for convenience
 */
export type { DataTableColumnMeta, ColumnSizing, ColumnAlignment };
