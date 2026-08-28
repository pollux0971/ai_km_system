# E12-S030: starts whisper.cpp's whisper-server sidecar with the
# recommended settings (ADR 0004 §1/§5). Run `pnpm --filter
# @ai-km/tool-asr-readiness check-asr` first to confirm the binary and a
# model file are actually present — this script does not check for you.
#
# Usage:
#   .\asr-server.ps1 [-ModelFile ggml-large-v3-turbo-q5_0.bin] [-Port 8178]
#   $env:AI_KM_ASR_SERVER_BIN = "C:\path\to\whisper-server.exe"; .\asr-server.ps1

param(
    [string]$ModelFile = "ggml-large-v3-turbo-q5_0.bin",
    [int]$Port = 8178
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..\..\..")
$ModelPath = Join-Path $RepoRoot "models\asr\$ModelFile"
$Threads = if ($env:AI_KM_ASR_THREADS) { $env:AI_KM_ASR_THREADS } else { "4" }

if (-not (Test-Path $ModelPath)) {
    Write-Error "找不到模型檔:$ModelPath`n請依 models/asr/README.md 下載模型,或用 -ModelFile 指定已存在的檔名。"
    exit 1
}

$Binary = if ($env:AI_KM_ASR_SERVER_BIN) { $env:AI_KM_ASR_SERVER_BIN } else { "whisper-server.exe" }
$BinaryCommand = Get-Command $Binary -ErrorAction SilentlyContinue
if (-not $BinaryCommand -and -not (Test-Path $Binary)) {
    Write-Error "找不到 whisper-server($Binary)。請依 models/asr/README.md 建置,或設定 AI_KM_ASR_SERVER_BIN。"
    exit 1
}

Write-Host "啟動 whisper-server:model=$ModelFile port=$Port threads=$Threads"
& $Binary -m $ModelPath --host 127.0.0.1 --port $Port -l zh -t $Threads --prompt "以下是台灣繁體中文與英文混合的工作對話。"
