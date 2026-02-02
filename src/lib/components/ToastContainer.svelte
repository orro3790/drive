<script lang="ts">
	import { toastStore, type Toast } from '$lib/stores/app-shell/toastStore.svelte';
	import Icon from '$lib/components/primitives/Icon.svelte';
	import IconButton from '$lib/components/primitives/IconButton.svelte';
	import CircleCheckFill from '$lib/components/icons/CircleCheckFill.svelte';
	import Exclamation from '$lib/components/icons/Exclamation.svelte';
	import AlertTriangleIcon from '$lib/components/icons/AlertTriangleIcon.svelte';
	import XIcon from '$lib/components/icons/XIcon.svelte';
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut, cubicIn } from 'svelte/easing';
	import * as m from '$lib/paraglide/messages.js';

	const { toasts, remove } = toastStore;

	function iconFor(kind: Toast['kind']) {
		switch (kind) {
			case 'success':
				return CircleCheckFill;
			case 'error':
				return AlertTriangleIcon;
			case 'warning':
			case 'info':
			default:
				return Exclamation;
		}
	}
</script>

<!-- ARIA live region for announcements -->
<div class="toast-host" aria-live="polite" aria-atomic="true">
	{#each toasts as toast (toast.id)}
		{@const IconComp = toast.icon ?? iconFor(toast.kind)}
		<div
			class="toast"
			data-kind={toast.kind}
			in:fade={{
				duration: 150,
				easing: cubicOut
			}}
			out:fade={{
				duration: 220,
				easing: cubicIn
			}}
			animate:flip={{
				duration: 180
			}}
		>
			<Icon class="left"><IconComp /></Icon>
			{#if toast.title}
				<div class="title" data-kind={toast.kind}>{toast.title}</div>
			{/if}
			<div class="close">
				<IconButton
					tooltip={m.toast_dismiss_tooltip()}
					disableTooltip={true}
					onclick={() => remove(toast.id)}
				>
					<Icon><XIcon /></Icon>
				</IconButton>
			</div>
			<div class="message">{toast.message}</div>
		</div>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		top: var(--spacing-3);
		right: var(--spacing-3);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-2);
		z-index: var(--z-toast);
		pointer-events: none; /* clicks only on children */
		align-items: flex-end; /* right-justify toasts */
	}

	@media (max-width: 640px) {
		.toast-host {
			top: auto;
			bottom: var(--spacing-3);
			right: 50%;
			transform: translateX(50%);
			align-items: center;
		}
	}

	.toast {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-auto-rows: auto;
		align-items: center;
		column-gap: var(--spacing-2);
		row-gap: var(--spacing-1);
		width: max-content;
		background: var(--surface-inset);
		color: var(--text-normal);
		border: 1px solid var(--border-primary);
		border-radius: var(--radius-lg);
		padding: var(--spacing-2) var(--spacing-3);
		box-shadow: var(--shadow-base);
		max-width: 380px;
		pointer-events: auto;
		user-select: none;
	}

	.toast[data-kind='error'] .title {
		color: var(--status-error);
	}
	.toast[data-kind='success'] .title {
		color: var(--status-success);
	}
	.toast[data-kind='warning'] .title {
		color: var(--status-warning);
	}
	.toast[data-kind='info'] .title {
		color: var(--status-info);
	}

	.title {
		grid-column: 2;
		grid-row: 1;
		align-self: center;
		display: flex;
		align-items: center;
		font-weight: var(--font-weight-medium);
		line-height: 1;
		font-size: var(--font-size-base);
	}

	.message {
		grid-column: 2;
		grid-row: 2;
		font-size: var(--font-size-base);
		color: var(--text-normal);
		/* Prevent layout break on long messages */
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 3; /* show up to 3 lines then truncate */
		-webkit-box-orient: vertical;
		line-clamp: 3;
		white-space: normal;
	}

	.close {
		grid-column: 3;
		grid-row: 1;
		align-self: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* slide-in keyframes removed; using Svelte transitions instead */
</style>
