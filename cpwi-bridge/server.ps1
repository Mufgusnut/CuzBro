param(
  [string]$DriverId = "ASCOM.CPWI.Telescope",
  [int]$Port = 4788
)

$ErrorActionPreference = "Stop"
$script:Telescope = $null
$script:StartedAt = Get-Date
$script:Version = "1.0.0"

function Add-CorsHeaders($response) {
  $response.Headers.Add("Access-Control-Allow-Origin", "*")
  $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $response.Headers.Add("Cache-Control", "no-store")
}

function Write-Json($context, $statusCode, $payload) {
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $context.Response.StatusCode = $statusCode
  $context.Response.ContentType = "application/json; charset=utf-8"
  Add-CorsHeaders $context.Response
  $context.Response.ContentLength64 = $bytes.Length
  $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $context.Response.Close()
}

function Safe-Get([scriptblock]$getter) {
  try { return & $getter } catch { return $null }
}

function Ensure-Telescope {
  if ($null -eq $script:Telescope) {
    $script:Telescope = New-Object -ComObject $DriverId
  }
  return $script:Telescope
}

function Get-Status {
  $warnings = @()
  $scope = $null
  try { $scope = Ensure-Telescope } catch { $warnings += "ASCOM driver unavailable: $($_.Exception.Message)" }

  $connected = $false
  if ($scope) { $connected = [bool](Safe-Get { $scope.Connected }) }

  [ordered]@{
    ok = $true
    bridge = [ordered]@{
      host = $env:COMPUTERNAME
      version = "CPWI BRIDGE $script:Version"
      driverId = $DriverId
      startedAt = $script:StartedAt.ToUniversalTime().ToString("o")
    }
    cpwi = [ordered]@{
      driver = $DriverId
      connected = $connected
      tracking = if ($connected) { Safe-Get { [bool]$scope.Tracking } } else { $null }
      slewing = if ($connected) { Safe-Get { [bool]$scope.Slewing } } else { $null }
      parked = if ($connected) { Safe-Get { [bool]$scope.AtPark } } else { $null }
      atHome = if ($connected) { Safe-Get { [bool]$scope.AtHome } } else { $null }
      rightAscensionHours = if ($connected) { Safe-Get { [double]$scope.RightAscension } } else { $null }
      declinationDegrees = if ($connected) { Safe-Get { [double]$scope.Declination } } else { $null }
      altitudeDegrees = if ($connected) { Safe-Get { [double]$scope.Altitude } } else { $null }
      azimuthDegrees = if ($connected) { Safe-Get { [double]$scope.Azimuth } } else { $null }
      siderealTimeHours = if ($connected) { Safe-Get { [double]$scope.SiderealTime } } else { $null }
      siteLatitude = if ($connected) { Safe-Get { [double]$scope.SiteLatitude } } else { $null }
      siteLongitude = if ($connected) { Safe-Get { [double]$scope.SiteLongitude } } else { $null }
      canPark = if ($scope) { Safe-Get { [bool]$scope.CanPark } } else { $null }
      canUnpark = if ($scope) { Safe-Get { [bool]$scope.CanUnpark } } else { $null }
      canSetTracking = if ($scope) { Safe-Get { [bool]$scope.CanSetTracking } } else { $null }
      canSlew = if ($scope) { Safe-Get { [bool]$scope.CanSlew } } else { $null }
    }
    warnings = $warnings
  }
}

function Invoke-Control($body) {
  $scope = Ensure-Telescope
  $action = [string]$body.action

  switch ($action) {
    "connect" { $scope.Connected = $true }
    "disconnect" { $scope.Connected = $false }
    "trackingOn" { if (-not $scope.Connected) { throw "Mount is not connected." }; $scope.Tracking = $true }
    "trackingOff" { if (-not $scope.Connected) { throw "Mount is not connected." }; $scope.Tracking = $false }
    "park" { if (-not $scope.Connected) { throw "Mount is not connected." }; $scope.Park() }
    "unpark" { if (-not $scope.Connected) { throw "Mount is not connected." }; $scope.Unpark() }
    "abortSlew" { if (-not $scope.Connected) { throw "Mount is not connected." }; $scope.AbortSlew() }
    default { throw "Unknown control action: $action" }
  }

  Start-Sleep -Milliseconds 250
  return Get-Status
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "CUZBRO CPWI / ASCOM BRIDGE ONLINE" -ForegroundColor Green
Write-Host "Driver: $DriverId"
Write-Host "API:    http://127.0.0.1:$Port/status"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      if ($context.Request.HttpMethod -eq "OPTIONS") {
        Add-CorsHeaders $context.Response
        $context.Response.StatusCode = 204
        $context.Response.Close()
        continue
      }

      $path = $context.Request.Url.AbsolutePath.TrimEnd('/')
      if ($context.Request.HttpMethod -eq "GET" -and ($path -eq "" -or $path -eq "/status")) {
        Write-Json $context 200 (Get-Status)
        continue
      }

      if ($context.Request.HttpMethod -eq "POST" -and $path -eq "/control") {
        $reader = New-Object IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
        $raw = $reader.ReadToEnd()
        $reader.Dispose()
        $body = if ($raw) { $raw | ConvertFrom-Json } else { [pscustomobject]@{} }
        Write-Json $context 200 (Invoke-Control $body)
        continue
      }

      Write-Json $context 404 @{ ok = $false; error = "Not found" }
    } catch {
      Write-Json $context 500 @{ ok = $false; error = $_.Exception.Message }
    }
  }
} finally {
  try { if ($script:Telescope) { $script:Telescope.Connected = $false } } catch {}
  try { if ($script:Telescope) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($script:Telescope) } } catch {}
  $listener.Stop()
  $listener.Close()
}
