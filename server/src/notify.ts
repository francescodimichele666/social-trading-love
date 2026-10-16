import type pg from 'pg';
import { pool } from './db.js';

export async function notify(userId: number, kind: string, message: string, link: string | null = null, client: pg.Pool | pg.PoolClient = pool) {
  await client.query('INSERT INTO notifications (user_id, kind, message, link) VALUES ($1, $2, $3, $4)', [userId, kind, message, link]);
}
