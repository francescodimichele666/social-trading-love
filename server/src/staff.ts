import type pg from 'pg';
import { config } from './config.js';
import { pool, tx } from './db.js';

// Chi ha i poteri nella comunità lo decidono le email in .env (OWNER_EMAIL e ADMIN_EMAILS),
// mai l'ordine di iscrizione. Gli altri amministratori li nomina solo il proprietario dall'app.
export function staffRoleFor(email: string): 'owner' | 'admin' | 'member' {
  const e = email.trim().toLowerCase();
  if (e === config.ownerEmail) return 'owner';
  return config.adminEmails.includes(e) ? 'admin' : 'member';
}

// Chi può nominare e togliere amministratori e moderatori: il proprietario e gli amministratori fondatori (ADMIN_EMAILS).
export function canAppoint(u: { is_owner: boolean; role: string; email?: string | null }): boolean {
  return Boolean(u.is_owner) || (u.role === 'admin' && config.adminEmails.includes((u.email ?? '').toLowerCase()));
}

// Rende proprietario l'account indicato. Chi era proprietario prima torna semplice membro.
export async function applyStaff(c: pg.PoolClient, ownerId: number) {
  await c.query(`UPDATE users SET is_owner = FALSE, role = 'member' WHERE is_owner AND id <> $1`, [ownerId]);
  const { rows: [u] } = await c.query(`UPDATE users SET is_owner = TRUE, role = 'admin' WHERE id = $1 RETURNING *`, [ownerId]);
  return u;
}

// All'avvio: gli account già iscritti con quelle email prendono il loro ruolo.
export async function syncStaff() {
  // L'email del proprietario, poi la stessa scritta senza la "i" (un errore di battitura già capitato).
  const typo = config.ownerEmail.replace('dimichele@', 'dimchele@');
  let { rows: [owner] } = await pool.query(
    'SELECT id, email, is_owner FROM users WHERE email = ANY($1) AND deleted_at IS NULL ORDER BY (email = $2) DESC LIMIT 1',
    [[config.ownerEmail, typo], config.ownerEmail],
  );
  // Nessun account con quell'email: resta il proprietario che c'è già, o se manca il primo account creato.
  if (!owner) ({ rows: [owner] } = await pool.query('SELECT id, email, is_owner FROM users WHERE deleted_at IS NULL ORDER BY is_owner DESC, id LIMIT 1'));
  if (owner && !owner.is_owner) await tx((c) => applyStaff(c, owner.id));
  else if (owner) await pool.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [owner.id]);
  if (owner) console.log(`Proprietario della comunità: ${owner.email}`);
  if (config.adminEmails.length) {
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = ANY($1) AND deleted_at IS NULL AND banned_at IS NULL`, [config.adminEmails]);
  }
}
