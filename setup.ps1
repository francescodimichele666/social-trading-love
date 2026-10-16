# Configurazione guidata per Windows.
# Uso (PowerShell come amministratore, dentro la cartella del progetto):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

function New-Secret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Write-Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }

Write-Host "Social Trading Love - configurazione" -ForegroundColor Green

# 1. Docker
Write-Step "Controllo Docker"
docker version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker non risponde. Installa e apri Docker Desktop, poi rilancia questo script." -ForegroundColor Red
    exit 1
}
Write-Host "Docker e' acceso."

# 2. File .env con indirizzo e chiavi segrete
$useDuck = $false
if (Test-Path .env) {
    Write-Step "Il file .env esiste gia': lo tengo (contiene le password del database)."
    $useDuck = [bool](Select-String -Path .env -Pattern '^DUCKDNS_TOKEN=.+' -Quiet)
} else {
    Write-Step "Indirizzo del sito"
    Write-Host "1 = indirizzo gratuito DuckDNS (es. tradinglove.duckdns.org)"
    Write-Host "2 = un dominio che hai comprato (es. tradinglove.it)"
    $choice = Read-Host "Scegli 1 o 2"
    $duckSub = ''
    $duckToken = ''
    if ($choice -eq '1') {
        $useDuck = $true
        $duckSub = (Read-Host "Nome scelto su duckdns.org (solo la prima parte, es. tradinglove)").Trim().ToLower()
        $duckToken = (Read-Host "Token di DuckDNS (lo trovi in alto sulla pagina duckdns.org)").Trim()
        $domain = "$duckSub.duckdns.org"
    } else {
        $domain = (Read-Host "Il tuo dominio (es. tradinglove.it)").Trim().ToLower()
    }
    $ownerEmail = (Read-Host "La tua email (sara' l'unica che puo' creare il primo account)").Trim().ToLower()

    $lines = @(
        "DOMAIN=$domain",
        "LIVE_DOMAIN=live.$domain",
        "OWNER_EMAIL=$ownerEmail",
        "DB_PASSWORD=$(New-Secret)",
        "JWT_SECRET=$(New-Secret)",
        "LIVEKIT_API_KEY=stlkey",
        "LIVEKIT_API_SECRET=$(New-Secret)",
        "DUCKDNS_SUBDOMAIN=$duckSub",
        "DUCKDNS_TOKEN=$duckToken"
    )
    # UTF-8 senza BOM, righe in stile Linux: Docker lo legge senza sorprese.
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Creato il file .env con chiavi segrete nuove. Non condividerlo con nessuno."
}

# 3. Firewall di Windows (serve PowerShell come amministratore)
Write-Step "Apro le porte nel firewall di Windows"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    $rules = @(
        @{ Name = 'STL Web';        Protocol = 'TCP'; Port = '80,443' },
        @{ Name = 'STL Video TCP';  Protocol = 'TCP'; Port = '7881' },
        @{ Name = 'STL Video UDP';  Protocol = 'UDP'; Port = '50000-50100' }
    )
    foreach ($r in $rules) {
        if (-not (Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol $r.Protocol -LocalPort $r.Port | Out-Null
        }
        Write-Host "Porta aperta: $($r.Name) ($($r.Protocol) $($r.Port))"
    }
} else {
    Write-Host "Non sei amministratore: salto il firewall. Rilancia PowerShell con 'Esegui come amministratore' per aprirle." -ForegroundColor Yellow
}

# 4. Avvio
Write-Step "Avvio dei servizi (la prima volta ci vogliono alcuni minuti)"
if ($useDuck) {
    docker compose --profile duckdns up -d --build
} else {
    docker compose up -d --build
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Qualcosa non e' andato. Copia le righe rosse qui sopra e mandale a Claude." -ForegroundColor Red
    exit 1
}

$domainLine = (Select-String -Path .env -Pattern '^DOMAIN=(.+)$').Matches[0].Groups[1].Value
Write-Step "Fatto!"
Write-Host "Tra un paio di minuti apri dal telefono (meglio con i dati, non con il wifi di casa):"
Write-Host "   https://$domainLine" -ForegroundColor Green
Write-Host "e iscriviti con la tua email: sarai il proprietario."
Write-Host ""
Write-Host "Per vedere cosa succede:  docker compose logs -f"
