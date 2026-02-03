<!--
@component
SettingsGroupTitle - Section title for settings cards.
Centralized tokens to prevent drift across sections.
-->
<script lang="ts">
	let {
		title,
		desc,
		id,
		variant = 'default'
	} = $props<{ title: string; desc?: string; id?: string; variant?: 'default' | 'danger' }>();
</script>

<div class="settings-group-title">
	<h3 class="group-title" class:danger={variant === 'danger'} {id}>{title}</h3>
	{#if desc}
		<p class="section-desc">{desc}</p>
	{/if}
</div>

<style>
	.settings-group-title {
		padding: 0 0 var(--spacing-2) 0;
		font-size: var(--font-size-base);
	}

	.group-title {
		font-size: var(--font-size-base);
		font-weight: var(--font-weight-medium);
	}

	.group-title.danger {
		color: var(--status-error);
	}

	.section-desc {
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}
</style>
