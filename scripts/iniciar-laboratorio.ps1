$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $taskDockerBin = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
    if (Test-Path -LiteralPath (Join-Path $taskDockerBin 'docker.exe')) { $env:PATH = $taskDockerBin + ';' + $env:PATH }
}
& "$PSScriptRoot\preparar-laboratorio.ps1"
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el laboratorio. Revisa Docker Desktop y los registros.' }
docker compose ps
Write-Host 'Interfaz: https://localhost:8443 | Balanceador: https://localhost:8444/health'
