<script lang="ts">
	import { pageHeaderStore } from '$lib/stores/app-shell/pageHeaderStore.svelte';
	import * as m from '$lib/paraglide/messages.js';

	$effect(() => {
		pageHeaderStore.setTitle(m.nav_settings());
		return () => pageHeaderStore.reset();
	});
</script>

<div class="page-content">
	<p>Settings - coming soon</p>
</div>

<style>
	.page-content {
		color: var(--text-muted);
	}
</style>
