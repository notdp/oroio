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

# Download serve.py (for dk serve)
$serveUrl = "https://raw.githubusercontent.com/notdp/oroio/main/bin/serve.py"
$servePath = Join-Path $INSTALL_DIR "serve.py"
Invoke-WebRequest -Uri "$serveUrl`?ts=$ts" -OutFile $servePath -UseBasicParsing

# Prepare web dashboard assets to $OROIO_DIR\web
Write-Info "Preparing web dashboard assets..."
$webDst = Join-Path $OROIO_DIR "web"
if (-not (Test-Path $webDst)) { New-Item -ItemType Directory -Path $webDst -Force | Out-Null }

$webBase = "https://github.com/notdp/oroio/releases/download/web-dist"
try {
    Invoke-WebRequest -Uri "$webBase/index.html`?ts=$ts" -OutFile (Join-Path $webDst "index.html") -UseBasicParsing
}
catch {
    Write-Warn "Failed to download web assets: $($_.Exception.Message)"
}

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
function droid {
    $droidCmd = Get-Command droid -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $droidCmd) {
        Write-Host "未找到 droid 可执行文件，请先安装 Factory droid CLI（仍尝试调用 droid，安装后请重开终端）。" -ForegroundColor Yellow
        dk run droid @args
        return
    }
    dk run $($droidCmd.Source) @args
}
# end dk

'@

$profilePath = $PROFILE.CurrentUserAllHosts
if (-not (Test-Path $profilePath)) {
    Write-Info "Creating PowerShell profile..."
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$existingProfile = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
$blockPattern = "(?s)# dk \(droid key manager\).*?# end dk\r?\n?"
if ($existingProfile -match $blockPattern) {
    Write-Info "Updating existing dk profile block..."
    $updatedProfile = [regex]::Replace($existingProfile, $blockPattern, "$profileContent`n")
    Set-Content -Path $profilePath -Value $updatedProfile -NoNewline
}
else {
    Write-Info "Configuring PowerShell profile..."
    Add-Content -Path $profilePath -Value $profileContent
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
