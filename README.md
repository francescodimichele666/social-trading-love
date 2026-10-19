# Love Trading Club

La comunità gratuita del trading responsabile: post, video, Live con fino a 6 persone sul palco, diario di trading, sfida della settimana, iscrizione libera e gratuita.

## Cosa c'è dentro

| Cartella | Cosa fa |
| --- | --- |
| `server/` | Il "cervello": iscrizioni, inviti, post, feed, Live, moderazione (Node.js + PostgreSQL) |
| `web/` | L'app che si apre dal telefono o dal computer e si può installare sulla schermata Home |
| `livekit.yaml` | Il server video delle Live (LiveKit, gratuito e open source) |
| `docker-compose.yml` | Accende tutto insieme con un solo comando |

## Funzioni

- Iscrizione libera e gratuita, solo maggiorenni, accettazione delle regole. Il primo iscritto diventa il proprietario: solo lui nomina gli amministratori.
- "Porta un amico": ogni persona ha un link personale; chi si iscrive con quel link arriva già collegato.
- Post con testo, foto o video. I video durano al massimo 2 minuti: il server li controlla, li converte in MP4 (720p) che si vede su tutti i telefoni e crea la copertina. Nel feed partono senza audio quando sono sullo schermo; un tocco attiva l'audio. Like e commenti.
- Feed onesto: prima chi segui, poi la comunità, poi "Hai visto tutto per oggi".
- Live: video e audio, fino a 6 persone sul palco, il pubblico alza la mano, chi conduce fa salire e scendere, chat.
- Pannello di chi conduce la Live: collegati ora, picco, entrati in tutto, palco, mani alzate, durata; fai uscire (solo da quella Live) o blocca (da tutte le Live di chi conduce), con ripensamento.
- Pagina di presentazione per chi non è iscritto (cosa trovi, come funziona, prossime Live, regole, domande frequenti), con anteprima curata per i link condivisi su WhatsApp/Telegram.
- Ricerca di persone, post e #hashtag (gli hashtag nei post sono cliccabili), argomenti della settimana.
- Badge Mentore per i membri esperti, assegnato da proprietario e amministratori; elenco dei Mentori nella pagina Cerca.
- Porta un amico: condivisione su WhatsApp e Telegram, codice QR e classifica del mese (contano solo gli amici attivi).
- Accessi sicuri: codice di 6 cifre via email all'iscrizione (dalla casella del proprietario), verifica in due passaggi con app di autenticazione e 10 codici di riserva.
- Pannello utenti per gli amministratori: ricerca, filtri, conferma email, link nuova password, chiudi tutti gli accessi, togli i due passaggi, sospendi o riattiva, storico delle decisioni.
- Trading responsabile: le frasi tipiche delle truffe ("guadagno sicuro", "gruppo VIP"...) mandano il contenuto in revisione.
- Segnalazioni e pannello di moderazione: ogni decisione arriva alla persona con la motivazione (Digital Services Act).
- Pronti per il pubblico: informativa privacy e condizioni d'uso con consenso all'iscrizione, "ho dimenticato la password" via email dalla casella del proprietario, notifiche sul telefono (Web Push, chiavi create da sole), scarica i tuoi dati ed elimina l'account, backup automatico ogni notte.
- Diario di trading: ogni operazione con ingresso, stop loss, obiettivo e rischio in percentuale; alla chiusura calcola il risultato in "R" e tiene le statistiche (vincenti, rischio medio, quante volte hai spostato lo stop). Ogni operazione salvata va subito nel feed come post con una scheda grafica (solo percentuali, mai euro), che si aggiorna da sola quando l'operazione viene chiusa. Le statistiche le vede solo chi tiene il diario.
- Sfida della settimana: da lunedì a domenica, un'abitudine da trader responsabile (es. "Lo stop non si tocca"). Ogni giorno si risponde sì o no; con 5 giorni su 7 arriva il badge sul profilo. Se nessuno la sceglie parte da sola a rotazione; gli amministratori possono sceglierla o scriverla.
- Registrazione delle Live (facoltativa, la sceglie chi apre la Live): un servizio a parte (LiveKit Egress) salva un MP4 a 720p di chi è sul palco. Avviso chiaro prima di entrare e scritta REC durante la diretta; le registrazioni si guardano nella pagina Live e chi conduceva o un amministratore le può cancellare. Si spegne con `RECORDINGS=false`.
- Pannello amministratore (solo per gli amministratori): numeri della comunità e iscrizioni degli ultimi 14 giorni, rimozione immediata di post e commenti con motivazione, elenco degli account sospesi e riattivazione. Moderatori e amministratori sospesi li riattiva solo il proprietario.

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
7. **Apri il sito** dal telefono e iscriviti con l'email messa in `OWNER_EMAIL`: diventi il proprietario. Chi usa un'email di `ADMIN_EMAILS` diventa amministratore; tutti gli altri sono membri, anche chi si iscrive per primo.

Comandi utili: `docker compose logs -f api` (vedere cosa succede), `docker compose down` (spegnere), `git pull && docker compose up -d --build` (aggiornare).

**Backup automatico**: il servizio `backup` salva ogni notte alle 3 il database (`backups/db-AAAA-MM-GG.dump`, ultimi 14 giorni) e le foto/video (`backups/uploads`). Copia la cartella `backups` anche fuori dal server. Come ripristinare: vedi GUIDA-WINDOWS.md.

**Dopo il primo accesso** (solo il proprietario): Profilo, ingranaggio, Impostazioni del proprietario. Imposta la casella email da cui partono le email (Gmail, Libero, Aruba o qualsiasi SMTP) e i dati del titolare per l'informativa privacy.

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

Per provare le Live in locale scarica `livekit-server` da https://github.com/livekit/livekit/releases e avvialo con `livekit-server --dev`, poi avvia il server con `LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret`.

## Avvertenza

I contenuti degli utenti sono opinioni e formazione, non consulenza finanziaria. Prima di aprire al pubblico: informativa privacy, termini d'uso e valutazione d'impatto privacy (DPIA) vanno fatti controllare da un professionista.
