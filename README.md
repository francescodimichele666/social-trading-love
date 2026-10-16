# Love Trading Club

La comunità gratuita del trading responsabile: post, video, Piazze live con fino a 6 persone sul palco, iscrizione libera e gratuita.

## Cosa c'è dentro

| Cartella | Cosa fa |
| --- | --- |
| `server/` | Il "cervello": iscrizioni, inviti, post, feed, Piazze, moderazione (Node.js + PostgreSQL) |
| `web/` | L'app che si apre dal telefono o dal computer e si può installare sulla schermata Home |
| `livekit.yaml` | Il server video delle Piazze live (LiveKit, gratuito e open source) |
| `docker-compose.yml` | Accende tutto insieme con un solo comando |

## Funzioni

- Iscrizione libera e gratuita, solo maggiorenni, accettazione delle regole. Il primo iscritto diventa il proprietario: solo lui nomina gli amministratori.
- "Porta un amico": ogni persona ha un link personale; chi si iscrive con quel link arriva già collegato.
- Post con testo, foto o video (fino a 50 MB), like e commenti.
- Feed onesto: prima chi segui, poi la comunità, poi "Hai visto tutto per oggi".
- Piazze live: video e audio, fino a 6 persone sul palco, il pubblico alza la mano, chi conduce fa salire e scendere, chat.
- Trading responsabile: le frasi tipiche delle truffe ("guadagno sicuro", "gruppo VIP"...) mandano il contenuto in revisione.
- Segnalazioni e pannello di moderazione: ogni decisione arriva alla persona con la motivazione (Digital Services Act).

## Mettere online sul tuo server (passo passo)

**Hai un PC Windows a casa?** Segui la [guida per Windows](GUIDA-WINDOWS.md): c'è uno script che fa quasi tutto da solo.

Su un server Linux:

Ti serve: un server Linux (Ubuntu va benissimo) con almeno 2 GB di RAM, raggiungibile da internet, e un dominio.

1. **Dominio.** Compra un dominio (es. su Aruba o Register.it, circa 10 € l'anno). Nel pannello del dominio crea due record DNS di tipo `A` che puntano all'IP del server: uno per il dominio (`tradinglove.it`) e uno per `live.tradinglove.it`.
   *Per una prova senza comprare nulla*: se il server ha IP `1.2.3.4`, usa `1-2-3-4.sslip.io` e `live.1-2-3-4.sslip.io`. Funzionano subito.
2. **Porte aperte** sul server e sul router/firewall: `80`, `443`, `7881` (TCP) e `50000-50100` (UDP, per il video).
3. **Installa Docker** sul server:
   ```
   curl -fsSL https://get.docker.com | sh
   ```
4. **Copia il progetto** sul server (con `git clone` oppure caricando la cartella).
5. **Prepara le impostazioni:**
   ```
   cp .env.example .env
   nano .env
   ```
   Metti il tuo dominio e cambia password e chiavi. Per creare chiavi sicure usa `openssl rand -hex 32`.
6. **Accendi tutto:**
   ```
   docker compose up -d --build
   ```
   La prima volta ci mette qualche minuto. Il certificato HTTPS arriva da solo.
7. **Apri il sito** dal telefono e iscriviti per primo con l'email messa in `OWNER_EMAIL`: diventi il proprietario.

Comandi utili: `docker compose logs -f api` (vedere cosa succede), `docker compose down` (spegnere), `git pull && docker compose up -d --build` (aggiornare).

**Backup del database** (da fare ogni giorno, per esempio con cron):
```
docker compose exec db pg_dump -U stl stl > backup-$(date +%F).sql
```

## Sviluppo sul computer

Servono Node.js 22 e PostgreSQL.

```
# Server
cd server
npm install
DATABASE_URL=postgres://utente:password@localhost:5432/stl npm run dev
npm test        # prove automatiche (usa il database stl_test)

# App (in un altro terminale)
cd web
npm install
npm run dev     # apre su http://localhost:5173
```

Per provare le Piazze in locale scarica `livekit-server` da https://github.com/livekit/livekit/releases e avvialo con `livekit-server --dev`, poi avvia il server con `LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret`.

## Avvertenza

I contenuti degli utenti sono opinioni e formazione, non consulenza finanziaria. Prima di aprire al pubblico: informativa privacy, termini d'uso e valutazione d'impatto privacy (DPIA) vanno fatti controllare da un professionista.
