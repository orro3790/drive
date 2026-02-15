import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { user } from '../src/lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('DATABASE_URL not set');
		process.exit(1);
	}

	const sql = neon(databaseUrl);
	const db = drizzle(sql);

	const result = await db
		.select({ id: user.id, name: user.name, email: user.email, fcmToken: user.fcmToken })
		.from(user)
		.where(eq(user.email, 'driver009@driver.test'));

	const u = result[0];
	if (!u) {
		console.log('User not found');
		process.exit(1);
	}

	console.log('User:', u.name);
	console.log('Email:', u.email);
	console.log('FCM Token:', u.fcmToken ? u.fcmToken.substring(0, 40) + '...' : 'NULL (not registered)');
	process.exit(0);
}

main();
