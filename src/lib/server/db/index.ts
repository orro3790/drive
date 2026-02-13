import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { DATABASE_URL } from '$env/static/private';
import * as schema from './schema';

// Node 22+ has native WebSocket; Vercel edge runtime has it too
neonConfig.webSocketConstructor = globalThis.WebSocket;

const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });
