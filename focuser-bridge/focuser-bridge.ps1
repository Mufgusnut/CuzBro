param(
  [string]$Station = $(if ($env:FOCUSER_STATION) { $env:FOCUSER_STATION } else { 'eliot' }),
  [string]$ProgId = $(if ($env:FOCUSER_PROGID) { $env:FOCUSER_PROGID } else { 'ASCOM.Celestron.Focuser' }),
  [int]$PollMilliseconds = 1000
)

$ErrorActionPreference = 'Stop'
$SupabaseUrl = $env:SUPABASE_URL
$ServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $SupabaseUrl -or -not $ServiceKey) {
  throw 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the focuser bridge.'
}

$Headers = @{
  apikey         = $ServiceKey
  Accept         = 'application/json'
  'Content-Type' = 'application/json'
  Prefer         = 'return=representation'
}

$script:Focuser = $null
$script:LastError = $null

function Invoke-Supabase {
  param([string]$Method, [string]$Path, $Body = $null, [hashtable]$ExtraHeaders = @{})
  $headers = @{} + $Headers
  foreach ($key in $ExtraHeaders.Keys) { $headers[$key] = $ExtraHeaders[$key] }
  $params = @{
  Method    = $Method
  Uri       = "$SupabaseUrl/rest/v1/$Path"
  Headers   = $headers
  UserAgent = 'CuzBro-Focuser-Bridge/1.0'
}
  if ($null -ne $Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) }
  Invoke-RestMethod @params
}

function Get-SafeProperty {
  param($Object, [string]$Name, $Fallback = $null)
  try { return $Object.$Name } catch { return $Fallback }
}

function New-Focuser {
  if ($script:Focuser) { return $script:Focuser }
  try {
    $script:Focuser = New-Object -ComObject $ProgId
  } catch {
    throw "Unable to create ASCOM focuser '$ProgId'. Confirm the Celestron focuser ASCOM driver is installed and set FOCUSER_PROGID if its ProgID differs. $($_.Exception.Message)"
  }
  return $script:Focuser
}

function Set-Connected([bool]$Connected) {
  $f = New-Focuser
  $f.Connected = $Connected
  Start-Sleep -Milliseconds 200
}

function Get-FocuserPayload {
  $f = New-Focuser
  $connected = [bool](Get-SafeProperty $f 'Connected' $false)
  $payload = [ordered]@{
    connected = $connected
    driver = $ProgId
    name = Get-SafeProperty $f 'Name' 'Celestron Auto Focuser'
    description = Get-SafeProperty $f 'Description' $null
    position = $null
    isMoving = $false
    maxStep = $null
    maxIncrement = $null
    stepSizeMicrons = $null
    temperatureC = $null
    absolute = $null
    tempCompAvailable = $null
    tempComp = $null
  }
  if ($connected) {
    $payload.position = Get-SafeProperty $f 'Position' $null
    $payload.isMoving = [bool](Get-SafeProperty $f 'IsMoving' $false)
    $payload.maxStep = Get-SafeProperty $f 'MaxStep' $null
    $payload.maxIncrement = Get-SafeProperty $f 'MaxIncrement' $null
    $payload.stepSizeMicrons = Get-SafeProperty $f 'StepSize' $null
    $payload.temperatureC = Get-SafeProperty $f 'Temperature' $null
    $payload.absolute = Get-SafeProperty $f 'Absolute' $null
    $payload.tempCompAvailable = Get-SafeProperty $f 'TempCompAvailable' $null
    $payload.tempComp = Get-SafeProperty $f 'TempComp' $null
  }
  return $payload
}

function Publish-Status {
  param([bool]$Online = $true, [string]$ErrorMessage = $null)
  try { $payload = Get-FocuserPayload } catch { $payload = @{ connected = $false; driver = $ProgId }; $Online = $false; $ErrorMessage = $_.Exception.Message }
  $row = @{ station = $Station; updated_at = (Get-Date).ToUniversalTime().ToString('o'); online = $Online; payload = $payload; last_error = $ErrorMessage }
  Invoke-Supabase -Method Post -Path 'focuser_status?on_conflict=station' -Body $row -ExtraHeaders @{ Prefer = 'resolution=merge-duplicates,return=minimal' } | Out-Null
}

function Complete-Command {
  param([string]$Id, [bool]$Success, $Result = $null, [string]$ErrorMessage = $null)
  $body = @{ status = $(if ($Success) { 'completed' } else { 'failed' }); completed_at = (Get-Date).ToUniversalTime().ToString('o'); result = $Result; error = $ErrorMessage }
  Invoke-Supabase -Method Patch -Path "focuser_commands?id=eq.$Id" -Body $body -ExtraHeaders @{ Prefer = 'return=minimal' } | Out-Null
}

function Process-Command($Command) {
  $id = $Command.id
  Invoke-Supabase -Method Patch -Path "focuser_commands?id=eq.$id&status=eq.queued" -Body @{ status='processing'; started_at=(Get-Date).ToUniversalTime().ToString('o') } -ExtraHeaders @{ Prefer='return=minimal' } | Out-Null
  try {
    $args = $Command.arguments
    switch ($Command.action) {
      'connect' { Set-Connected $true; $result = @{ message='FOCUSER CONNECTED' } }
      'disconnect' { Set-Connected $false; $result = @{ message='FOCUSER DISCONNECTED' } }
      'halt' { $f = New-Focuser; if (-not $f.Connected) { throw 'Focuser is not connected.' }; $f.Halt(); $result = @{ message='FOCUSER HALTED' } }
      'moveAbsolute' {
        $f = New-Focuser; if (-not $f.Connected) { throw 'Focuser is not connected.' }
        $target = [int]$args.position
        $max = [int](Get-SafeProperty $f 'MaxStep' 0)
        if ($target -lt 0 -or ($max -gt 0 -and $target -gt $max)) { throw "Target position $target is outside the 0-$max travel range." }
        $f.Move($target); $result = @{ message="MOVING TO POSITION $target"; target=$target }
      }
      'moveRelative' {
        $f = New-Focuser; if (-not $f.Connected) { throw 'Focuser is not connected.' }
        $current = [int]$f.Position; $steps = [int]$args.steps; $target = $current + $steps
        $max = [int](Get-SafeProperty $f 'MaxStep' 0)
        $target = [Math]::Max(0, $target); if ($max -gt 0) { $target = [Math]::Min($max, $target) }
        $f.Move($target); $result = @{ message="MOVING $steps STEPS TO $target"; target=$target; steps=$steps }
      }
      default { throw "Unsupported focuser action '$($Command.action)'." }
    }
    Complete-Command -Id $id -Success $true -Result $result
    $script:LastError = $null
  } catch {
    $script:LastError = $_.Exception.Message
    Complete-Command -Id $id -Success $false -ErrorMessage $script:LastError
  }
}

Write-Host "CuzBro Celestron focuser bridge starting // station=$Station // ProgID=$ProgId"
try { New-Focuser | Out-Null } catch { $script:LastError = $_.Exception.Message; Write-Warning $script:LastError }

while ($true) {
  try {
    $commands = Invoke-Supabase -Method Get -Path "focuser_commands?station=eq.$Station&status=eq.queued&order=requested_at.asc&limit=5"
    foreach ($command in @($commands)) { Process-Command $command }
    Publish-Status -Online $true -ErrorMessage $script:LastError
  } catch {
    $script:LastError = $_.Exception.Message
    Write-Warning $script:LastError
    try { Publish-Status -Online $false -ErrorMessage $script:LastError } catch {}
  }
  Start-Sleep -Milliseconds $PollMilliseconds
}
