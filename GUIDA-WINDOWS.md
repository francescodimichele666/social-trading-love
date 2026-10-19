# Mettere online il social sul tuo PC Windows di casa

Questa guida porta il social dal codice al tuo telefono, usando il PC di casa come server. Ci vuole circa un'ora la prima volta. I passi vanno fatti in ordine: se uno non funziona, fermati e scrivi a Claude cosa vedi.

## Cosa serve

- Un PC con Windows 10 o 11 a 64 bit, almeno 8 GB di RAM, **sempre acceso** e collegato al router (meglio con il cavo).
- Accesso alla pagina di gestione del router (di solito `192.168.1.1` o `192.168.0.1`, la password è spesso sotto il router).
- Un indirizzo internet: va bene quello **gratuito di DuckDNS**, oppure un dominio comprato.

## Passo 1. Controlla che la tua linea si possa raggiungere da fuori

Molte linee di casa italiane (soprattutto fibra di alcuni operatori e connessioni FWA/4G) sono dietro un "CGNAT": l'operatore condivide lo stesso indirizzo tra tanti clienti, e da fuori nessuno può raggiungere il tuo PC.

1. Entra nel router e cerca "IP WAN", "IP pubblico" o "Indirizzo Internet". Annota il numero.
2. Dal PC cerca su Google **"qual è il mio ip"** e annota il numero.
3. **Se i due numeri sono uguali**: perfetto, vai al passo 2.
4. **Se sono diversi**, oppure quello del router inizia con `100.` (da 100.64 a 100.127) o con `10.`: sei dietro CGNAT. Chiama il tuo operatore e chiedi **"un indirizzo IP pubblico"** (spesso è gratis) oppure **"un IP statico"** (a pagamento, di solito pochi euro al mese). Questo è il caso in cui l'IP fisso serve davvero.

Con un IP pubblico che cambia ogni tanto va bene lo stesso: ci pensa DuckDNS ad aggiornarlo.

## Passo 2. Crea l'indirizzo gratuito su DuckDNS

1. Vai su [duckdns.org](https://www.duckdns.org) ed entra con il tuo account Google.
2. Nel campo "sub domain" scrivi un nome (es. `tradinglove`) e premi **add domain**.
3. Copia il **token** che vedi in alto nella pagina: ti servirà al passo 6.

Il tuo social sarà su `https://tradinglove.duckdns.org` e il video delle Live su `live.tradinglove.duckdns.org` (funziona da solo, non devi crearlo).

Se in futuro vuoi un nome più bello (es. `tradinglove.it`), si compra il dominio e si cambia una riga: nessun problema.

## Passo 3. Dai al PC un indirizzo fisso dentro casa

1. Sul PC apri il **Prompt dei comandi** e scrivi `ipconfig`. Annota l'"Indirizzo IPv4" (es. `192.168.1.50`).
2. Nel router cerca "DHCP", "Assegnazione IP statica" o "Prenotazione indirizzo" e fai in modo che il PC riceva **sempre** quell'indirizzo.

## Passo 4. Apri le porte sul router

Nel router cerca "Port forwarding", "Inoltro porte" o "Virtual server" e crea queste regole, tutte verso l'indirizzo del PC del passo 3:

| Porta | Tipo | A cosa serve |
| --- | --- | --- |
| 80 | TCP | Certificato di sicurezza (HTTPS) |
| 443 | TCP | Il sito |
| 7881 | TCP | Video delle Live (riserva) |
| 50000-50100 | UDP | Video delle Live |

## Passo 5. Installa Docker Desktop

1. Scarica Docker Desktop da [docker.com](https://www.docker.com/products/docker-desktop/) e installalo lasciando attiva l'opzione **WSL 2**.
2. Riavvia il PC quando lo chiede, poi apri Docker Desktop e accetta le condizioni (per uso personale e senza scopo di lucro è gratuito).
3. In Docker Desktop vai in **Settings → General** e attiva **"Start Docker Desktop when you sign in"**.
4. In Windows vai in **Impostazioni → Sistema → Alimentazione** e metti la sospensione su **Mai**: se il PC dorme, il social si spegne.

## Passo 6. Scarica il social e avvialo

1. Apri [la pagina del progetto su GitHub](https://github.com/francescodimichele666/social-trading-love), premi il pulsante verde **Code → Download ZIP** ed estrai la cartella in `C:\social-trading-love`.
2. Premi Start, scrivi **PowerShell**, clic destro → **Esegui come amministratore**.
3. Scrivi questi due comandi (premi Invio dopo ognuno):
   ```
   cd C:\social-trading-love
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
4. Rispondi alle domande: scegli `1` (DuckDNS), scrivi il nome del passo 2, incolla il token, scrivi la tua email.

Lo script crea le password segrete, apre le porte nel firewall di Windows e accende tutto. La prima volta ci mette qualche minuto.

## Passo 7. Prima iscrizione: sei il proprietario

1. Dal telefono, **con i dati mobili e non con il wifi di casa**, apri `https://tradinglove.duckdns.org`.
2. Premi **Iscriviti gratis** e usa **la stessa email** messa nello script: diventi il proprietario. Nessun altro può prendere quel posto: chi si iscrive per primo non diventa amministratore. Il proprietario è francescodimichele@gmail.com e l'amministratore fondatore è lorenzogiustarini@gmail.com: sono scritti nel programma e possono entrambi nominare o togliere amministratori e moderatori.
3. Dal menu del browser scegli **"Aggiungi a schermata Home"**: da quel momento il social si apre come un'app.
4. Dal tuo profilo tocca **Porta un amico** e manda il link alle prime persone.

Come proprietario sei l'unico che può nominare o togliere amministratori. Per farlo apri il profilo di una persona: in fondo trovi i pulsanti Membro, Moderatore, Amministratore. Gli amministratori che nomini possono nominare solo moderatori.

## Problemi comuni

| Cosa succede | Cosa fare |
| --- | --- |
| Il sito non si apre dal telefono | Controlla il passo 1 (CGNAT) e il passo 4 (porte). Prova con i dati mobili, non con il wifi di casa |
| Il browser dice "connessione non sicura" | Il certificato non è ancora arrivato: aspetta 2-3 minuti. Se resta, la porta 80 non è aperta |
| Il sito si apre ma le Live non mostrano il video | Vedi qui sotto **Se la Live non si collega** |
| Dal wifi di casa non funziona, con i dati sì | Il router non supporta il "NAT loopback". Non è un problema per gli altri utenti |
| Ho spento il PC | Riaccendilo: Docker riparte da solo e il social torna online |

Per vedere cosa succede, in PowerShell dentro la cartella: `docker compose logs -f` (esci con Ctrl+C).

### Se la Live non si collega

Quando sali sul palco e il video non parte, ora l'app scrive il motivo in rosso. Prova in quest'ordine:

1. **Prova dal telefono con i dati mobili** (Wi-Fi spento). Molti router di casa non fanno rientrare il video verso il PC dalla stessa rete: se con i dati funziona, il social va bene e gli altri utenti non hanno problemi.
2. **Controlla le porte sul router** (passo 4): `7881` TCP e `50000-50100` UDP, verso l'indirizzo fisso del PC.
3. **Controlla il firewall di Windows**: Start, scrivi "Windows Defender Firewall", **Impostazioni avanzate**, **Regole connessioni in entrata**, **Nuova regola**, **Porta**, `UDP` `50000-50100`, **Consenti la connessione**, nome "Live video". Ripeti con `TCP` `7881`.
4. **Permessi del browser**: se compare "non ha dato il permesso per fotocamera o microfono", tocca il lucchetto vicino all'indirizzo e consenti fotocamera e microfono.
5. Se ancora non va, in PowerShell nella cartella del social lancia `docker compose logs livekit --tail 80` e manda il risultato a Claude.

### Il pannello di chi conduce

Chi avvia una Live vede sotto il video il **Pannello della Live**: persone collegate ora, picco, quante ne sono entrate in tutto, chi è sul palco, mani alzate e da quanto dura la diretta. Toccando una persona puoi farla salire sul palco, farla scendere, **farla uscire** (non rientra in quella Live) o **bloccarla** (non entra più in nessuna delle tue Live). Chi hai fatto uscire o bloccato compare in fondo al pannello, con il tasto per farlo rientrare o sbloccarlo.

## Aggiornare il social

Quando Claude prepara una versione nuova, in PowerShell:

```
cd C:\social-trading-love
git pull
docker compose --profile duckdns up -d --build
```

Se non usi git: scarica di nuovo lo ZIP ed estrailo **sopra** la cartella `C:\social-trading-love` (il file `.env` con le tue password resta), poi lancia solo l'ultima riga. Il database si aggiorna da solo all'avvio: i tuoi utenti e i post restano.

## Sicurezza degli accessi

- **Codice via email all'iscrizione:** chi si iscrive riceve un codice di 6 cifre dalla tua casella (passo 8) e deve scriverlo per entrare. Finché l'email di invio non è impostata, serve il **codice di prova** scritto nel file `.env` alla riga `ACCESS_TEST_CODE` (se non c'è, vale `123456`): cambialo con un numero tuo e dallo solo a chi vuoi far entrare. Gli utenti già iscritti valgono come confermati.
- **Verifica in due passaggi:** ognuno la attiva da **Profilo**, ingranaggio, **Sicurezza**, con un'app gratuita come Google Authenticator. Attivala per prima sul tuo account di proprietario e conserva i codici di riserva.
- **Pannello utenti:** nella Home tocca l'icona del pannello in alto (la vedono solo gli amministratori), poi **Tutti gli utenti**. Cerchi chiunque per nome o email e puoi confermare l'email, mandare il link per una nuova password, chiudere tutti i suoi accessi, togliere la verifica in due passaggi se ha perso il telefono, sospendere o riattivare. Gli amministratori li gestisci solo tu.

## Passo 8. Imposta l'email di invio e i dati per la privacy

Serve perché i membri possano recuperare la password da soli e perché l'informativa privacy dica chi sei. Lo fai una volta sola, dall'app.

1. Crea (o scegli) la casella da cui partiranno le email. Va bene anche una nuova Gmail, per esempio `lovetradingclub@gmail.com`.
2. **Solo se è Gmail:** apri myaccount.google.com, vai su **Sicurezza**, attiva la **Verifica in due passaggi**, poi cerca **Password per le app**, creane una chiamata "Love Trading Club" e copia le 16 lettere. Questa è la password da usare nell'app, non quella normale di Gmail.
3. Nell'app vai su **Profilo**, tocca l'ingranaggio, poi **Impostazioni del proprietario**.
4. In **Email di invio** scegli il tipo di casella (Gmail, Libero, Aruba o Altro), scrivi indirizzo e password e premi **Salva e manda una email di prova**. Se la ricevi, è tutto a posto.
5. In **Titolare per la privacy** scrivi nome e cognome, l'email per le questioni di privacy e la città, poi **Salva**.

Puoi cambiare la casella quando vuoi ripetendo il punto 4. La password viene salvata cifrata sul tuo PC e non si vede mai.

## Passo 9. Attiva le notifiche sul telefono

- **Android:** nell'app vai su **Avvisi** e tocca **Attiva**.
- **iPhone:** le notifiche funzionano solo dall'app installata. In Safari tocca **Condividi** e poi **Aggiungi alla schermata Home**, apri l'app dall'icona, poi **Avvisi** e **Attiva**.

Lo stesso vale per ogni membro: lo trova anche in **Profilo**, ingranaggio, **Notifiche**.

## Backup automatico

Non devi fare niente: il servizio **backup** salva tutto da solo nella cartella `C:\social-trading-love\backups`.

- Il primo backup parte all'avvio, poi uno ogni notte alle 3.
- `db-AAAA-MM-GG.dump` è il database del giorno. Si tengono gli ultimi 14 giorni.
- La cartella `uploads` contiene tutte le foto e i video.
- Le **registrazioni delle Live** non entrano nel backup, perché occupano molto spazio. Se una ti serve, scaricala dalla pagina Live.
- Nel **Pannello amministratore** vedi quando è stato fatto l'ultimo backup. Se compare in giallo, il PC era spento o il servizio è fermo: lancia `docker compose up -d` nella cartella.

**Importante:** il backup sta sullo stesso PC. Almeno una volta a settimana copia la cartella `backups` su una chiavetta o un disco esterno. Puoi anche farlo in automatico mettendo la cartella dentro OneDrive o Google Drive.

### Ripristinare un backup (solo se si rompe qualcosa)

In PowerShell, nella cartella del social, sostituisci la data con quella che vuoi:

```
cd C:\social-trading-love
docker compose stop api
docker compose cp .\backups\db-2026-10-16.dump db:/tmp/ripristino.dump
docker compose exec db pg_restore -U stl -d stl --clean --if-exists /tmp/ripristino.dump
docker compose cp .\backups\uploads\. api:/data/uploads/
docker compose start api
```

Se qualcosa non ti è chiaro, scrivi a Claude prima di farlo.

## Registrazione delle Live

Chi apre una Live può spuntare **Registra la Live**. Durante la diretta compare la scritta REC e chi entra viene avvisato. Quando la Live finisce, il video compare nella pagina **Live**, sezione **Registrazioni**, di solito dopo un paio di minuti.

Cosa devi sapere:

- La registrazione la fa il servizio **egress**, che parte da solo con `docker compose up -d`. La prima volta scarica circa 1 GB.
- Mentre registra usa circa **2 core del processore** e 1 GB di RAM. Su un PC con 8 GB va bene una registrazione alla volta.
- Un'ora di Live occupa circa **300-500 MB** di disco. Cancella quelle che non servono più con il cestino nella pagina Live.
- I video stanno nel volume `recordings` di Docker, sul tuo PC. Non vanno su nessun servizio esterno.

**Se il video non compare** (resta "In preparazione" per più di 10 minuti), lancia in PowerShell nella cartella del social:

```
docker compose logs egress --tail 50
```

e mandami quello che esce. La causa più comune è il router che non lascia "rientrare" il PC sul proprio indirizzo pubblico: si risolve con una riga di configurazione.

**Per spegnere le registrazioni del tutto:** apri il file `.env`, scrivi `RECORDINGS=false`, salva e lancia `docker compose up -d`. La casella "Registra la Live" sparisce dall'app.

## Se hai dimenticato la password (anche senza email)

Dal PC del server, in PowerShell dentro la cartella del progetto:

```
docker compose exec api node dist/reset-password.js tua@email.it
```

Scrivi la nuova password due volte (mentre scrivi non si vede nulla, è normale) e premi Invio. Tutti gli accessi aperti con la vecchia password vengono chiusi.
