<script lang="ts">
	const { size = 24, label } = $props<{
		size?: number;
		label?: string;
	}>();
</script>

<div class="spinner-container">
	<span
		class="loader"
		style={`font-size: ${size}px;`}
		role={label ? 'img' : undefined}
		aria-label={label}
		aria-hidden={label ? undefined : 'true'}
	>
		Loading
	</span>
</div>

<style>
	.spinner-container {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--interactive-accent);
	}

	/* Fixed-size rotating ring spinner (no scale/overflow) */
	.loader {
		display: inline-block;
		position: relative;
		width: 1em; /* controlled by inline font-size */
		height: 1em; /* controlled by inline font-size */
		border-radius: 50%;
		box-sizing: border-box;
		background: linear-gradient(
			0deg,
			rgba(var(--interactive-accent-rgb), 0.25) 33%,
			var(--interactive-accent) 100%
		);
		animation: rotation 1s linear infinite;
		will-change: transform;
		text-indent: -9999px; /* hide inner text for a11y without display: none */
		overflow: hidden;
	}

	.loader:after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: calc(100% - 4px); /* ring thickness = 2px */
		height: calc(100% - 4px);
		border-radius: 50%;
		box-sizing: border-box;
		background: var(--surface-primary);
	}

	@keyframes rotation {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}
</style>
