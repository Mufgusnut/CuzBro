param(
    [Parameter(Mandatory=$true)][ValidateSet(0,1)][int]$Channel,
    [Parameter(Mandatory=$true)][ValidateSet('auto','manual')][string]$Mode,
    [Parameter(Mandatory=$true)][ValidateRange(0,10)][int]$Aggression,
    [Parameter(Mandatory=$true)][ValidateRange(0,100)][int]$ManualPwm
)

$ErrorActionPreference = 'Stop'

# HBG3 Wi-Fi application/AUX-bus port. Port 3000 is the debug console;
# live binary AUX commands are sent through port 2000.
$HostName = if ($env:HBG3_HOST) { $env:HBG3_HOST } else { '10.0.0.57' }
$AuxPort = if ($env:HBG3_AUX_PORT) { [int]$env:HBG3_AUX_PORT } else { 2000 }
$TimeoutMs = if ($env:HBG3_AUX_TIMEOUT_MS) { [int]$env:HBG3_AUX_TIMEOUT_MS } else { 3000 }

function New-AuxPacket {
    param(
        [Parameter(Mandatory=$true)][byte]$Command,
        [Parameter(Mandatory=$true)][byte[]]$Payload
    )

    # AUX packet: 0x3b, length, source=SW(0x20), destination=DEW(0x17),
    # command, payload..., checksum. Length counts bytes from source through payload.
    [byte]$Length = 3 + $Payload.Length
    $body = [System.Collections.Generic.List[byte]]::new()
    $body.Add($Length)
    $body.Add(0x20)
    $body.Add(0x17)
    $body.Add($Command)
    foreach ($b in $Payload) { $body.Add($b) }

    $sum = 0
    foreach ($b in $body) { $sum = ($sum + [int]$b) -band 0xFF }
    [byte]$checksum = ((0x100 - $sum) -band 0xFF)

    $packet = [System.Collections.Generic.List[byte]]::new()
    $packet.Add(0x3b)
    foreach ($b in $body) { $packet.Add($b) }
    $packet.Add($checksum)
    return $packet.ToArray()
}

if ($Mode -eq 'manual') {
    # DEW_SET_MANUAL_PWM = 0x17. PWM is encoded 0..255.
    [byte]$rawPwm = [Math]::Round(($ManualPwm * 255.0) / 100.0)
    $packet = New-AuxPacket -Command 0x17 -Payload ([byte[]]@([byte]$Channel, $rawPwm))
    $description = "manual channel=$Channel output=$ManualPwm% raw=$rawPwm"
}
else {
    if ($Aggression -lt 1) {
        throw 'Automatic mode requires aggression 1-10.'
    }
    # DEW_SET_AUTO_AGGR = 0x16.
    $packet = New-AuxPacket -Command 0x16 -Payload ([byte[]]@([byte]$Channel, [byte]$Aggression))
    $description = "automatic channel=$Channel aggression=$Aggression"
}

$hex = ($packet | ForEach-Object { $_.ToString('x2') }) -join ' '
$client = [System.Net.Sockets.TcpClient]::new()
$client.ReceiveTimeout = $TimeoutMs
$client.SendTimeout = $TimeoutMs

try {
    $connect = $client.ConnectAsync($HostName, $AuxPort)
    if (-not $connect.Wait($TimeoutMs)) {
        throw "Timed out connecting to HBG3 at ${HostName}:${AuxPort}"
    }

    $stream = $client.GetStream()
    $stream.Write($packet, 0, $packet.Length)
    $stream.Flush()

    # Give the HBG3 a moment to place any AUX acknowledgement on this socket.
    Start-Sleep -Milliseconds 250
    $replyHex = ''
    if ($stream.DataAvailable) {
        $buffer = New-Object byte[] 256
        $count = $stream.Read($buffer, 0, $buffer.Length)
        if ($count -gt 0) {
            $replyHex = (($buffer[0..($count - 1)]) | ForEach-Object { $_.ToString('x2') }) -join ' '
        }
    }

    Write-Output "HBG3 dew command sent: $description"
    Write-Output "TX: $hex"
    if ($replyHex) { Write-Output "RX: $replyHex" }
}
finally {
    if ($null -ne $client) { $client.Dispose() }
}
