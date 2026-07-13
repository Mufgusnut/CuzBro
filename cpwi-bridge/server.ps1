param([string]$DriverId = "")
$ErrorActionPreference = "Stop"
$script:Telescope = $null
$script:StartedAt = Get-Date
$script:Version = "2.1.0"

function Load-DotEnv {
  $path = Join-Path $PSScriptRoot ".env"
  if (-not (Test-Path $path)) { throw "Missing .env. Copy .env.example to .env and add Supabase credentials." }
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $parts = $line -split '=',2
    if ($parts.Count -eq 2) { [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process') }
  }
}
Load-DotEnv
if (-not $DriverId) { $DriverId = $env:DRIVER_ID }
if (-not $DriverId) { $DriverId = "ASCOM.CPWI.Telescope" }
$SupabaseUrl = $env:SUPABASE_URL.TrimEnd('/')
$ServiceKey = $env:SUPABASE_SERVICE_ROLE_KEY
$Station = if ($env:STATION) { $env:STATION } else { 'eliot' }
$PollSeconds = if ($env:POLL_SECONDS) { [Math]::Max(1,[int]$env:POLL_SECONDS) } else { 3 }
if (-not $SupabaseUrl -or -not $ServiceKey) { throw "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env" }
# New Supabase sb_secret_* keys authenticate through the apikey header.
# Legacy service_role JWT keys (eyJ...) also require Authorization: Bearer.
$Headers = @{ apikey=$ServiceKey; Prefer='return=representation'; 'Content-Type'='application/json' }
if ($ServiceKey.StartsWith('eyJ')) {
  $Headers['Authorization'] = "Bearer $ServiceKey"
}

function Safe-Get([scriptblock]$getter) { try { & $getter } catch { $null } }
function Ensure-Telescope { if ($null -eq $script:Telescope) { $script:Telescope = New-Object -ComObject $DriverId }; $script:Telescope }
function Get-Status {
  $warnings=@(); $scope=$null
  try { $scope=Ensure-Telescope } catch { $warnings += "ASCOM driver unavailable: $($_.Exception.Message)" }
  $connected=$false; if ($scope) { $connected=[bool](Safe-Get { $scope.Connected }) }
  [ordered]@{ ok=$true; bridge=[ordered]@{host=$env:COMPUTERNAME;version="CPWI BRIDGE $script:Version";driverId=$DriverId;startedAt=$script:StartedAt.ToUniversalTime().ToString('o')}; cpwi=[ordered]@{
    driver=$DriverId; connected=$connected; tracking=if($connected){Safe-Get{[bool]$scope.Tracking}}else{$null}; slewing=if($connected){Safe-Get{[bool]$scope.Slewing}}else{$null}; parked=if($connected){Safe-Get{[bool]$scope.AtPark}}else{$null}; atHome=if($connected){Safe-Get{[bool]$scope.AtHome}}else{$null}; rightAscensionHours=if($connected){Safe-Get{[double]$scope.RightAscension}}else{$null}; declinationDegrees=if($connected){Safe-Get{[double]$scope.Declination}}else{$null}; altitudeDegrees=if($connected){Safe-Get{[double]$scope.Altitude}}else{$null}; azimuthDegrees=if($connected){Safe-Get{[double]$scope.Azimuth}}else{$null}; siderealTimeHours=if($connected){Safe-Get{[double]$scope.SiderealTime}}else{$null}; siteLatitude=if($connected){Safe-Get{[double]$scope.SiteLatitude}}else{$null}; siteLongitude=if($connected){Safe-Get{[double]$scope.SiteLongitude}}else{$null}; canPark=if($scope){Safe-Get{[bool]$scope.CanPark}}else{$null}; canUnpark=if($scope){Safe-Get{[bool]$scope.CanUnpark}}else{$null}; canSetTracking=if($scope){Safe-Get{[bool]$scope.CanSetTracking}}else{$null}; canSlew=if($scope){Safe-Get{[bool]$scope.CanSlew}}else{$null}
  }; warnings=$warnings }
}
function Invoke-Control([string]$action, $arguments=$null) {
  $scope=Ensure-Telescope
  switch($action){
    'connect'{$scope.Connected=$true}; 'disconnect'{$scope.Connected=$false};
    'trackingOn'{if(-not $scope.Connected){throw 'Mount is not connected.'};$scope.Tracking=$true};
    'trackingOff'{if(-not $scope.Connected){throw 'Mount is not connected.'};$scope.Tracking=$false};
    'park'{if(-not $scope.Connected){throw 'Mount is not connected.'};$scope.Park()};
    'unpark'{if(-not $scope.Connected){throw 'Mount is not connected.'};if(-not $scope.CanUnpark){throw 'The CPWI driver does not support Unpark.'};$scope.Unpark()};
    'abortSlew'{if(-not $scope.Connected){throw 'Mount is not connected.'};$scope.AbortSlew()};
    'slewRaDec'{
      if(-not $scope.Connected){throw 'Mount is not connected.'}
      if([bool](Safe-Get{$scope.AtPark})){throw 'Mount is parked. Unpark it before slewing.'}
      if(-not [bool](Safe-Get{$scope.CanSlew})){throw 'The CPWI driver does not support equatorial slewing.'}
      if($null -eq $arguments){throw 'Slew coordinates were not supplied.'}
      $ra=[double]$arguments.rightAscensionHours; $dec=[double]$arguments.declinationDegrees
      if($ra -lt 0 -or $ra -ge 24){throw 'Right ascension must be between 0 and less than 24 hours.'}
      if($dec -lt -90 -or $dec -gt 90){throw 'Declination must be between -90 and +90 degrees.'}
      $scope.SlewToCoordinatesAsync($ra,$dec)
    };
    default{throw "Unknown control action: $action"}
  }
  Start-Sleep -Milliseconds 250
  Get-Status
}
function Invoke-Supa([string]$Method,[string]$Path,$Body=$null,[hashtable]$ExtraHeaders=@{}) {
  $h=@{}+$Headers; foreach($k in $ExtraHeaders.Keys){$h[$k]=$ExtraHeaders[$k]}
  $params=@{Method=$Method;Uri="$SupabaseUrl/rest/v1/$Path";Headers=$h;UserAgent="CuzBro-CPWI-Bridge/$script:Version"}
  if($null -ne $Body){$params.Body=($Body|ConvertTo-Json -Depth 12 -Compress)}
  Invoke-RestMethod @params
}
function Publish-Status($payload,$online=$true,$lastError=$null){
  $body=@{station=$Station;updated_at=(Get-Date).ToUniversalTime().ToString('o');online=$online;payload=$payload;last_error=$lastError}
  Invoke-Supa POST "cpwi_status?on_conflict=station" $body @{Prefer='resolution=merge-duplicates,return=minimal'} | Out-Null
}
function Process-Commands {
  $items=Invoke-Supa GET "cpwi_commands?station=eq.$Station&status=eq.pending&order=requested_at.asc&limit=5"
  foreach($cmd in @($items)){
    try {
      Invoke-Supa PATCH "cpwi_commands?id=eq.$($cmd.id)&status=eq.pending" @{status='processing';started_at=(Get-Date).ToUniversalTime().ToString('o')} @{Prefer='return=minimal'}|Out-Null
      $result=Invoke-Control ([string]$cmd.action) $cmd.arguments
      Invoke-Supa PATCH "cpwi_commands?id=eq.$($cmd.id)" @{status='completed';completed_at=(Get-Date).ToUniversalTime().ToString('o');result=$result;error=$null} @{Prefer='return=minimal'}|Out-Null
      Write-Host "COMMAND COMPLETE | $($cmd.action)" -ForegroundColor Green
    } catch {
      Invoke-Supa PATCH "cpwi_commands?id=eq.$($cmd.id)" @{status='failed';completed_at=(Get-Date).ToUniversalTime().ToString('o');error=$_.Exception.Message} @{Prefer='return=minimal'}|Out-Null
      Write-Host "COMMAND FAILED | $($cmd.action) | $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}
Write-Host "CUZBRO CPWI / ASCOM SUPABASE BRIDGE ONLINE" -ForegroundColor Green
Write-Host "Driver: $DriverId"; Write-Host "Station: $Station"; Write-Host "Polling every $PollSeconds seconds"; Write-Host "Press Ctrl+C to stop."
try {
  while($true){
    try {
      Process-Commands
      $status=Get-Status
      Publish-Status $status $true $null
      $c=$status.cpwi
      Write-Host "$(Get-Date -Format o) CPWI ONLINE | CONNECTED $($c.connected) | TRACKING $($c.tracking) | RA $($c.rightAscensionHours) | DEC $($c.declinationDegrees)"
    } catch {
      try { Publish-Status $null $false $_.Exception.Message } catch {}
      Write-Host "$(Get-Date -Format o) BRIDGE ERROR | $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Seconds $PollSeconds
  }
} finally {
  try { if($script:Telescope){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Telescope)} } catch {}
}
