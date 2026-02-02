<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-shell">
	<div class="auth-panel">
		{@render children()}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
	}

	:global(.auth-shell) {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: clamp(var(--spacing-3), 6vw, var(--spacing-7));
		background:
			radial-gradient(
				620px 280px at 50% -10%,
				rgba(var(--interactive-accent-rgb), 0.22),
				transparent 60%
			),
			radial-gradient(
				420px 260px at 12% 12%,
				color-mix(in srgb, var(--text-normal) 8%, transparent),
				transparent 65%
			),
			radial-gradient(
				420px 260px at 88% 14%,
				color-mix(in srgb, var(--text-normal) 6%, transparent),
				transparent 65%
			),
			var(--surface-secondary);
	}

	:global(.auth-panel) {
		width: min(420px, 100%);
	}

	:global(.auth-card) {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-4);
		padding: clamp(var(--spacing-3), 4vw, var(--spacing-5));
		border-radius: calc(var(--radius-lg) * 2);
		background: var(--surface-primary);
		border: var(--border-width-thin) solid var(--border-primary);
		box-shadow: var(--shadow-lg);
		color: var(--text-normal);
		--surface-base: var(--form-background);
	}

	:global(.auth-header) {
		text-align: center;
		display: grid;
		gap: var(--spacing-2);
	}

	:global(.auth-eyebrow) {
		text-transform: uppercase;
		letter-spacing: 0.3em;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
		font-weight: var(--font-weight-medium);
	}

	:global(.auth-title) {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.01em;
	}

	:global(.auth-subtitle) {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--font-size-sm);
	}

	:global(.auth-form) {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-3);
	}

	:global(.auth-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-2);
	}

	:global(.auth-footer) {
		text-align: center;
		font-size: var(--font-size-sm);
	}

	:global(.auth-footer span) {
		color: var(--text-muted);
	}

	:global(.auth-footer a) {
		margin-left: var(--spacing-1);
		color: var(--text-accent);
	}

	:global(.auth-hint) {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--text-muted);
	}

	:global(.auth-card :global(.btn.primary)) {
		--btn-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
	}

	:global(.auth-error :global(.notice-banner)) {
		border-radius: var(--radius-base);
	}

	:global(.auth-error :global(.notice-banner.warning)) {
		background: color-mix(in srgb, var(--status-error) 12%, transparent);
		color: var(--status-error);
	}

	:global(.auth-error :global(.notice-banner.warning) :global(.notice-icon)) {
		color: var(--status-error);
	}

	:global(.icon-toggle) {
		appearance: none;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted);
		border-radius: var(--radius-base);
	}

	:global(.icon-toggle:hover) {
		color: var(--text-normal);
	}

	:global(.icon-toggle:focus-visible) {
		box-shadow: 0 0 0 2px var(--interactive-accent);
	}

	@media (max-width: 600px) {
		:global(.auth-shell) {
			padding: var(--spacing-4) var(--spacing-3);
		}
	}
</style>
