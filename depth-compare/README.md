# depthCompare · 多交易所深度位置对比

基于 `depth-gather` fork，同时拉取 **本所 + Binance / OKX / Bybit / KuCoin** 永续合约深度，统一价格精度后在纵向深度图中叠加对比。

## 功能

| 能力 | 说明 |
|------|------|
| 多档深度 | Binance 1000 / OKX 400 / Bybit 200 / KuCoin 100 档 |
| 统一精度 | 以 Binance tickSize 为准，各所价格四舍五入后合并同价位 |
| 批量等待 | `Promise.allSettled` 全部响应后再统一渲染图表 |
| 本所对比 | 左侧最优价表格 + 本所订单簿；右侧多交易所叠加深度图 |
| 统一定时器 | 可配置 1s / 2s / 3s / 5s 刷新间隔 |

## 快速上手

```bash
cd quant-visual-tools
./start.sh
# 浏览器打开
# http://localhost:8080/depth-compare/depthCompare-chat.html
```

1. 填写 **symbol_id**（1000001=BTC / 1000002=ETH / 1000003=TRX）
2. 选择本所数据源（测试环境 / Mock）
3. 勾选要显示的交易所
4. 点击 **定时刷新** 或 **立即刷新**

## 数据源

| 交易所 | HTTP 接口 | 最大档数 |
|--------|-----------|----------|
| 本所 | `GET /debug/depthGather?symbol_id=` | 按接口 |
| Binance | `fapi.binance.com/fapi/v1/depth` | 1000 |
| OKX | `okx.com/api/v5/market/books` | 400 |
| Bybit | `api.bybit.com/v5/market/orderbook` | 200 |
| KuCoin | `api-futures.kucoin.com/.../depth100` | 100 |

## 数量单位

- **Binance / Bybit**：标的币数量（BTC 等）
- **OKX**：合约张数 × `okx_ct_val`（配置于 `config/config.json`）
- **KuCoin**：合约张数 × `kucoin_multiplier`

## 目录

```
depth-compare/
├── depthCompare-chat.html   # 主页面
├── config/config.json       # symbol 映射 + 合约换算
├── js/
│   ├── exchange-depth.js    # 拉取 + 格式化 + 批量
│   └── mock-bridge.js       # 本所 Mock 桥接
└── data/mock/               # 本所离线 Mock
```

## 与 depth-gather 的区别

| | depth-gather | depth-compare |
|---|-------------|---------------|
| 数据源 | 仅本所 | 本所 + 4 外所 |
| 图表 | 本所买卖盘 | 多交易所叠加 |
| 刷新 | 单接口 | 批量等待全部响应 |
| 精度 | 接口原样 | 统一 Binance tick |
