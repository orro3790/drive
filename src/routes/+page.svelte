<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// This page will redirect based on auth state via hooks.server.ts
	// If user reaches here, redirect to sign-in
	onMount(() => {
		goto('/sign-in');
	});
</script>

<div class="loading">
	<p>Redirecting...</p>
</div>

<style>
	.loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
	}
</style>
