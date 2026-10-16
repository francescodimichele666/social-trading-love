import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { notify } from './notify.js';

// Restituisce il codice personale "porta un amico", creandolo la prima volta.
export async function friendCodeFor(userId: number): Promise<string> {
  const existing = await pool.query('SELECT friend_code FROM users WHERE id = $1', [userId]);
  if (existing.rows[0]?.friend_code) return existing.rows[0].friend_code;
  for (;;) {
    const code = newInviteCode();
    const res = await pool.query('UPDATE users SET friend_code = $2 WHERE id = $1 AND friend_code IS NULL RETURNING friend_code', [userId, code]).catch(() => null);
    if (res?.rows[0]) return code;
    const again = await pool.query('SELECT friend_code FROM users WHERE id = $1', [userId]);
    if (again.rows[0]?.friend_code) return again.rows[0].friend_code;
  }
}

export function newInviteCode(): string {
  // Senza caratteri ambigui (0/O, 1/I) per poterlo dettare a voce.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// La prima volta che un invitato partecipa davvero (pubblica o entra in una Piazza),
// chi lo ha portato riceve un avviso e lo conta tra i suoi amici attivi.
export async function rewardInviterOnce(userId: number) {
  const res = await pool.query(
    `UPDATE users SET invite_rewarded = TRUE
     WHERE id = $1 AND invited_by IS NOT NULL AND invite_rewarded = FALSE
     RETURNING invited_by, display_name`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) return;
  await notify(row.invited_by, 'invite_reward', `${row.display_name} è entrato nella comunità grazie a te.`, '/inviti');
}
