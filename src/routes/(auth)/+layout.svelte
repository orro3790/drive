<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
	/>
</svelte:head>

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
		--ink: #18212a;
		--muted: #53616d;
		--accent: #d1762d;
		--accent-strong: #f2a35c;
		--surface: rgba(255, 255, 255, 0.9);
		--border: rgba(121, 136, 150, 0.28);
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 2.75rem 1.5rem;
		background:
			radial-gradient(90% 90% at 15% 10%, rgba(248, 207, 158, 0.55), transparent 55%),
			radial-gradient(90% 90% at 85% 0%, rgba(170, 210, 235, 0.55), transparent 60%),
			linear-gradient(135deg, #f7f3ed, #e8eef5);
		font-family: 'IBM Plex Sans', 'Helvetica Neue', sans-serif;
		color: var(--ink);
	}

	:global(.auth-panel) {
		width: min(480px, 100%);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 24px;
		padding: 2.5rem;
		box-shadow: 0 24px 60px rgba(17, 25, 36, 0.18);
		backdrop-filter: blur(10px);
	}

	:global(.auth-stack) {
		display: grid;
		gap: 1.6rem;
	}

	:global(.auth-header) {
		display: grid;
		gap: 0.5rem;
	}

	:global(.auth-eyebrow) {
		text-transform: uppercase;
		letter-spacing: 0.3em;
		font-size: 0.65rem;
		color: var(--muted);
		font-weight: 600;
	}

	:global(.auth-title) {
		font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
		font-size: clamp(1.75rem, 3vw, 2.35rem);
		margin: 0;
	}

	:global(.auth-subtitle) {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}

	:global(.auth-form) {
		display: grid;
		gap: 1.1rem;
	}

	:global(.auth-field) {
		display: grid;
		gap: 0.45rem;
	}

	:global(.auth-label) {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--muted);
	}

	:global(.auth-input) {
		border: 1px solid rgba(130, 145, 160, 0.35);
		background: rgba(248, 246, 243, 0.95);
		border-radius: 14px;
		padding: 0.75rem 0.9rem;
		font-size: 1rem;
		font-family: inherit;
		color: var(--ink);
		transition:
			border 0.2s ease,
			box-shadow 0.2s ease;
	}

	:global(.auth-input:focus) {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(209, 118, 45, 0.22);
	}

	:global(.auth-input::placeholder) {
		color: rgba(83, 97, 109, 0.65);
	}

	:global(.auth-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	:global(.auth-checkbox) {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted);
		font-size: 0.85rem;
	}

	:global(.auth-checkbox input) {
		accent-color: var(--accent);
	}

	:global(.btn.auth-button) {
		border: none;
		border-radius: 999px;
		padding: 0.85rem 1.2rem;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		background: linear-gradient(135deg, var(--accent), var(--accent-strong));
		color: #2c1d12;
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
		box-shadow: 0 12px 24px rgba(209, 118, 45, 0.25);
	}

	:global(.btn.auth-button:disabled) {
		cursor: not-allowed;
		opacity: 0.7;
		box-shadow: none;
	}

	:global(.btn.auth-button:not(:disabled):hover) {
		transform: translateY(-1px);
		box-shadow: 0 16px 28px rgba(209, 118, 45, 0.3);
	}

	:global(.auth-meta) {
		text-align: center;
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}

	:global(.auth-link) {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}

	:global(.auth-error) {
		padding: 0.8rem 0.95rem;
		border-radius: 14px;
		background: rgba(246, 214, 196, 0.7);
		border: 1px solid rgba(215, 131, 87, 0.4);
		color: #7a2b1c;
		font-size: 0.9rem;
	}

	:global(.auth-hint) {
		margin: 0;
		font-size: 0.8rem;
		color: var(--muted);
	}

	@media (max-width: 600px) {
		:global(.auth-panel) {
			padding: 2rem 1.6rem;
			border-radius: 20px;
		}

		:global(.auth-row) {
			flex-direction: column;
			align-items: flex-start;
		}

		:global(.auth-button) {
			width: 100%;
		}
	}
</style>
