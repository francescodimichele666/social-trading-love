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

Il tuo social sarà su `https://tradinglove.duckdns.org` e il video delle Piazze su `live.tradinglove.duckdns.org` (funziona da solo, non devi crearlo).

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
| 7881 | TCP | Video delle Piazze (riserva) |
| 50000-50100 | UDP | Video delle Piazze |

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
2. Premi **Ho un invito** e iscriviti con **la stessa email** messa nello script: diventi il proprietario. Nessun altro può prendere quel posto.
3. Dal menu del browser scegli **"Aggiungi a schermata Home"**: da quel momento il social si apre come un'app.
4. Vai in **Inviti** e crea i codici per le prime persone.

Come proprietario sei l'unico che può nominare o togliere amministratori. Per farlo apri il profilo di una persona: in fondo trovi i pulsanti Membro, Moderatore, Amministratore. Gli amministratori che nomini possono nominare solo moderatori.

## Problemi comuni

| Cosa succede | Cosa fare |
| --- | --- |
| Il sito non si apre dal telefono | Controlla il passo 1 (CGNAT) e il passo 4 (porte). Prova con i dati mobili, non con il wifi di casa |
| Il browser dice "connessione non sicura" | Il certificato non è ancora arrivato: aspetta 2-3 minuti. Se resta, la porta 80 non è aperta |
| Il sito si apre ma le Piazze non mostrano il video | Mancano le porte 7881 e 50000-50100 (passo 4 e firewall). Scrivi a Claude: si sistema |
| Dal wifi di casa non funziona, con i dati sì | Il router non supporta il "NAT loopback". Non è un problema per gli altri utenti |
| Ho spento il PC | Riaccendilo: Docker riparte da solo e il social torna online |

Per vedere cosa succede, in PowerShell dentro la cartella: `docker compose logs -f` (esci con Ctrl+C).

## Aggiornare il social

Quando Claude prepara una versione nuova: scarica di nuovo lo ZIP, estrailo **sopra** la cartella `C:\social-trading-love` (il file `.env` con le tue password resta), poi in PowerShell:

```
cd C:\social-trading-love
docker compose --profile duckdns up -d --build
```

## Backup

Una volta al giorno (o almeno a settimana) salva il database:

```
cd C:\social-trading-love
docker compose exec -T db pg_dump -U stl -f /tmp/backup.sql stl
docker compose cp db:/tmp/backup.sql .\backup.sql
```

Copia `backup.sql` su una chiavetta o su un cloud. Le foto e i video caricati stanno nel volume Docker `uploads`.
