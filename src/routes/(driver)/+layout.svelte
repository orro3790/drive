<!--
	Driver Layout

	Provides the layout wrapper for driver-only pages.
	Role guard is enforced in +layout.server.ts.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

{@render children()}
