import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config();

const url = process.env.DATABASE_URL;

if (!url) {
	throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url }
});
