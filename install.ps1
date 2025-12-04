<#
.SYNOPSIS
    Install dk (droid key manager) for Windows
.DESCRIPTION
    Downloads and installs dk.ps1 to %LOCALAPPDATA%\oroio\bin
    Adds to PATH and configures PowerShell profile
.EXAMPLE
    irm https://raw.githubusercontent.com/notdp/oroio/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$INSTALL_DIR = Join-Path $env:LOCALAPPDATA "oroio\bin"
$OROIO_DIR = Join-Path $env:USERPROFILE ".oroio"
$DK_URL = "https://raw.githubusercontent.com/notdp/oroio/main/bin/dk.ps1"

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

# Create directories
Write-Info "Creating directories..."
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}
if (-not (Test-Path $OROIO_DIR)) {
    New-Item -ItemType Directory -Path $OROIO_DIR -Force | Out-Null
}

# Download dk.ps1
Write-Info "Downloading dk.ps1..."
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$dkPath = Join-Path $INSTALL_DIR "dk.ps1"
Invoke-WebRequest -Uri "$DK_URL`?ts=$ts" -OutFile $dkPath -UseBasicParsing

# Normalize encoding to UTF-8 with BOM for PowerShell 5 compatibility
$dkContent = Get-Content $dkPath -Raw -Encoding UTF8
Set-Content -Path $dkPath -Value $dkContent -Encoding UTF8

# Add to PATH if not already
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$INSTALL_DIR*") {
    Write-Info "Adding to PATH..."
    $newPath = "$INSTALL_DIR;$userPath"
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    $env:PATH = "$INSTALL_DIR;$env:PATH"
}

# Configure PowerShell profile
$profileContent = @'

# dk (droid key manager)
function dk { & "$env:LOCALAPPDATA\oroio\bin\dk.ps1" @args }
function droid { dk run droid @args }
# end dk

'@

$profilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path $profilePath)) {
    Write-Info "Creating PowerShell profile..."
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$existingProfile = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
$needsInsert = [string]::IsNullOrWhiteSpace($existingProfile) -or $existingProfile -notlike "*# dk (droid key manager)*"
if ($needsInsert) {
    Write-Info "Configuring PowerShell profile..."
    Add-Content -Path $profilePath -Value $profileContent
}
else {
    Write-Warn "Profile already configured, skipping."
}

# Done
Write-Host ""
Write-Success "Installation complete!"
Write-Host ""
Write-Host "  dk.ps1 installed to: $dkPath"
Write-Host "  Data directory: $OROIO_DIR"
Write-Host ""
Write-Host "To use in current session, run:" -ForegroundColor Yellow
Write-Host "  . `$PROFILE.CurrentUserAllHosts"
Write-Host ""
Write-Host "Or restart your terminal."
Write-Host ""
Write-Host "Quick start:" -ForegroundColor Cyan
Write-Host "  dk add <your-api-key>"
Write-Host "  dk list"
Write-Host "  droid `"your prompt`""
Write-Host ""
