export default [
	{
		ignores: [
			'.vercel/**',
			'.agent-browser/**',
			'.beads/**',
			'.bv/**',
			'.claude/**',
			'.gradle-home/**',
			'.svelte-kit/**',
			'android/.gradle/**',
			'android/.gradle-local/**',
			'android/**/build/**',
			'build/**',
			'drizzle/**',
			'node_modules/**',
			'project.inlang/**',
			'ralph/**',
			'src/paraglide/**',
			'src/lib/paraglide/**'
		]
	},
	{
		files: ['**/*.{js,cjs,mjs}'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module'
		},
		linterOptions: {
			reportUnusedDisableDirectives: true
		},
		rules: {}
	}
];
