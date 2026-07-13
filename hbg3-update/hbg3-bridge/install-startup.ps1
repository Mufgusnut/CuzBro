$ErrorActionPreference = 'Stop'
$bridgeDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$batchFile = Join-Path $bridgeDirectory 'start-hbg3-bridge.bat'
$startupDirectory = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDirectory 'CuzBro HBG3 Bridge.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batchFile
$shortcut.WorkingDirectory = $bridgeDirectory
$shortcut.WindowStyle = 7
$shortcut.Save()

Write-Host "Startup shortcut installed: $shortcutPath" -ForegroundColor Green
