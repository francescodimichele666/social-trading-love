// Cambia la password di un account dal PC del server, senza email.
// Uso:  docker compose exec api node dist/reset-password.js tua@email.it
// La nuova password si scrive due volte e non compare sullo schermo. Tutti gli accessi aperti vengono chiusi.
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(question);
    out._writeToOutput = (s) => { if (s.includes('\n') || s.includes('\r')) process.stdout.write('\n'); };
    rl.question('', (answer) => { rl.close(); resolve(answer); });
  });
}

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email) {
  console.log('Scrivi l\'email dell\'account, per esempio: node dist/reset-password.js tua@email.it');
  process.exit(1);
}
const { rows: [user] } = await pool.query('SELECT id, display_name FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
if (!user) {
  console.log(`Nessun account con l'email ${email}.`);
  await pool.end();
  process.exit(1);
}
const first = await ask(`Nuova password per ${user.display_name} (almeno 8 caratteri): `);
const again = await ask('Riscrivila: ');
if (first.length < 8) console.log('La password deve avere almeno 8 caratteri. Niente è cambiato.');
else if (first !== again) console.log('Le due password non coincidono. Niente è cambiato.');
else {
  await pool.query('UPDATE users SET password_hash = $1, password_changed_at = now(), sessions_revoked_at = now() WHERE id = $2', [await bcrypt.hash(first, 10), user.id]);
  console.log('Password cambiata. Ora entra nel sito con la nuova password.');
}
await pool.end();
