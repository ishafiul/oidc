import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { Env } from '../context';
import * as schema from './schema';

export type DB = NeonHttpDatabase<typeof schema>;

export function getDb(env: Env): DB {
    const sql = neon(env.POSTGRES_CONNECTION_STRING);
    return drizzle({
        client: sql,
        schema,
    });
}