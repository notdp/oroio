<#
.SYNOPSIS
    droid key manager: 管理 Factory droid API keys、查询用量、自动轮换
.DESCRIPTION
    PowerShell version of dk for Windows users
#>

# 手动解析参数以允许子命令使用短横参数（如: dk run node -e "..."）
$Command = ""
$Arguments = @()
if ($args.Count -ge 1) {
    $Command = $args[0]
    if ($args.Count -gt 1) {
        $Arguments = $args[1..($args.Count - 1)]
    }
}

$ErrorActionPreference = "Stop"

# Configuration
$script:OROIO_DIR = Join-Path $env:USERPROFILE ".oroio"
$script:KEYS_FILE = Join-Path $script:OROIO_DIR "keys.enc"
$script:CURRENT_FILE = Join-Path $script:OROIO_DIR "current"
$script:CACHE_FILE = Join-Path $script:OROIO_DIR "list_cache.b64"
$script:WEB_DIR = Join-Path $script:OROIO_DIR "web"
$script:DK_PATH = if ($PSCommandPath) { $PSCommandPath } elseif ($MyInvocation.MyCommand.Path) { $MyInvocation.MyCommand.Path } else { $null }
$script:DK_DIR = if ($script:DK_PATH) { Split-Path $script:DK_PATH -Parent } else { $null }
$script:SALT = "oroio"
$script:CACHE_TTL = 30
$script:CURL_TIMEOUT = 4

function Show-Usage {
    Write-Host @"
Usage: dk <command> [args]
Commands:
  add <key...>           add keys (or -File <path>)
  list                   list keys with balance/expiry
  current                show current key + export + clipboard
  use [index]            switch key (interactive if no index)
  serve [start|stop|status]  web dashboard (default: start, port 7758)
  run <cmd...>           run with key (auto-rotate on zero balance)
  rm <index...>          remove keys
  reinstall              update to latest version
  uninstall              remove dk
  help                   show this help
"@
}

function Write-ErrorExit {
    param([string]$Message)
    Write-Host "错误: $Message" -ForegroundColor Red
    exit 1
}

function Ensure-Store {
    if (-not (Test-Path $script:OROIO_DIR)) {
        New-Item -ItemType Directory -Path $script:OROIO_DIR -Force | Out-Null
    }
    if (-not (Test-Path $script:KEYS_FILE)) {
        New-Item -ItemType File -Path $script:KEYS_FILE -Force | Out-Null
    }
    if (-not (Test-Path $script:CURRENT_FILE) -or (Get-Content $script:CURRENT_FILE -ErrorAction SilentlyContinue) -eq "") {
        Set-Content -Path $script:CURRENT_FILE -Value "1" -NoNewline
    }
}

function Derive-KeyAndIV {
    param([byte[]]$Salt)
    
    $iterations = 10000
    $keyLength = 32
    $ivLength = 16
    
    $derive = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
        $script:SALT,
        $Salt,
        $iterations,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256
    )
    
    $key = $derive.GetBytes($keyLength)
    $iv = $derive.GetBytes($ivLength)
    $derive.Dispose()
    
    return @{ Key = $key; IV = $iv }
}

function Decrypt-Keys {
    if (-not (Test-Path $script:KEYS_FILE) -or (Get-Item $script:KEYS_FILE).Length -eq 0) {
        return @()
    }
    
    $data = [System.IO.File]::ReadAllBytes($script:KEYS_FILE)
    if ($data.Length -lt 17) {
        return @()
    }
    
    $header = [System.Text.Encoding]::ASCII.GetString($data[0..7])
    if ($header -ne "Salted__") {
        Write-ErrorExit "无效的加密文件格式"
    }
    
    $salt = $data[8..15]
    $ciphertext = $data[16..($data.Length - 1)]
    
    $derived = Derive-KeyAndIV -Salt $salt
    
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $derived.Key
    $aes.IV = $derived.IV
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    
    try {
        $decryptor = $aes.CreateDecryptor()
        $decrypted = $decryptor.TransformFinalBlock($ciphertext, 0, $ciphertext.Length)
        $text = [System.Text.Encoding]::UTF8.GetString($decrypted)
        
        $keys = $text -split "`n" | Where-Object { $_.Trim() } | ForEach-Object {
            ($_ -split "`t")[0]
        }
        
        return @($keys)
    }
    catch {
        return @()
    }
    finally {
        $aes.Dispose()
    }
}

function Encrypt-Keys {
    param([string[]]$Keys)
    
    $salt = [byte[]]::new(8)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($salt)
    
    $derived = Derive-KeyAndIV -Salt $salt
    
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.Key = $derived.Key
    $aes.IV = $derived.IV
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    
    try {
        $text = ($Keys | ForEach-Object { "$_`t" }) -join "`n"
        $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($text)
        
        $encryptor = $aes.CreateEncryptor()
        $encrypted = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
        
        $header = [System.Text.Encoding]::ASCII.GetBytes("Salted__")
        $result = [byte[]]::new($header.Length + $salt.Length + $encrypted.Length)
        [Array]::Copy($header, 0, $result, 0, $header.Length)
        [Array]::Copy($salt, 0, $result, $header.Length, $salt.Length)
        [Array]::Copy($encrypted, 0, $result, $header.Length + $salt.Length, $encrypted.Length)
        
        return $result
    }
    finally {
        $aes.Dispose()
    }
}

function Save-Keys {
    param([string[]]$Keys)
    
    Ensure-Store
    $encrypted = Encrypt-Keys -Keys $Keys
    [System.IO.File]::WriteAllBytes($script:KEYS_FILE, $encrypted)
    Invalidate-Cache
}

function Get-Python {
    foreach ($name in @("python3", "python")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Path }
    }
    Write-ErrorExit "未找到 python3，请先安装 https://www.python.org/downloads/"
}

function Get-PortProcess {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction Stop | Select-Object -First 1
        if ($conn) { return $conn.OwningProcess }
    } catch { }
    try {
        $line = netstat -ano -p tcp | Select-String "LISTENING" | Where-Object { $_ -match "[:.]$Port\s" } | Select-Object -First 1
        if ($line) {
            $parts = ($line.ToString().Trim() -split "\s+")
            if ($parts.Length -gt 0) { return [int]$parts[-1] }
        }
    } catch { }
    return $null
}

function Ensure-WebAssets {
    param([string]$WebDir)
    
    $indexPath = Join-Path $WebDir "index.html"
    if (Test-Path $indexPath) { return }
    
    Write-Host "正在下载 web 控制台静态文件..."
    $base = "https://github.com/notdp/oroio/releases/download/web-dist"
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $tmp = Join-Path $env:TEMP "oroio-web-$ts"
    try {
        New-Item -ItemType Directory -Path $tmp -Force | Out-Null
        $assetsDir = Join-Path $tmp "assets"
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
        
        Invoke-WebRequest -Uri "$base/index.html?ts=$ts" -OutFile (Join-Path $tmp "index.html") -UseBasicParsing
        Invoke-WebRequest -Uri "$base/index.js?ts=$ts" -OutFile (Join-Path $assetsDir "index.js") -UseBasicParsing
        Invoke-WebRequest -Uri "$base/index.css?ts=$ts" -OutFile (Join-Path $assetsDir "index.css") -UseBasicParsing
        
        if (-not (Test-Path $WebDir)) { New-Item -ItemType Directory -Path $WebDir -Force | Out-Null }
        Copy-Item -Path (Join-Path $tmp "*") -Destination $WebDir -Recurse -Force
        Write-Host "web 静态资源已就绪。"
    }
    catch {
        Write-ErrorExit "下载 web 资源失败: $($_.Exception.Message)"
    }
    finally {
        Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Get-CurrentIndex {
    try {
        $content = Get-Content $script:CURRENT_FILE -ErrorAction SilentlyContinue
        $idx = [int]$content
        if ($idx -lt 1) { $idx = 1 }
        return $idx
    }
    catch {
        return 1
    }
}

function Set-CurrentIndex {
    param([int]$Index)
    Set-Content -Path $script:CURRENT_FILE -Value $Index -NoNewline
}

function Mask-Key {
    param([string]$Key)
    
    if ($Key.Length -le 10) {
        return $Key.Substring(0, [Math]::Min(3, $Key.Length)) + "***"
    }
    
    $prefix = $Key.Substring(0, 6).PadRight(6, 'x')
    $suffix = $Key.Substring($Key.Length - 4)
    return "$prefix...$suffix"
}

function Invalidate-Cache {
    if (Test-Path $script:CACHE_FILE) {
        Remove-Item $script:CACHE_FILE -Force -ErrorAction SilentlyContinue
    }
}

function Fetch-Usage {
    param([string]$Key)
    
    $result = @{
        BALANCE = 0
        BALANCE_NUM = 0
        TOTAL = 0
        USED = 0
        EXPIRES = "?"
        RAW = ""
    }
    
    try {
        $headers = @{
            "Authorization" = "Bearer $Key"
            "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        $response = Invoke-RestMethod -Uri "https://app.factory.ai/api/organization/members/chat-usage" `
            -Headers $headers -Method Get -TimeoutSec $script:CURL_TIMEOUT -ErrorAction Stop
        
        $usage = $response.usage
        if ($null -eq $usage) {
            $result.RAW = "no_usage"
            return $result
        }
        
        $section = $null
        foreach ($s in @($usage.standard, $usage.premium, $usage.total, $usage.main)) {
            if ($null -ne $s) {
                $section = $s
                break
            }
        }
        
        if ($null -ne $section) {
            $total = $section.totalAllowance
            if ($null -eq $total) { $total = $section.basicAllowance }
            if ($null -eq $total) { $total = $section.allowance }
            
            $used = $section.orgTotalTokensUsed
            if ($null -eq $used) { $used = $section.used }
            if ($null -eq $used) { $used = $section.tokensUsed }
            if ($null -eq $used) { $used = 0 }
            
            $overage = $section.orgOverageUsed
            if ($null -eq $overage) { $overage = 0 }
            $used = $used + $overage
            
            if ($null -ne $total) {
                $result.TOTAL = [long]$total
                $result.USED = [long]$used
                $result.BALANCE_NUM = [long]($total - $used)
                $result.BALANCE = $result.BALANCE_NUM
            }
        }
        
        $expRaw = $usage.endDate
        if ($null -eq $expRaw) { $expRaw = $usage.expire_at }
        if ($null -eq $expRaw) { $expRaw = $usage.expires_at }
        
        if ($null -ne $expRaw) {
            try {
                if ($expRaw -match '^\d+$') {
                    $ts = [long]$expRaw / 1000
                    $date = [DateTimeOffset]::FromUnixTimeSeconds([long]$ts)
                    $result.EXPIRES = $date.ToString("yyyy-MM-dd")
                }
                else {
                    $result.EXPIRES = $expRaw.ToString()
                }
            }
            catch {
                $result.EXPIRES = $expRaw.ToString()
            }
        }
    }
    catch {
        $result.BALANCE = 0
        $result.BALANCE_NUM = 0
        $result.RAW = "http_error"
        $result.EXPIRES = "Invalid key"
    }
    
    return $result
}

function Format-CompactNumber {
    param([long]$Num)
    
    $abs = [Math]::Abs($Num)
    if ($abs -ge 1e9) { return "{0:N1}B" -f ($Num / 1e9) }
    if ($abs -ge 1e6) { return "{0:N1}M" -f ($Num / 1e6) }
    if ($abs -ge 1e3) { return "{0:N1}k" -f ($Num / 1e3) }
    return $Num.ToString()
}

function Render-Bar {
    param(
        [long]$Remain,
        [long]$Total,
        [int]$Length = 20
    )
    
    if ($Total -le 0) {
        return "[" + ("?" * $Length) + "]"
    }
    
    $used = $Total - $Remain
    if ($used -lt 0) { $used = 0 }
    if ($used -gt $Total) { $used = $Total }
    
    $fill = [Math]::Round(($used / $Total) * $Length)
    $hashes = "#" * $fill
    $dashes = "-" * ($Length - $fill)
    
    return "[$hashes$dashes]"
}

function Cmd-Add {
    param([string[]]$AddArgs)
    
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    $fileMode = $false
    $filePath = ""
    $newKeys = @()
    
    for ($i = 0; $i -lt $AddArgs.Length; $i++) {
        if ($AddArgs[$i] -eq "-File" -or $AddArgs[$i] -eq "-f" -or $AddArgs[$i] -eq "--file") {
            $fileMode = $true
            if ($i + 1 -lt $AddArgs.Length) {
                $filePath = $AddArgs[$i + 1]
                $i++
            }
        }
        else {
            $newKeys += $AddArgs[$i]
        }
    }
    
    if ($fileMode -and $filePath) {
        if (-not (Test-Path $filePath)) {
            Write-ErrorExit "文件不存在: $filePath"
        }
        $lines = Get-Content $filePath
        foreach ($line in $lines) {
            $line = $line -replace '#.*$', ''
            $line = $line.Trim()
            if ($line) {
                $newKeys += $line
            }
        }
    }
    
    if ($newKeys.Length -eq 0) {
        Write-ErrorExit "请提供至少一个key"
    }
    
    $keys = $keys + $newKeys
    Save-Keys -Keys $keys
    
    Write-Host "已添加。当前共有 $($keys.Length) 个key。"
}

function Cmd-List {
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    if ($keys.Length -eq 0) {
        Write-Host "暂无key，使用 'dk add' 添加。"
        return
    }
    
    $currentIdx = Get-CurrentIndex
    
    Write-Host ""
    Write-Host ("  {0,-4} {1,-16} {2,-30} {3,-12}" -f "No", "Key", "Usage", "Expiry")
    Write-Host ("  " + ("-" * 66))
    
    for ($i = 0; $i -lt $keys.Length; $i++) {
        $key = $keys[$i]
        $idx = $i + 1
        $usage = Fetch-Usage -Key $key
        
        $marker = if ($idx -eq $currentIdx) { ">" } else { " " }
        $maskedKey = Mask-Key -Key $key
        
        $bar = Render-Bar -Remain $usage.BALANCE_NUM -Total $usage.TOTAL -Length 10
        $usageText = "{0}/{1}" -f (Format-CompactNumber $usage.USED), (Format-CompactNumber $usage.TOTAL)
        $usageDisplay = "$bar $usageText"
        
        $exp = $usage.EXPIRES
        
        $color = "White"
        if ($usage.RAW -like "http*" -or $usage.BALANCE_NUM -le 0) {
            $color = "Red"
        }
        elseif ($usage.TOTAL -gt 0 -and ($usage.BALANCE_NUM / $usage.TOTAL) -le 0.1) {
            $color = "Red"
        }
        
        if ($idx -eq $currentIdx) {
            Write-Host ("{0} {1,-4} " -f $marker, $idx) -NoNewline -ForegroundColor Cyan
        }
        else {
            Write-Host ("{0} {1,-4} " -f $marker, $idx) -NoNewline
        }
        Write-Host ("{0,-16} {1,-30} {2,-12}" -f $maskedKey, $usageDisplay, $exp) -ForegroundColor $color
    }
    Write-Host ""
}

function Cmd-Current {
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    if ($keys.Length -eq 0) {
        Write-ErrorExit "暂无key，请先添加。"
    }
    
    $idx = Get-CurrentIndex
    if ($idx -gt $keys.Length) { $idx = 1 }
    
    $key = $keys[$idx - 1]
    $usage = Fetch-Usage -Key $key
    
    Write-Host ""
    Write-Host "  No:     $idx"
    Write-Host "  Key:    $key"
    
    $bar = Render-Bar -Remain $usage.BALANCE_NUM -Total $usage.TOTAL -Length 20
    $usageText = "{0}/{1}" -f (Format-CompactNumber $usage.USED), (Format-CompactNumber $usage.TOTAL)
    Write-Host "  Usage:  $bar $usageText"
    Write-Host "  Expiry: $($usage.EXPIRES)"
    Write-Host ""
    
    $exportLine = "`$env:FACTORY_API_KEY=`"$key`""
    Write-Host $exportLine
    
    Set-Clipboard $exportLine
    Write-Host "Copied to clipboard." -ForegroundColor Gray
}

function Cmd-Use {
    param([string[]]$UseArgs)
    
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    if ($keys.Length -eq 0) {
        Write-ErrorExit "暂无key"
    }
    
    if ($UseArgs.Length -eq 0) {
        Write-Host "Select a key (enter number):"
        for ($i = 0; $i -lt $keys.Length; $i++) {
            $maskedKey = Mask-Key -Key $keys[$i]
            Write-Host "  [$($i + 1)] $maskedKey"
        }
        $choice = Read-Host "Enter number (1-$($keys.Length))"
        $idx = [int]$choice
    }
    else {
        $idx = [int]$UseArgs[0]
    }
    
    if ($idx -lt 1 -or $idx -gt $keys.Length) {
        Write-ErrorExit "序号超出范围"
    }
    
    Set-CurrentIndex -Index $idx
    Write-Host "已切换到序号 $idx ($(Mask-Key -Key $keys[$idx - 1]))"
}

function Cmd-Run {
    param([string[]]$RunArgs)
    
    if ($RunArgs.Length -eq 0) {
        Write-ErrorExit "用法: dk run <命令...>"
    }
    
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    if ($keys.Length -eq 0) {
        Write-ErrorExit "暂无key，请先添加。"
    }
    
    $idx = Get-CurrentIndex
    if ($idx -gt $keys.Length) { $idx = 1 }
    
    $key = $keys[$idx - 1]
    
    $env:FACTORY_API_KEY = $key
    
    $cmd = $RunArgs[0]
    $cmdArgs = @()
    if ($RunArgs.Length -gt 1) {
        $cmdArgs = $RunArgs[1..($RunArgs.Length - 1)]
    }
    
    & $cmd @cmdArgs
}

function Cmd-Remove {
    param([string[]]$RmArgs)
    
    if ($RmArgs.Length -eq 0) {
        Write-ErrorExit "用法: dk rm <序号...>"
    }
    
    Ensure-Store
    $keys = @(Decrypt-Keys)
    
    $toRemove = $RmArgs | ForEach-Object { [int]$_ }
    
    $newKeys = @()
    for ($i = 0; $i -lt $keys.Length; $i++) {
        if ($toRemove -notcontains ($i + 1)) {
            $newKeys += $keys[$i]
        }
    }
    
    Save-Keys -Keys $newKeys
    Set-CurrentIndex -Index 1
    
    Write-Host "已删除，剩余 $($newKeys.Length) 个key。"
}

function Cmd-Serve {
    param([string[]]$ServeArgs)
    
    $subcmd = if ($ServeArgs.Length -gt 0) { $ServeArgs[0] } else { "start" }
    $port = if ($env:DKM_SERVE_PORT) { [int]$env:DKM_SERVE_PORT } else { 7758 }
    $webDir = $script:WEB_DIR
    $pidFile = Join-Path $script:OROIO_DIR "serve.pid"
    $logFile = Join-Path $script:OROIO_DIR "serve.log"
    
    $dkPath = $script:DK_PATH
    if (-not $dkPath) { $dkPath = $MyInvocation.MyCommand.Path }
    if (-not $dkPath) { Write-ErrorExit "无法确定 dk.ps1 路径" }
    $dkDir = if ($script:DK_DIR) { $script:DK_DIR } else { Split-Path $dkPath -Parent }
    $serveScript = Join-Path $dkDir "serve.py"
    
    switch ($subcmd) {
        "start" {
            if (-not (Test-Path $serveScript)) { Write-ErrorExit "未找到 serve.py ($serveScript)" }
            Ensure-WebAssets -WebDir $webDir
            
            if (Test-Path $pidFile) {
                $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
                if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
                    Write-Host "服务已在运行 (PID: $oldPid)"
                    Write-Host ("访问: http://localhost:{0}" -f $port)
                    return
                }
                Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
            }
            
            $portProc = Get-PortProcess -Port $port
            if ($portProc) {
                Write-ErrorExit "端口 $port 已被占用 (PID: $portProc)，请释放后重试或设置 DKM_SERVE_PORT"
            }
            
            $python = Get-Python
            $args = @($serveScript, "$port", $webDir, $script:OROIO_DIR, $dkPath)
            $p = Start-Process -FilePath $python -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError $logFile
            Start-Sleep -Milliseconds 300
            if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) {
                Set-Content -Path $pidFile -Value $p.Id -NoNewline
                Write-Host "Web服务已启动 (PID: $($p.Id))"
                Write-Host ("访问: http://localhost:{0}" -f $port)
            }
            else {
                Write-ErrorExit "启动失败，请检查日志: $logFile"
            }
        }
        "stop" {
            if (-not (Test-Path $pidFile)) { Write-Host "服务未运行"; return }
            $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
            if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "服务已停止 (PID: $pid)"
            }
            else {
                Write-Host "服务未运行（已清理旧PID文件）"
            }
            Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        }
        "status" {
            if (Test-Path $pidFile) {
                $pid = Get-Content $pidFile -ErrorAction SilentlyContinue
                if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
                    Write-Host "服务运行中 (PID: $pid)"
                    Write-Host ("访问: http://localhost:{0}" -f $port)
                    return
                }
            }
            Write-Host "服务未运行"
        }
        default {
            Write-ErrorExit "用法: dk serve [start|stop|status]"
        }
    }
}

function Cmd-Reinstall {
    Write-Host "正在重新安装 dk..."
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notdp/oroio/main/install.ps1?ts=$ts" -UseBasicParsing).Content
}

function Cmd-Uninstall {
    Write-Host "正在卸载 dk..."
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Invoke-Expression (Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notdp/oroio/main/uninstall.ps1?ts=$ts" -UseBasicParsing).Content
}

# Main entry
switch ($Command) {
    "add" { Cmd-Add -AddArgs $Arguments }
    "list" { Cmd-List }
    "ls" { Cmd-List }
    "current" { Cmd-Current }
    "use" { Cmd-Use -UseArgs $Arguments }
    "run" { Cmd-Run -RunArgs $Arguments }
    "serve" { Cmd-Serve -ServeArgs $Arguments }
    "rm" { Cmd-Remove -RmArgs $Arguments }
    "remove" { Cmd-Remove -RmArgs $Arguments }
    "del" { Cmd-Remove -RmArgs $Arguments }
    "reinstall" { Cmd-Reinstall }
    "uninstall" { Cmd-Uninstall }
    "help" { Show-Usage }
    "-h" { Show-Usage }
    "--help" { Show-Usage }
    "" { Show-Usage }
    default { Write-ErrorExit "未知命令: $Command" }
}
