#!/usr/bin/env bash
# 在 depth-chat.html 注入 quant-visual-tools mock 脚本（sync 后自动执行）
set -euo pipefail

FILE="${1:-depth-chat/depth-chat.html}"
MARKER="quant-visual-tools-mock-hooks"

if grep -q "$MARKER" "$FILE" 2>/dev/null; then
  echo "mock hooks 已存在，跳过"
  exit 0
fi

python3 << PY
from pathlib import Path
path = Path("$FILE")
text = path.read_text(encoding="utf-8")
needle = '<script defer src="https://code.jquery.com/jquery-3.6.4.min.js"'
insert = '''<script defer src="https://code.jquery.com/jquery-3.6.4.min.js"
            integrity="sha256-oP6HI9z1XaZNBrJURtCoUT5SUnxFr8s3BzRl+cbzUq8=" crossorigin="anonymous"></script>
    <!-- quant-visual-tools-mock-hooks: 配置变量 + mock 桥接（sync 后保留） -->
    <script defer src="js/mock-data.js"></script>
    <script defer src="js/api-config.js"></script>
    <script defer src="js/mock-bridge.js"></script>'''
# 只替换第一处 jquery 行块
old = '''    <script defer src="https://code.jquery.com/jquery-3.6.4.min.js"
            integrity="sha256-oP6HI9z1XaZNBrJURtCoUT5SUnxFr8s3BzRl+cbzUq8=" crossorigin="anonymous"></script>'''
if old not in text:
    raise SystemExit("未找到 jquery 注入点")
text = text.replace(old, insert, 1)
path.write_text(text, encoding="utf-8")
print("已注入 mock hooks →", path)
PY
