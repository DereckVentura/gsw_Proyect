param([int]$Rondas = 1)
$taskResults = @()
foreach ($taskRound in 1..$Rondas) {
    foreach ($taskPort in 19001,19002,19003) {
        try {
            $taskResponse = Invoke-RestMethod -Uri "http://127.0.0.1:$taskPort/health" -TimeoutSec 4
            $taskResults += [pscustomobject]@{Hora=(Get-Date).ToString('o');Puerto=$taskPort;Nodo=$taskResponse.nodo;Estado='SALUDABLE'}
        } catch {
            $taskResults += [pscustomobject]@{Hora=(Get-Date).ToString('o');Puerto=$taskPort;Nodo='no disponible';Estado='CAIDO'}
        }
    }
}
$taskResults | Format-Table -AutoSize
if ($taskResults.Estado -contains 'CAIDO') { exit 1 }
