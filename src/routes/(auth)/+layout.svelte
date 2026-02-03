<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-shell">
	<div class="auth-panel">
		{@render children()}
	</div>
</div>

<style>
	/* Auth shell layout */
	.auth-shell {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: clamp(24px, 6vw, 56px);
		background:
			radial-gradient(620px 280px at 50% -10%, rgba(255, 255, 255, 0.08), transparent 60%),
			radial-gradient(420px 260px at 12% 12%, rgba(255, 255, 255, 0.05), transparent 65%),
			radial-gradient(420px 260px at 88% 14%, rgba(255, 255, 255, 0.04), transparent 65%),
			var(--surface-inset);
		overflow: hidden;
	}

	.auth-panel {
		width: min(420px, 100%);
		z-index: 1;
	}

	@media (max-width: 600px) {
		.auth-shell {
			padding: var(--spacing-4) var(--spacing-3);
		}
	}
</style>
