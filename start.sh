#!/usr/bin/env bash
# 启动本地静态文件服务
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8080}"

echo "量化展示工具 · 静态服务"
echo "  目录: $ROOT"
echo "  端口: $PORT"
echo ""
echo "  入口:     http://localhost:${PORT}/"
echo "  铺单工具: http://localhost:${PORT}/market-making/index.html"
echo "  深度 V4:  http://localhost:${PORT}/depth-chat/depth-chat.html"
echo "  深度聚合: http://localhost:${PORT}/depth-gather/depthGather-chat.html"
echo ""

cd "$ROOT"
python3 -m http.server "$PORT"
