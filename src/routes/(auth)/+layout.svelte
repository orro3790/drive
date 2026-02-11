<script lang="ts">
	let { children } = $props();
</script>

<div class="auth-shell">
	<div class="auth-content">
		<a href="/" aria-label="Go to homepage" class="logo-link">
			<img src="/images/logo-3D.png" alt="Drive" class="auth-logo" />
		</a>

		<div class="auth-panel">
			{@render children()}
		</div>

		<div class="logo-balance-spacer" aria-hidden="true"></div>
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

	.auth-content {
		--auth-logo-size: 120px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--spacing-5);
		width: min(420px, 100%);
		z-index: 1;
	}

	.logo-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: var(--auth-logo-size);
	}

	.auth-logo {
		width: var(--auth-logo-size);
		height: var(--auth-logo-size);
		object-fit: contain;
		filter: drop-shadow(0 8px 24px rgba(255, 255, 255, 0.12));
		opacity: 0.95;
	}

	.logo-balance-spacer {
		height: var(--auth-logo-size);
		width: 1px;
		pointer-events: none;
		visibility: hidden;
	}

	.auth-panel {
		width: 100%;
	}

	@media (max-width: 600px) {
		.auth-shell {
			padding: var(--spacing-4) var(--spacing-3);
		}

		.auth-content {
			--auth-logo-size: 96px;
			gap: var(--spacing-4);
		}
	}
</style>
