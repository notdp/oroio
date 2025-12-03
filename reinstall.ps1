<#
.SYNOPSIS
    Reinstall dk (droid key manager) for Windows
.DESCRIPTION
    Uninstalls and reinstalls dk to update to latest version
.EXAMPLE
    irm https://raw.githubusercontent.com/notdp/oroio/main/reinstall.ps1 | iex
#>

$ErrorActionPreference = "Stop"

Write-Host "Reinstalling dk..." -ForegroundColor Cyan
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$tempDir = Join-Path $env:TEMP "oroio-reinstall-$ts"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # Download scripts
    $uninstallScript = Join-Path $tempDir "uninstall.ps1"
    $installScript = Join-Path $tempDir "install.ps1"
    
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notdp/oroio/main/uninstall.ps1?ts=$ts" -OutFile $uninstallScript -UseBasicParsing
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notdp/oroio/main/install.ps1?ts=$ts" -OutFile $installScript -UseBasicParsing
    
    # Uninstall (force, keep data)
    Write-Host "Uninstalling old version..." -ForegroundColor Cyan
    & $uninstallScript -Force
    
    # Install
    Write-Host "Installing new version..." -ForegroundColor Cyan
    & $installScript
}
finally {
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
