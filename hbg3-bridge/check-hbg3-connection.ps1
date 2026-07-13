$hostAddress = '10.0.0.57'
$port = 3000
Write-Host "Testing HBG3 at ${hostAddress}:$port ..."
Test-NetConnection $hostAddress -Port $port
Write-Host ""
Write-Host "TcpTestSucceeded must be True."
