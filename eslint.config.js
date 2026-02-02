export default [
	{
		ignores: [
			'.vercel/**',
			'.agent-browser/**',
			'.beads/**',
			'.bv/**',
			'.claude/**',
			'.svelte-kit/**',
			'build/**',
			'drizzle/**',
			'node_modules/**',
			'project.inlang/**',
			'ralph/**',
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
