# 量化展示工具 · quant-visual-tools

在线访问：**https://kary2999.github.io/quant-tool/**

从 **quant-admin** 和 **smoneyfuturesservice** 提取的前端工具，打包为可独立运行的静态页面，无后端、无构建。

> **全部工具默认使用 Mock 数据。** 公开页面既够不着内网接口，也不该去打生产域名，
> 所以默认一律读本地 mock，打开即可看到完整交互。
> 要连真接口：网址加 `?mock=0`，或在页面顶栏切换数据源下拉（仅在能访问内网的环境下有效）。

---

## 一、工具清单

| # | 工具 | 源码位置 | 入口 |
|---|------|----------|------|
| 1 | **MX 铺单工具** | `quant-admin` → `9527.php/mx_market_making_list` + `mx_market_making_box` | `/market-making/index.html` |
| 2 | **深度服务 V4** | `smoneyfuturesservice/depth-chat.html` | `/depth-chat/depth-chat.html` |
| 3 | **深度聚合**（已封板） | `smoneyfuturesservice/depthGather-chat.html` | `/depth-gather/depthGather-chat.html` |
| 4 | **外所深度对比** | fork 自 depth-gather | `/depth-compare/depthCompare-chat.html` |
| 5 | **K 线回测**（独立仓库） | [kary2999/trade-backtest](https://github.com/kary2999/trade-backtest) | https://kary2999.github.io/trade-backtest/ |

---

## 一·五、做市量化评定标准（固定尺子）

行情做市必须有**同一套评定口径**：盘口要对得上主流所，深度、K 线、铺单缝隙、对冲账不能各说各话。完整定义、公式、异常码、日终闸见：

**[docs/market-making-evaluation.md](docs/market-making-evaluation.md)**

值班只记下面这张表。BTC/ETH 是 L1 样板；其他交易对按文档 §7 分级，禁止套用 BTC 阈值却不上配置。

铺单怎么挂（对标价、近/中/远盘、单侧 10 挡网格）见文档 **§4**；下面是怎么评。

| # | 指标 | L1（BTC/ETH）通过线 | 角色 |
|---|------|---------------------|------|
| M1 | 盘口差 | `(ask1−bid1)/mid ≤ 万一`（1 bp） | 风控硬闸 |
| M2 | 近端深度 | **1% 内单侧 ≥ 500 万 U**；0.1% / 0.2% / 0.5% 递增检测 | 1% 硬闸 + 阶梯质量 |
| M3 | 1m K 对标 | 相对 Binance 同分钟 **high / low / close 偏差 ≤ 万五**；量 ≥ 对标所 **50%**；涨跌方向一致 | 做市质量 |
| M4 | 铺单颗粒度 | 万一带宽内约 100 个 tick **全部填满**，不允许价格缝隙 | 做市质量 |
| M5 | 现货对冲盈亏 | 代币数量盯住初始配资，**只计 USDT 增减**（买盘冻结仍计入权益） | 日终账 |
| M6 | 库存偏移 | 代币偏离目标库存超出带宽 → **买回或卖出** | 风控硬闸 |
| M7 | 合约快照盈亏 | `现货USDT增减 + 未实现盈亏 − 手续费 − 资金费` | 日终账（有合约时以 M7 为准） |

**采样与绩效**

- 每个交易对、每个 UTC 日 **300** 次随机快照（每小时约 12～13 次，时刻在小时内打散，避免整点博弈）。
- 日合格率 **≥ 80% → 绩效 B+**；**≥ 95% → 绩效 A+**。
- 价差炸了、1% 深度不够、库存飞出带宽：该次快照直接不合格，不能用别的项平均回来。
- 有效快照不足 240（对标所宕机等采不够）当日不发 A+/B+。
- 金额用 decimal，时间用 UTC / ISO 8601。细节与日级质量闸（K 线覆盖率、日终对冲盈亏）以完整文档为准。

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

**关于 `file://` 直接双击打开：** depth-chat 与 depth-gather 内置了 `js/mock-data.js`
（把配置和 mock JSON 打包进 JS），所以双击也能看 mock 演示。
但 market-making 的部分数据仍走 `fetch`，且真接口在 `file://` 下必被 CORS 拦，
**要完整体验请用 `./start.sh`**。

---

## 二·五、GitHub Pages 部署

仓库 `main` 分支根目录直接就是站点根目录，无需构建：

1. GitHub → 仓库 **Settings** → 左侧 **Pages**
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)`，Save
4. 等 1～2 分钟，访问 https://kary2999.github.io/quant-tool/

根目录的 `.nojekyll` 用于跳过 Jekyll 处理（避免下划线开头的文件被忽略、加快发布）。

**Pages 上哪些能用、哪些不能：**

| 数据来源 | 状态 | 说明 |
|----------|------|------|
| 本地 mock JSON | ✅ 可用 | 默认数据源，全部工具 |
| Binance / OKX / Bybit / KuCoin 公开行情 | ✅ 可用 | 公网 HTTPS，depth-chat 与 depth-compare 会真实拉取 |
| 内网测试环境 `18.177.36.184` | ❌ 不可用 | 公网不可达；且 https 页面不允许请求 http（混合内容） |
| 生产 `contract.chishee.com` | ❌ 不会请求 | 默认 mock 下不发起，公开页面不应触碰 |

---

## 三、各工具说明

### 1. MX 铺单工具（market-making）

**对应后台：** `quant-admin` 中 `mx_market_making_list` 列表 → 点击铺单盒子进入的页面（图 1）。

铺单是否合格（价差、1% 深度、tick 缝隙、K 线是否跟 Binance）不在本页计算，统一按 **[做市量化评定标准](docs/market-making-evaluation.md)**。本页负责看盒子参数和深度图。

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

**两条容易踩坑的口径，改 `calculation.js` 前务必先看：**

1. **全部走十进制定点（BigInt），不能用 `Number` 算。** PHP 侧是 bcmath，截断方向恒为「趋零」。
   用 double 复刻会出真错，例如 `0.29` 截到 2 位会变成 `0.28`，负数用 `Math.floor` 还会比 bcmath 多减 1。
2. **`price_float` 入库恒为「低-高」**，买卖都一样 —— 这是 `MxMarketMakingBox::edit()` 的硬校验
   （买盘上界 ≤ 100、卖盘下界 ≥ 100、且 `min ≤ max`）。买盘写成 `99.995-99.7` 这种「由盘口向外」
   的顺序会让 `price_num` 变成负数。页面参照 `quant_monitor/mm_app.js` 的做法会自动归一化并打告警角标，
   但**数据本身仍应按低-高写**。

**买卖方向语义（存储相同，读法相反）：**

价格公式两侧完全一致（`mark × pct/100`），后端四处实现都没有方向分支。
真正不同的是**近盘口的那一端是谁**：

| | 挂单位置 | 近盘口端 | 远端 | 表格展示 |
|---|---|---|---|---|
| 买盘 `direction=1` | 盘口下方 | 区间**上界**（价高） | 区间下界 | `99.995% → 99.7%` |
| 卖盘 `direction=-1` | 盘口上方 | 区间**下界**（价低） | 区间上界 | `100.005% → 100.3%` |

`enrichBox` 因此额外给出 `near_price / far_price / near_pct / far_pct`；
`min_price / max_price` 保留原名不动，方便和后台 quant-admin 页面逐字段对账。

表格按订单簿布局：卖盘在上（远→近）、买盘在下（近→远），中间的盘口行由
`MMCalculation.checkCross()` 计算，**卖盘最低价 ≤ 买盘最高价时判定为买卖重叠并标红**
（这类跨行问题单行校验拦不住，已关闭的盒子不参与判定）。

回归测试：`node market-making/test/calculation-test.js`
（内含一份独立的 bcmath BigInt 参考实现，逐字段比对，共 245 项断言）

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

### 3. depthGather-chat（深度均匀性查看）· **已封板**

**入口：** `/depth-gather/depthGather-chat.html`  
**产品说明：** [`depth-gather/README.md`](depth-gather/README.md)

**主要目的：** 查看本所某交易对挂单深度是否**均匀** — 各档 `Qty` 是否合理、有无断崖/缺档/一侧偏薄。

**功能摘要：**

- 左侧：按价位聚合的订单簿（UV / Qty / Price）
- 右侧：纵向单档深度图（每档独立量，非累计）
- 测试环境 / Mock 本地可动态切换；500ms 定时刷新

**维护：** `depthGather-chat.html` **不再改动**；Mock、配置、文档见 `depth-gather/` 目录其他文件。

---

## 四、目录结构

```
quant-visual-tools/
├── index.html              # 导航入口
├── start.sh                # 启动静态服务
├── sync.sh                 # 从 smoneyfuturesservice 同步 depth 页
├── README.md
├── docs/
│   └── market-making-evaluation.md  # 做市量化评定标准（风控 + 质量）
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
├── depth-chat/             # ② 深度 V4（页面只拷贝，勿改；周边 js/ 可改）
│   ├── depth-chat.html
│   ├── demo.html
│   ├── js/
│   │   ├── mock-data.js    # file:// 内嵌兜底（tools/gen-mock-data.py 生成）
│   │   ├── api-config.js
│   │   └── mock-bridge.js
│   ├── data/mock/
│   ├── tools/gen-mock-data.py
│   └── test/
│       ├── mock-smoke-test.js   # node 桩测试
│       └── e2e-browser.js       # 真实 Chrome e2e（需 puppeteer-core）
├── depth-gather/           # ③ 深度均匀性（主页面封板）
│   ├── README.md           # 产品说明（推荐阅读）
│   ├── depthGather-chat.html
│   ├── demo.html           # Mock / 接口技术说明
│   └── data/mock/
└── depth-compare/          # ④ 外所深度对比
    ├── README.md
    ├── depthCompare-chat.html
    └── data/mock/
```

---

## 五、维护约定

| 页面 | 是否可改 | 更新方式 |
|------|----------|----------|
| `depth-chat.html` | ❌ 不改 | 改 `smoneyfuturesservice` 源码 → `./sync.sh` |
| `depthGather-chat.html` | ❌ 封板不改 | Mock / 说明见 `depth-gather/README.md`、`demo.html` |
| `market-making/` | ✅ 可改 | 直接编辑，或换 JSON 配置 |

---

## 六、Mock JSON 配置（Demo 离线）

总索引：**`config/demo-mock.json`**

| 工具 | Demo 说明页 | Mock 数据目录 | 默认 | 关掉 mock |
|------|-------------|---------------|------|-----------|
| 铺单 | `market-making/demo.html` | `data/symbol-1000001.json` + `js/mock-data.js` | ✅ 开启 | `?mock=0` 或取消勾选「使用 Mock」 |
| depth-chat | `depth-chat/demo.html` | `depth-chat/data/mock/` + `js/mock-data.js` | ✅ 开启 | `?mock=0` 或顶栏下拉 |
| depth-gather | `depth-gather/demo.html` | `depth-gather/data/mock/` | ✅ 开启 | `?mock=0` 或顶栏下拉 |
| depth-compare | — | `depth-compare/data/mock/` | ✅ 开启 | `?mock=0` 或顶栏下拉 |

> 「默认 mock」这条规则实现在各自的 `js/mock-bridge.js`（铺单在 `config/config-loader.js`），
> 判断只有一行：除非 `?mock=0`，否则一律 mock。

**depth-gather mock 文件：**

```
depth-gather/data/mock/
├── mock.json                          # 接口索引
├── depthGather.default.json           # 默认回退
├── depthGather.symbol-1000001.json    # BTC 18 档
└── depthGather.symbol-1000003.json    # TRX
```

配置：`depth-gather/config/mock-config.json` · 桥接：`js/mock-bridge.js`

---

## 七、常见问题

**Q: 深度页空白 / 接口报错？**  
A: 检查页面内环境下拉是否选对；本所 debug 接口需网络可达。depth 页与铺单工具独立，接口问题不影响铺单表格（用 JSON + 手动 Mark 价）。

**Q: 铺单表格数字不对？**  
A: 核对 JSON 中 `price_precision`、`contract_value`、`mark_price`；买盘 `price_float` 区间应为 `低-高`（如 `99.7-99.995`），卖盘为 `100.x-100.y`。

**Q: 如何替换真实铺单数据？**  
A: 从 DB 导出 `mx_market_making_list` + `mx_market_making_box`，按 `symbol-1000001.json` 格式整理，或在页面高级面板上传 JSON 文件。
