import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import { notify } from './notify.js';

export function newInviteCode(): string {
  // Senza caratteri ambigui (0/O, 1/I) per poterlo dettare a voce.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// La prima volta che un invitato partecipa davvero (pubblica o entra in una Piazza),
// chi lo ha invitato riceve un invito in più.
export async function rewardInviterOnce(userId: number) {
  const res = await pool.query(
    `UPDATE users SET invite_rewarded = TRUE
     WHERE id = $1 AND invited_by IS NOT NULL AND invite_rewarded = FALSE
     RETURNING invited_by, display_name`,
    [userId],
  );
  const row = res.rows[0];
  if (!row) return;
  await pool.query('UPDATE users SET invites_left = invites_left + 1 WHERE id = $1', [row.invited_by]);
  await notify(row.invited_by, 'invite_reward', `${row.display_name} è entrato nella comunità: hai un invito in più.`, '/inviti');
}
