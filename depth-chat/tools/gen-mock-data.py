#!/usr/bin/env python3
"""
生成 js/mock-data.js —— file:// 打开时的内嵌 mock 兜底。

背景：浏览器对 file:// 页面禁止 fetch 本地 JSON（origin 为 null，直接被 CORS 拦），
所以 config/api-config.json 和 data/mock/*.json 在双击打开时全部读不到。
这里把它们打包进一个 JS 文件，由 <script> 标签加载，绕开 fetch。

用法：cd depth-chat && python3 tools/gen-mock-data.py
改过 data/mock/*.json 或 config/api-config.json 之后必须重跑，否则 file:// 下看到的还是旧数据。
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK_DIR = os.path.join(ROOT, "data", "mock")
CONFIG = os.path.join(ROOT, "config", "api-config.json")
OUT = os.path.join(ROOT, "js", "mock-data.js")

# mock.json 是接口索引文档，不是接口响应，不打包
SKIP = {"mock.json"}


def main():
    with open(CONFIG, encoding="utf-8") as f:
        config = json.load(f)

    files = {}
    for path in sorted(glob.glob(os.path.join(MOCK_DIR, "*.json"))):
        name = os.path.basename(path)
        if name in SKIP:
            continue
        with open(path, encoding="utf-8") as f:
            files[name] = json.load(f)

    compact = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    body = ",\n".join(
        "      %s: %s" % (json.dumps(name), compact(payload))
        for name, payload in files.items()
    )

    text = "\n".join([
        "/**",
        " * depth-chat · file:// 内嵌 mock 兜底（tools/gen-mock-data.py 自动生成，勿手改）",
        " * 数据源：config/api-config.json + data/mock/*.json",
        " */",
        "(function (global) {",
        "  'use strict';",
        "  global.QUANT_DC_MOCK = {",
        "    config: " + compact(config) + ",",
        "    files: {",
        body,
        "    }",
        "  };",
        "})(window);",
        "",
    ])

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)

    print("生成 %s（%.1f KB，内嵌 %d 个 mock 文件）" % (
        os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024, len(files)))
    for name in files:
        print("  -", name)


if __name__ == "__main__":
    main()
