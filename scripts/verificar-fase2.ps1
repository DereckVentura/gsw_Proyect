$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
function Assert-That($Condition, $Message) { if (-not $Condition) { throw $Message } }
docker compose config --quiet
Assert-That ($LASTEXITCODE -eq 0) 'Configuración Compose inválida.'
docker compose exec -T apache httpd -t
Assert-That ($LASTEXITCODE -eq 0) 'Configuración Apache inválida.'
# Las peticiones validan TLS con la confianza del sistema; no se omiten errores.
$taskHome = Invoke-WebRequest -UseBasicParsing 'https://localhost:8443/'
Assert-That ($taskHome.StatusCode -eq 200 -and $taskHome.Content -match 'AutoRent') 'No se obtuvo la interfaz desde Apache.'
$taskVehicles = Invoke-RestMethod 'https://localhost:8443/api/vehiculos'
Assert-That ($taskVehicles.success -and $taskVehicles.data.vehicles.Count -gt 0) 'El catálogo del negocio está vacío o no responde.'
$taskId = $taskVehicles.data.vehicles[0].id
$taskDetail = Invoke-RestMethod "https://localhost:8443/api/vehiculos/$taskId"
Assert-That ($taskDetail.data.vehicle.id -eq $taskId) 'La consulta por identificador falló.'
$taskFiltered = Invoke-RestMethod 'https://localhost:8443/api/vehiculos?precio_max=60'
foreach ($taskVehicle in $taskFiltered.data.vehicles) {
    Assert-That ([decimal]$taskVehicle.precio_dia -le 60) 'El filtro de precio no se aplicó.'
}
$taskLegacy = Invoke-RestMethod 'https://localhost:8443/api/v1/vehicles'
Assert-That $taskLegacy.success 'La API utilizada por la interfaz no responde.'
$taskHealth = Invoke-WebRequest -UseBasicParsing 'https://localhost:8443/api/v1/health/database'
Assert-That ($taskHealth.StatusCode -eq 200) 'La conexión MySQL no responde.'
$taskRedirect = & curl.exe --silent --output NUL --write-out '%{http_code} %{redirect_url}' 'http://localhost:8088/'
Assert-That ($taskRedirect -eq '301 https://localhost:8443/') 'La redirección HTTP a HTTPS falló.'
Write-Host "Verificación correcta: HTTPS confiable, interfaz, proxy, catálogo ($($taskVehicles.data.vehicles.Count) vehículos), detalle, filtros, MySQL y redirección."
Write-Host 'La captura del panel de seguridad del navegador se comprueba por separado.'
