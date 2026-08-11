/**
 * 内嵌 mock — file:// 直接打开页面时 fetch 会被浏览器拦截，走此数据
 * http 模式下仍优先读 JSON 文件；失败时同样 fallback 到这里
 */
(function (global) {
  'use strict';

  var MARK = 66501.1;

  function depthSeries(base, n, step, volStep) {
    var asks = [];
    var bids = [];
    var i;
    var cumAsk = 0;
    var cumBid = 0;
    for (i = 0; i < n; i++) {
      cumAsk += volStep * (i + 1);
      cumBid += volStep * (i + 1);
      asks.push([+(base + step * (i + 1)).toFixed(1), +cumAsk.toFixed(3)]);
      bids.push([+(base - step * (i + 1)).toFixed(1), +cumBid.toFixed(3)]);
    }
    return { asks: asks, bids: bids };
  }

  var series = depthSeries(MARK, 12, 0.3, 0.08);

  global.QUANT_TOOLS_MOCK = {
    config: {
      version: '1.1.0',
      defaults: {
        symbol_id: '1000001',
        mark_price: MARK,
        refresh_interval_ms: 500
      },
      endpoints: {
        depth: {
          options: [
            { label: 'Mock 本地', url: 'http://127.0.0.1/debug/depth' },
            { label: 'DEV1', url: 'https://contract.hxexchge.com/debug/depth' },
            { label: '测试', url: 'http://18.177.36.184/futures/debug/depth' }
          ],
          default_index: 0
        }
      },
      mock: {
        enabled: true,
        depth: 'embedded'
      },
      market_making: {
        file: 'data/symbol-1000001.json'
      }
    },

    marketMaking: {
      list: [
        {
          pid: 1,
          symbol_id: 1000001,
          symbol: 'btc_usdt',
          show_name: 'BTC 铺单',
          status: 1,
          maker_tag: 'mx_btc_maker',
          mark_price: MARK,
          benchmark_exchange: 'binance,gate,okex',
          strategy: 1,
          benchmark_type: 6,
          depth_optimization: 0,
          trading_gap: 0,
          contract_ratio: 10000,
          leverage: 2,
          is_knock: 1,
          move_position_qty: 15000,
          paving_ratio: '100|100',
          contract_value: 0.001,
          price_step: 0.1,
          price_precision: 1,
          number_precision: 3,
          st_unit: 'usdt'
        },
        {
          pid: 2,
          symbol_id: 1000002,
          symbol: 'eth_usdt',
          show_name: 'ETH 铺单',
          status: 1,
          maker_tag: 'mx_eth_maker',
          mark_price: 3450.25,
          benchmark_exchange: 'binance,gate,okex',
          strategy: 1,
          benchmark_type: 6,
          depth_optimization: 0,
          trading_gap: 0,
          contract_ratio: 10000,
          leverage: 2,
          is_knock: 0,
          move_position_qty: 8000,
          paving_ratio: '100|100',
          contract_value: 0.01,
          price_step: 0.01,
          price_precision: 2,
          number_precision: 2,
          st_unit: 'usdt'
        }
      ],
      boxes: {
        '1': [
          { box_id: 1, pid: 1, direction: -1, dom: 1, trust_num: 10, price_float: '100.005-100.3', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 2, pid: 1, direction: -1, dom: 2, trust_num: 10, price_float: '100.3-100.5', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 3, pid: 1, direction: -1, dom: 3, trust_num: 10, price_float: '100.5-100.8', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 4, pid: 1, direction: -1, dom: 4, trust_num: 10, price_float: '100.8-101.2', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 5, pid: 1, direction: -1, dom: 5, trust_num: 10, price_float: '101.2-102', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 6, pid: 1, direction: -1, dom: 6, trust_num: 30, price_float: '102-103', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 7, pid: 1, direction: -1, dom: 7, trust_num: 30, price_float: '103-105', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 8, pid: 1, direction: -1, dom: 8, trust_num: 30, price_float: '105-110', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 9, pid: 1, direction: -1, dom: 9, trust_num: 30, price_float: '110-120', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 10, pid: 1, direction: 1, dom: 1, trust_num: 10, price_float: '99.995-99.7', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 11, pid: 1, direction: 1, dom: 2, trust_num: 10, price_float: '99.7-99.5', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 12, pid: 1, direction: 1, dom: 3, trust_num: 10, price_float: '99.5-99.2', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 13, pid: 1, direction: 1, dom: 4, trust_num: 10, price_float: '99.2-98.8', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 14, pid: 1, direction: 1, dom: 5, trust_num: 10, price_float: '98.8-98', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 15, pid: 1, direction: 1, dom: 6, trust_num: 30, price_float: '98-97', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 16, pid: 1, direction: 1, dom: 7, trust_num: 30, price_float: '97-95', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 17, pid: 1, direction: 1, dom: 8, trust_num: 30, price_float: '95-90', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 },
          { box_id: 18, pid: 1, direction: 1, dom: 9, trust_num: 30, price_float: '90-80', number_float: '10000-10000', change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1 }
        ],
        '2': [
          { box_id: 101, pid: 2, direction: -1, dom: 1, trust_num: 15, price_float: '100.01-100.2', number_float: '500-2000', change_trust_num: 1, change_number_float: '10-100', change_survival_time: '5-15', status: 1 },
          { box_id: 102, pid: 2, direction: 1, dom: 1, trust_num: 15, price_float: '99.99-99.8', number_float: '500-2000', change_trust_num: 1, change_number_float: '10-100', change_survival_time: '5-15', status: 1 }
        ]
      },
      active_pid: 1
    },

    depth: {
      code: 0,
      msg: 'success (embedded mock)',
      data: {
        stats: {
          ask_price: +(MARK + 0.1).toFixed(1),
          bid_price: +(MARK - 0.1).toFixed(1),
          mark_price: MARK,
          diff_price: 0.2,
          diff_rate: 0.2,
          ask_qty: 5.04,
          bid_qty: 5.04,
          uid_num: 12,
          order_num: 687,
          max_price: series.asks[series.asks.length - 1][0],
          min_price: series.bids[series.bids.length - 1][0]
        },
        asks: series.asks,
        bids: series.bids,
        depth_analyze: '_00.02 : 0.0 / 0.0 <br/>_00.05 : 0.0 / 0.0 <br/>_00.10 : 0.1 / 0.1 <br/>'
      }
    }
  };
})(window);
