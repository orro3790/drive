<script lang="ts" generics="ItemType">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import DetailPanel from '$lib/components/DetailPanel.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';

	type TableContext = {
		isWideMode: boolean;
		onWideModeChange: (value: boolean) => void;
		isMobile: boolean;
	};

	type Props<T> = {
		/** Selected item for the detail panel */
		item: T | null;
		/** Detail panel title */
		title: string;
		/** Whether the detail panel is open */
		open: boolean;
		/** Panel width (default: 520px) */
		width?: number;
		/** Whether in edit mode */
		isEditing?: boolean;
		/** Whether there are unsaved changes */
		hasChanges?: boolean;
		/** Close handler */
		onClose: () => void;
		/** Edit mode toggle handler */
		onEditToggle?: (editing: boolean) => void;
		/** Save handler */
		onSave?: () => void;
		/** Content snippet (view mode) */
		viewContent: Snippet<[T]>;
		/** Content snippet (edit mode) */
		editContent?: Snippet<[T]>;
		/** Custom actions in view mode */
		viewActions?: Snippet<[T]>;
		/** Table content snippet */
		tableContent: Snippet<[TableContext]>;
		/** localStorage key for wide mode preference */
		storageKey: string;
	};

	let {
		item,
		title,
		open,
		width = 520,
		isEditing = false,
		hasChanges = false,
		onClose,
		onEditToggle,
		onSave,
		viewContent,
		editContent,
		viewActions,
		tableContent,
		storageKey
	}: Props<ItemType> = $props();

	let containerWidth = $state(0);
	const MOBILE_BREAKPOINT = 600;
	const isMobile = $derived(containerWidth > 0 && containerWidth < MOBILE_BREAKPOINT);

	const storageId = $derived(`detail-panel-wide-mode:${storageKey}`);
	let isWideMode = $state(false);

	onMount(() => {
		if (typeof localStorage === 'undefined') return;
		const stored = localStorage.getItem(storageId);
		if (stored != null) {
			isWideMode = stored === 'true';
		}
	});

	const isOpen = $derived(!!item && open);
	const showPanel = $derived(isOpen && !isMobile && !isWideMode);
	const showModal = $derived(isOpen && !isMobile && isWideMode);

	function handleWideModeChange(next: boolean) {
		if (next === isWideMode) return;
		isWideMode = next;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(storageId, String(next));
		}
		if (next) {
			onClose();
			onEditToggle?.(false);
		}
	}
</script>

<div class="page-with-detail" bind:clientWidth={containerWidth}>
	<div
		class="detail-layout"
		class:has-panel={showPanel}
		style={`--detail-panel-width: ${width}px;`}
	>
		<div class="detail-main">
			{@render tableContent({ isWideMode, onWideModeChange: handleWideModeChange, isMobile })}
		</div>
		{#if showPanel}
			<aside class="detail-panel-slot">
				<DetailPanel
					{item}
					{title}
					open={isOpen}
					{width}
					{isEditing}
					{hasChanges}
					{onClose}
					{onEditToggle}
					{onSave}
					{viewContent}
					{editContent}
					{viewActions}
					variant="panel"
				/>
			</aside>
		{/if}
	</div>
</div>

{#if showModal}
	<Modal {title} {onClose} maxWidth="clamp(320px, 90vw, 720px)">
		<DetailPanel
			{item}
			{title}
			open={isOpen}
			{width}
			{isEditing}
			{hasChanges}
			{onClose}
			{onEditToggle}
			{onSave}
			{viewContent}
			{editContent}
			{viewActions}
			variant="modal"
		/>
	</Modal>
{/if}

<style>
	.page-with-detail {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
	}

	.detail-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--spacing-4);
		width: 100%;
		height: 100%;
		min-height: 0;
		align-items: stretch;
	}

	.detail-layout.has-panel {
		grid-template-columns: minmax(0, 1fr) var(--detail-panel-width);
	}

	.detail-main {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.detail-panel-slot {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	@media (max-width: 767px) {
		.detail-layout {
			gap: var(--spacing-3);
		}
	}
</style>
