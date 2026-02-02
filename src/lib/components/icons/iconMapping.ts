// Class icons - these replace the old placeholder icons
import Badge from '$lib/components/icons/Badge.svelte';
import BorderCorners from '$lib/components/icons/BorderCorners.svelte';
import Crown from '$lib/components/icons/Crown.svelte';
import Diamond from '$lib/components/icons/Diamond.svelte';
import Target from '$lib/components/icons/Target.svelte';
import Ghost from '$lib/components/icons/Ghost.svelte';
import Heart from '$lib/components/icons/Heart.svelte';
import Home from '$lib/components/icons/Home.svelte';
import LaurelWreath1 from '$lib/components/icons/LaurelWreath1.svelte';
import LaurelWreath2 from '$lib/components/icons/LaurelWreath2.svelte';
import LaurelWreath3 from '$lib/components/icons/LaurelWreath3.svelte';
import Bulb from '$lib/components/icons/Bulb.svelte';
import LowBattery from '$lib/components/icons/LowBattery.svelte';
import Sun from '$lib/components/icons/Sun.svelte';
import Moon from '$lib/components/icons/Moon.svelte';
import MoodAngry from '$lib/components/icons/MoodAngry.svelte';
import MoodSad from '$lib/components/icons/MoodSad.svelte';
import MoodMeh from '$lib/components/icons/MoodMeh.svelte';
import MoodHappy from '$lib/components/icons/MoodHappy.svelte';
import MoodPuzzled from '$lib/components/icons/MoodPuzzled.svelte';
import AlertTriangleIcon from '$lib/components/icons/AlertTriangleIcon.svelte';
import type { IconKey } from '$lib/schemas/icon';
import type { Component } from 'svelte';

export const iconMap: Record<IconKey, Component> = {
	default: BorderCorners,
	home: Home,
	heart: Heart,
	badge: Badge,
	crown: Crown,
	diamond: Diamond,
	target: Target,
	ghost: Ghost,
	bulb: Bulb,
	caution: AlertTriangleIcon,
	'low-battery': LowBattery,
	'laurel-wreath-1': LaurelWreath1,
	'laurel-wreath-2': LaurelWreath2,
	'laurel-wreath-3': LaurelWreath3,
	sun: Sun,
	moon: Moon,
	'mood-happy': MoodHappy,
	'mood-sad': MoodSad,
	'mood-angry': MoodAngry,
	'mood-meh': MoodMeh,
	'mood-puzzled': MoodPuzzled
};

export type { IconKey };

export function getIcon(key: IconKey | undefined | null) {
	return key && key in iconMap ? iconMap[key] : iconMap['default'];
}
