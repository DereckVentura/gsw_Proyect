$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
New-Item -ItemType Directory -Force -Path '.local\certs' | Out-Null
if (-not (Test-Path -LiteralPath '.env')) {
    function New-LabSecret {
        $taskBytes = New-Object byte[] 32
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($taskBytes)
        [Convert]::ToBase64String($taskBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
    }
    @("DB_PASSWORD=$(New-LabSecret)","MYSQL_ROOT_PASSWORD=$(New-LabSecret)","JWT_SECRET=$(New-LabSecret)") | Set-Content -LiteralPath '.env' -Encoding ascii
}
if (-not (Test-Path -LiteralPath '.local\certs\localhost.key')) {
    $taskOpenSsl = Get-Command openssl.exe -ErrorAction SilentlyContinue
    if ($taskOpenSsl) { $taskOpenSslPath = $taskOpenSsl.Source } else { $taskOpenSslPath = 'C:\Program Files\Git\usr\bin\openssl.exe' }
    if (-not (Test-Path -LiteralPath $taskOpenSslPath)) { throw 'Se requiere OpenSSL, incluido en Git para Windows.' }
    & $taskOpenSslPath req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 -keyout '.local/certs/localhost.key' -out '.local/certs/localhost.crt' -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,DNS:nginx,IP:127.0.0.1' -addext 'basicConstraints=critical,CA:FALSE' -addext 'keyUsage=critical,digitalSignature,keyEncipherment' -addext 'extendedKeyUsage=serverAuth' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el certificado.' }
}
Write-Host 'Configuración privada y certificado local preparados. No se muestran secretos.'
