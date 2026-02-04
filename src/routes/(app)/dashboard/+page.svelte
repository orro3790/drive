<script lang="ts">
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import * as m from '$lib/paraglide/messages.js';

	$effect(() => {
		pageHeaderStore.setTitle(m.nav_dashboard());
		return () => pageHeaderStore.reset();
	});
</script>

<div class="page-content">
	<p>Driver dashboard - coming soon</p>
</div>

<style>
	.page-content {
		color: var(--text-muted);
	}
</style>
