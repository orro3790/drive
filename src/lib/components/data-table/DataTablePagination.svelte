<!--
@component DataTablePagination
Pagination controls for the DataTable.
-->
<script lang="ts">
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import ChevronFirst from '$lib/components/icons/ChevronFirst.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import ChevronRight from '$lib/components/icons/ChevronRight.svelte';
	import ChevronLast from '$lib/components/icons/ChevronLast.svelte';
	import * as m from '$lib/paraglide/messages';

	type Props = {
		currentPage: number;
		pageCount: number;
		canPreviousPage: boolean;
		canNextPage: boolean;
		onFirstPage: () => void;
		onPreviousPage: () => void;
		onNextPage: () => void;
		onLastPage: () => void;
	};

	let {
		currentPage,
		pageCount,
		canPreviousPage,
		canNextPage,
		onFirstPage,
		onPreviousPage,
		onNextPage,
		onLastPage
	}: Props = $props();

	const displayPage = $derived(currentPage + 1);
</script>

<div class="pagination">
	<div class="pagination-info">
		<span class="page-indicator">
			{m.table_footer_page_indicator({
				current: displayPage.toString(),
				total: pageCount.toLocaleString()
			})}
		</span>
	</div>

	<div class="pagination-controls">
		<IconButton
			tooltip={m.table_footer_first_page()}
			onclick={onFirstPage}
			disabled={!canPreviousPage}
			aria-label={m.table_footer_first_page()}
		>
			<Icon><ChevronFirst /></Icon>
		</IconButton>

		<IconButton
			tooltip={m.table_footer_previous_page()}
			onclick={onPreviousPage}
			disabled={!canPreviousPage}
			aria-label={m.table_footer_previous_page()}
		>
			<Icon><ChevronLeft /></Icon>
		</IconButton>

		<IconButton
			tooltip={m.table_footer_next_page()}
			onclick={onNextPage}
			disabled={!canNextPage}
			aria-label={m.table_footer_next_page()}
		>
			<Icon><ChevronRight /></Icon>
		</IconButton>

		<IconButton
			tooltip={m.table_footer_last_page()}
			onclick={onLastPage}
			disabled={!canNextPage}
			aria-label={m.table_footer_last_page()}
		>
			<Icon><ChevronLast /></Icon>
		</IconButton>
	</div>
</div>

<style>
	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-3);
		padding: var(--spacing-2) var(--spacing-3);
		background: var(--surface-inset);
		border: var(--border-width-thin) solid var(--border-primary);
		border-radius: var(--radius-base);
	}

	.pagination-info {
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: var(--spacing-1);
	}
</style>
