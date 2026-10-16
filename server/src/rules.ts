// Regole della comunità per il trading responsabile.
export const RULES_VERSION = '2026-10-16';

export const RULES = [
  'Qui si impara e ci si confronta: nessun consiglio di investimento personalizzato e nessun "segnale" da copiare.',
  'Niente promesse di guadagni sicuri, rendimenti garantiti o schemi per arricchirsi in fretta.',
  'Mostra anche le perdite: raccontare gli errori aiuta tutti a fare meglio.',
  'Nessuna raccolta di soldi, gestione di conti altrui o vendita di corsi e gruppi esterni.',
  'Rispetto per tutti: niente insulti, molestie, discriminazioni o contenuti illegali.',
  'Solo maggiorenni. Se vedi qualcosa che non va, usa il pulsante Segnala.',
];

// Frasi tipiche delle truffe e del trading irresponsabile: il contenuto passa in revisione.
const RED_FLAGS = [
  'guadagno sicuro', 'guadagni sicuri', 'guadagno garantito', 'rendimento garantito', 'rendimenti garantiti',
  'senza rischi', 'zero rischi', 'segnali vip', 'gruppo vip', 'raddoppia i tuoi soldi', 'diventa ricco',
  'all in', 'scrivimi in privato', 'contattami su whatsapp', 'investi con me', 'ti gestisco il conto',
];

export function hasRedFlags(text: string): boolean {
  const t = text.toLowerCase();
  return RED_FLAGS.some((f) => t.includes(f));
}
