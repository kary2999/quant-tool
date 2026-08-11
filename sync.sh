#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="${ROOT}/../smoneyfuturesservice"

if [[ ! -d "$SRC" ]]; then
  echo "错误: 找不到 smoneyfuturesservice 目录: $SRC" >&2
  exit 1
fi

cp "$SRC/depth-chat.html"       "$ROOT/depth-chat/depth-chat.html"
# depth-gather 在 quant-visual-tools 内独立维护 UI，不从 smoneyfuturesservice 覆盖

chmod +x "$ROOT/depth-chat/apply-mock-hooks.sh"
"$ROOT/depth-chat/apply-mock-hooks.sh" "$ROOT/depth-chat/depth-chat.html"

echo "已同步:"
echo "  depth-chat.html       ← smoneyfuturesservice + mock hooks"
echo "  depthGather-chat.html ← quant-visual-tools 本地维护（跳过 sync）"
diff -q "$SRC/depthGather-chat.html" "$ROOT/depth-gather/depthGather-chat.html" 2>/dev/null || true
echo "depth-gather 为本地 UI 版本"
