<script lang="ts" generics="ItemType">
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import Button from '$lib/components/primitives/Button.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';

	type Props<T> = {
		/** Item to display */
		item: T | null;
		/** Panel title */
		title: string;
		/** Whether panel is open */
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
		/** Content snippet (edit mode) - inline editing fields */
		editContent?: Snippet<[T]>;
		/** Custom actions in view mode */
		viewActions?: Snippet<[T]>;
		/** Render style variant */
		variant?: 'panel' | 'modal';
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
		variant = 'panel'
	}: Props<ItemType> = $props();

	const canEdit = $derived(!!editContent && !!onEditToggle);
	const hasViewActions = $derived(!!viewActions);
	const footerButtonSize = 'small';
	const splitActions = $derived(!isEditing && canEdit && hasViewActions);
	const showFooter = $derived(!!item && (isEditing || canEdit || hasViewActions));
</script>

<div
	class="detail-panel {variant}"
	class:is-open={open}
	style:width={variant === 'panel' ? `${width}px` : undefined}
	aria-hidden={!open}
>
	<div class="detail-card">
		<header class="detail-header">
			<h2 id="detail-panel-title">{title}</h2>
			<IconButton onclick={onClose} tooltip={m.common_close()}>
				<Icon><XIcon /></Icon>
			</IconButton>
		</header>

		<div class="detail-body">
			{#if item}
				{#if isEditing && editContent}
					{@render editContent(item)}
				{:else}
					{@render viewContent(item)}
				{/if}
			{/if}
		</div>

		{#if showFooter}
			<footer class="detail-footer" class:is-editing={isEditing} class:split-actions={splitActions}>
				{#if isEditing}
					<Button
						variant="secondary"
						size={footerButtonSize}
						fill
						onclick={() => onEditToggle?.(false)}
					>
						{m.common_cancel()}
					</Button>
					<Button size={footerButtonSize} fill disabled={!hasChanges || !onSave} onclick={onSave}>
						{m.common_save()}
					</Button>
				{:else}
					{#if canEdit}
						<Button
							size={footerButtonSize}
							fill={!hasViewActions}
							onclick={() => onEditToggle?.(true)}
						>
							{m.common_edit()}
						</Button>
					{/if}
					{#if viewActions}
						{@render viewActions(item)}
					{/if}
				{/if}
			</footer>
		{/if}
	</div>
</div>

<style>
	.detail-panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
		padding: var(--spacing-4);
		padding-left: 0;
		overflow: hidden;
	}

	.detail-panel.modal {
		padding: 0;
	}

	.detail-card {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
		background: var(--surface-primary);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-base);
	}

	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-3);
		min-height: 52px;
		padding: 0 var(--spacing-4);
		background: var(--surface-secondary);
		flex-shrink: 0;
	}

	.detail-header h2 {
		margin: 0;
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.detail-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-4);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
	}

	.detail-footer {
		display: flex;
		align-items: center;
		gap: var(--spacing-2);
		padding: var(--spacing-3) var(--spacing-4);
		flex-shrink: 0;
	}

	.detail-panel.modal .detail-footer {
		padding: var(--spacing-3) var(--spacing-4) var(--spacing-4);
	}

	.detail-footer.is-editing {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	.detail-footer.split-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}

	.detail-footer.split-actions :global(.btn) {
		width: 100%;
	}

	@media (max-width: 767px) {
		.detail-panel {
			padding: 0;
		}
	}
</style>
