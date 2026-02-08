<!--
	Shared cancel-shift modal used by dashboard and schedule pages.

	Accepts a callback for the actual cancellation so each page
	can delegate to its own store.
-->
<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import Button from '$lib/components/primitives/Button.svelte';
	import Modal from '$lib/components/primitives/Modal.svelte';
	import Select from '$lib/components/Select.svelte';
	import { cancelReasonOptions } from '$lib/config/lifecycleLabels';
	import type { CancelReason } from '$lib/schemas/assignment';

	let {
		isLateCancel = false,
		isLoading = false,
		onCancel,
		onClose
	}: {
		isLateCancel?: boolean;
		isLoading?: boolean;
		onCancel: (reason: CancelReason) => void;
		onClose: () => void;
	} = $props();

	let cancelReason = $state<CancelReason | ''>('');
	let cancelError = $state<string | null>(null);

	function submit() {
		if (!cancelReason) {
			cancelError = m.schedule_cancel_reason_required();
			return;
		}
		onCancel(cancelReason);
	}
</script>

<Modal title={m.schedule_cancel_modal_title()} onClose={onClose}>
	<form
		class="modal-form"
		onsubmit={(event) => {
			event.preventDefault();
			submit();
		}}
	>
		<div class="form-field">
			<label for="cancel-reason">{m.schedule_cancel_reason_label()}</label>
			<Select
				id="cancel-reason"
				options={cancelReasonOptions}
				bind:value={cancelReason}
				placeholder={m.schedule_cancel_reason_placeholder()}
				errors={cancelError ? [cancelError] : []}
				onChange={() => (cancelError = null)}
			/>
		</div>

		{#if isLateCancel}
			<div class="late-warning">{m.schedule_cancel_warning_late()}</div>
		{/if}

		<div class="modal-actions">
			<Button variant="secondary" onclick={onClose} fill>
				{m.common_cancel()}
			</Button>
			<Button variant="danger" type="submit" fill {isLoading}>
				{m.schedule_cancel_confirm_button()}
			</Button>
		</div>
	</form>
</Modal>

<style>
	.modal-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-1);
	}

	.form-field label {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-normal);
	}

	.late-warning {
		padding: var(--spacing-2);
		border-radius: var(--radius-base);
		background: color-mix(in srgb, var(--status-warning) 15%, transparent);
		color: var(--status-warning);
		font-size: var(--font-size-sm);
	}

	.modal-actions {
		display: flex;
		gap: var(--spacing-2);
		margin-top: var(--spacing-2);
	}

	@media (max-width: 600px) {
		.modal-actions {
			flex-direction: column;
		}
	}
</style>
