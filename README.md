# 量化展示工具 · quant-visual-tools

从 **quant-admin** 和 **smoneyfuturesservice** 提取的三套前端工具，打包为可独立运行的静态页面。  
接口不可用时，铺单工具支持 **外部 JSON 配置** 离线演示。

---

## 一、工具清单

| # | 工具 | 源码位置 | 本地入口 |
|---|------|----------|----------|
| 1 | **MX 铺单工具** | `quant-admin` → `9527.php/mx_market_making_list` + `mx_market_making_box` | `/market-making/index.html` |
| 2 | **深度服务 V4** | `smoneyfuturesservice/depth-chat.html` | `/depth-chat/depth-chat.html` |
| 3 | **深度聚合** | `smoneyfuturesservice/depthGather-chat.html` | `/depth-gather/depthGather-chat.html` |

---

## 二、快速启动

```bash
cd quant-visual-tools

# 1. 同步 depth 页（可选，从 smoneyfuturesservice 原样拷贝）
chmod +x sync.sh start.sh
./sync.sh

# 2. 启动静态服务
./start.sh          # 默认 8080 端口
./start.sh 9000     # 指定端口
```

浏览器打开：**http://localhost:8080/** （导航页）

> 必须用 HTTP 服务，不能用 `file://` 直接打开（fetch / ajax 会被浏览器拦截）。

---

## 三、各工具说明

### 1. MX 铺单工具（market-making）

**对应后台：** `quant-admin` 中 `mx_market_making_list` 列表 → 点击铺单盒子进入的页面（图 1）。

**页面结构（与线上一致）：**

```
┌─────────────────────────────────────┐
│  深度图（Highcharts 买卖盘面积图）    │
│  symbol_id · 环境选择 · AP/BP/MP…   │
├─────────────────────────────────────┤
│  铺单盒子配置表                       │
│  PID / 方向 / 层 / 固笔数 / 价格区间… │
└─────────────────────────────────────┘
```

**前端计算（移植自 `MxMarketMakingBox.php` + `Calculation.php`）：**

当接口返回 `mark_price`，或手动填写 Mark 价格时，表格自动计算：

| 字段 | 计算方式 |
|------|----------|
| `min_price` / `max_price` | `mark_price × (price_float 百分比 / 100)`，按 `price_precision` 截断 |
| `price_num`（价档数） | `(max_price - min_price) / 10^(-price_precision)` |
| `min_number` / `max_number` | `number_float × contract_value`（张 → 标的量） |
| `min_change_number` / `max_change_number` | `change_number_float × contract_value` |

**外部配置（接口挂掉时）：**

编辑 `market-making/data/symbol-1000001.json`：

```json
{
  "symbol": {
    "pid": 1,
    "symbol_id": 1000001,
    "contract_value": 0.001,
    "price_precision": 1,
    "number_precision": 3,
    "mark_price": 64129.1
  },
  "boxes": [
    {
      "box_id": 1,
      "pid": 1,
      "direction": -1,
      "dom": 1,
      "trust_num": 10,
      "price_float": "100.005-100.3",
      "number_float": "10000-10000",
      "change_trust_num": 0,
      "change_number_float": "1-100",
      "change_survival_time": "3-10",
      "status": 1
    }
  ]
}
```

- 页面底部 **「高级 · 外部配置」** 可上传 JSON / 手动 Mark 价 / 开启 mock 深度
- 全局配置：`config/app-config.json`
- URL 参数：`?mock=1&symbol_id=1000001&mark_price=64129.1`

**字段说明：**

- `direction`：`1` = 买盘，`−1` = 卖盘
- `price_float`：相对 Mark 价的百分比区间，如 `100.005-100.3` 表示 Mark 上方 0.005%～0.3%
- `number_float`：固量区间（张）
- `contract_value`：合约面值，用于张数 → 标的量换算

---

### 2. depth-chat（深度服务 V4）

**源码：** `smoneyfuturesservice/depth-chat.html` — **原样拷贝，本目录内不做任何改动。**

**功能：**

- 本所 vs 币安深度对比（50 档表格、重叠/占比视图）
- 实时 AP / BP / MP / Cap / AV / BV / UV / TV
- 用户挂单详情、价位聚合（depthGather）、据点预测
- K 线（ECharts 懒加载）
- 配置持久化（localStorage，`depth-chat:v4:config`）

**更新方式：**

```bash
./sync.sh   # 从 smoneyfuturesservice 重新拷贝
```

**注意：** 深度页的环境选择、symbol 切换均在页面 UI 内操作，不依赖 `config/app-config.json`。

---

### 3. depthGather-chat（深度聚合）

**源码：** `smoneyfuturesservice/depthGather-chat.html` — **原样拷贝，本目录内不做任何改动。**

**功能：**

- 按 UID 聚合的买卖盘明细表
- 深度面积图 + AP/BP/MP 等指标
- 500ms 定时刷新

**更新方式：** 同 depth-chat，执行 `./sync.sh`。

---

## 四、目录结构

```
quant-visual-tools/
├── index.html              # 导航入口
├── start.sh                # 启动静态服务
├── sync.sh                 # 从 smoneyfuturesservice 同步 depth 页
├── README.md
├── config/                 # 仅铺单工具使用
│   ├── app-config.json
│   └── config-loader.js
├── market-making/          # ① 铺单工具（独立开发，可改）
│   ├── index.html
│   ├── js/
│   │   ├── calculation.js  # 挂单量/价格计算
│   │   ├── depth.js        # 深度图（移植 quant-admin depthchat）
│   │   ├── table.js        # 铺单表格
│   │   └── app.js
│   └── data/
│       ├── symbol-1000001.json
│       └── mock-depth.json
├── depth-chat/             # ② 深度 V4（只拷贝，勿改）
│   └── depth-chat.html
└── depth-gather/           # ③ 深度聚合（只拷贝，勿改）
    └── depthGather-chat.html
```

---

## 五、维护约定

| 页面 | 是否可改 | 更新方式 |
|------|----------|----------|
| `depth-chat.html` | ❌ 不改 | 改 `smoneyfuturesservice` 源码 → `./sync.sh` |
| `depthGather-chat.html` | ❌ 不改 | 同上 |
| `market-making/` | ✅ 可改 | 直接编辑，或换 JSON 配置 |

---

## 六、常见问题

**Q: 深度页空白 / 接口报错？**  
A: 检查页面内环境下拉是否选对；本所 debug 接口需网络可达。depth 页与铺单工具独立，接口问题不影响铺单表格（用 JSON + 手动 Mark 价）。

**Q: 铺单表格数字不对？**  
A: 核对 JSON 中 `price_precision`、`contract_value`、`mark_price`；买盘 `price_float` 区间应为 `低-高`（如 `99.7-99.995`），卖盘为 `100.x-100.y`。

**Q: 如何替换真实铺单数据？**  
A: 从 DB 导出 `mx_market_making_list` + `mx_market_making_box`，按 `symbol-1000001.json` 格式整理，或在页面高级面板上传 JSON 文件。
