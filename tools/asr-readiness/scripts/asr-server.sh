#!/usr/bin/env bash
# E12-S030: starts whisper.cpp's whisper-server sidecar with the
# recommended settings (ADR 0004 §1/§5). Run `pnpm --filter
# @ai-km/tool-asr-readiness check-asr` first to confirm the binary and a
# model file are actually present — this script does not check for you.
#
# Usage:
#   ./asr-server.sh [model-file] [port]
#   AI_KM_ASR_SERVER_BIN=/path/to/whisper-server ./asr-server.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

MODEL_FILE="${1:-ggml-large-v3-turbo-q5_0.bin}"
PORT="${2:-8178}"
MODEL_PATH="${REPO_ROOT}/models/asr/${MODEL_FILE}"
THREADS="${AI_KM_ASR_THREADS:-4}"

if [ ! -f "${MODEL_PATH}" ]; then
  echo "找不到模型檔:${MODEL_PATH}" >&2
  echo "請依 models/asr/README.md 下載模型,或指定已存在的檔名作為第一個參數。" >&2
  exit 1
fi

BINARY="${AI_KM_ASR_SERVER_BIN:-whisper-server}"
if ! command -v "${BINARY}" >/dev/null 2>&1 && [ ! -x "${BINARY}" ]; then
  echo "找不到 whisper-server(${BINARY})。請依 models/asr/README.md 建置,或設定 AI_KM_ASR_SERVER_BIN。" >&2
  exit 1
fi

echo "啟動 whisper-server:model=${MODEL_FILE} port=${PORT} threads=${THREADS}"
exec "${BINARY}" \
  -m "${MODEL_PATH}" \
  --host 127.0.0.1 \
  --port "${PORT}" \
  -l zh \
  -t "${THREADS}" \
  --prompt "以下是台灣繁體中文與英文混合的工作對話。"
