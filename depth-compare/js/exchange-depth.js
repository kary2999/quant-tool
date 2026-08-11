/**
 * 多交易所深度拉取 · 统一格式化 · 批量等待
 * 支持 Binance / OKX / Bybit / KuCoin 永续合约 HTTP 深度
 */
(function (global) {
  'use strict';

  var EXCHANGE_META = {
    local:   { label: '本所',   colorBid: '#10b981', colorAsk: '#ef4444', lineWidth: 2.2, zIndex: 5 },
    binance: { label: 'Binance', colorBid: '#f0b90b', colorAsk: '#f0b90b', lineWidth: 1.2, zIndex: 4 },
    okx:     { label: 'OKX',     colorBid: '#ffffff', colorAsk: '#ffffff', lineWidth: 1.2, zIndex: 3 },
    bybit:   { label: 'Bybit',   colorBid: '#f7a600', colorAsk: '#f7a600', lineWidth: 1.2, zIndex: 2 },
    kucoin:  { label: 'KuCoin',  colorBid: '#23af91', colorAsk: '#23af91', lineWidth: 1.2, zIndex: 1 }
  };

  var bnTickCache = {};
  var bnExchangeInfoLoaded = false;

  function fetchJson(url, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000);
    return fetch(url, {
      signal: ctrl.signal,
      cache: 'no-cache',
      headers: { 'Accept': 'application/json' }
    })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  /** 从 Binance tickSize 推导价格小数位 */
  function decimalsFromTick(tickStr) {
    var tick = parseFloat(tickStr);
    if (!tick || tick >= 1) return 0;
    var s = String(tickStr);
    var dot = s.indexOf('.');
    if (dot < 0) return 0;
    return s.length - dot - 1;
  }

  function roundPrice(price, decimals) {
    var n = parseFloat(price);
    if (isNaN(n)) return '0';
    return n.toFixed(decimals);
  }

  /** 按统一精度合并同价位 */
  function aggregateLevels(rawLevels, decimals, qtyKey) {
    var map = {};
    (rawLevels || []).forEach(function (row) {
      var price, qty;
      if (Array.isArray(row)) {
        price = row[0]; qty = row[1];
      } else {
        price = row.price; qty = row[qtyKey || 'number'] || row.qty || row.size;
      }
      var rp = roundPrice(price, decimals);
      var q = parseFloat(qty) || 0;
      map[rp] = (map[rp] || 0) + q;
    });
    return Object.keys(map).sort(function (a, b) { return parseFloat(a) - parseFloat(b); })
      .map(function (p) { return { price: p, number: map[p].toFixed(8).replace(/\.?0+$/, '') || '0' }; });
  }

  function calcStats(asks, bids) {
    var bestAsk = asks.length ? parseFloat(asks[0].price) : 0;
    var bestBid = bids.length ? parseFloat(bids[bids.length - 1].price) : 0;
    var askQty = asks.reduce(function (s, r) { return s + parseFloat(r.number); }, 0);
    var bidQty = bids.reduce(function (s, r) { return s + parseFloat(r.number); }, 0);
    return {
      ask_price: bestAsk ? String(bestAsk) : '-',
      bid_price: bestBid ? String(bestBid) : '-',
      ask_qty: askQty.toFixed(4),
      bid_qty: bidQty.toFixed(4),
      ask_levels: asks.length,
      bid_levels: bids.length
    };
  }

  function emptyResult(exchange, errMsg, latencyMs) {
    return {
      exchange: exchange,
      ok: false,
      error: errMsg || 'unknown',
      latency_ms: latencyMs || 0,
      asks: [],
      bids: [],
      stats: {}
    };
  }

  function okResult(exchange, asks, bids, latencyMs, extra) {
    return Object.assign({
      exchange: exchange,
      ok: true,
      latency_ms: latencyMs,
      asks: asks,
      bids: bids,
      stats: calcStats(asks, bids)
    }, extra || {});
  }

  /** 预加载 Binance exchangeInfo 获取 tickSize */
  function loadBinanceTickSizes() {
    if (bnExchangeInfoLoaded) return Promise.resolve(bnTickCache);
    return fetchJson('https://fapi.binance.com/fapi/v1/exchangeInfo', 8000)
      .then(function (json) {
        (json.symbols || []).forEach(function (s) {
          var pf = (s.filters || []).find(function (f) { return f.filterType === 'PRICE_FILTER'; });
          if (pf && pf.tickSize) {
            bnTickCache[s.symbol] = {
              tickSize: pf.tickSize,
              decimals: decimalsFromTick(pf.tickSize)
            };
          }
        });
        bnExchangeInfoLoaded = true;
        return bnTickCache;
      })
      .catch(function () {
        bnExchangeInfoLoaded = true;
        return bnTickCache;
      });
  }

  function resolvePriceDecimals(symCfg) {
    var bn = symCfg.binance;
    if (bnTickCache[bn]) return bnTickCache[bn].decimals;
    var name = symCfg.name || '';
    if (/BTC/i.test(name)) return 1;
    if (/ETH/i.test(name)) return 2;
    return 4;
  }

  // ── 各交易所拉取 ──

  function fetchBinanceDepth(symCfg, timeoutMs) {
    var t0 = Date.now();
    var sym = symCfg.binance;
    var limit = 1000;
    return fetchJson('https://fapi.binance.com/fapi/v1/depth?symbol=' + sym + '&limit=' + limit, timeoutMs)
      .then(function (json) {
        var pd = resolvePriceDecimals(symCfg);
        var asks = aggregateLevels(json.asks, pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        var bids = aggregateLevels(json.bids, pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        return okResult('binance', asks, bids, Date.now() - t0, { raw_levels: (json.asks || []).length + (json.bids || []).length });
      })
      .catch(function (e) { return emptyResult('binance', e.message, Date.now() - t0); });
  }

  function fetchOkxDepth(symCfg, timeoutMs) {
    var t0 = Date.now();
    var instId = symCfg.okx;
    var sz = 400;
    var ctVal = symCfg.okx_ct_val || 0.01;
    return fetchJson('https://www.okx.com/api/v5/market/books?instId=' + encodeURIComponent(instId) + '&sz=' + sz, timeoutMs)
      .then(function (json) {
        if (json.code !== '0' || !json.data || !json.data[0]) throw new Error(json.msg || 'OKX empty');
        var book = json.data[0];
        var pd = resolvePriceDecimals(symCfg);
        var toBase = function (rows) {
          return (rows || []).map(function (r) {
            return [r[0], String(parseFloat(r[1]) * ctVal)];
          });
        };
        var asks = aggregateLevels(toBase(book.asks), pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        var bids = aggregateLevels(toBase(book.bids), pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        return okResult('okx', asks, bids, Date.now() - t0);
      })
      .catch(function (e) { return emptyResult('okx', e.message, Date.now() - t0); });
  }

  function fetchBybitDepth(symCfg, timeoutMs) {
    var t0 = Date.now();
    var sym = symCfg.bybit;
    var limit = 200;
    return fetchJson('https://api.bybit.com/v5/market/orderbook?category=linear&symbol=' + sym + '&limit=' + limit, timeoutMs)
      .then(function (json) {
        if (json.retCode !== 0 || !json.result) throw new Error(json.retMsg || 'Bybit empty');
        var pd = resolvePriceDecimals(symCfg);
        var asks = aggregateLevels(json.result.a, pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        var bids = aggregateLevels(json.result.b, pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        return okResult('bybit', asks, bids, Date.now() - t0);
      })
      .catch(function (e) { return emptyResult('bybit', e.message, Date.now() - t0); });
  }

  function fetchKucoinDepth(symCfg, timeoutMs) {
    var t0 = Date.now();
    var sym = symCfg.kucoin;
    var mult = symCfg.kucoin_multiplier || 1;
    return fetchJson('https://api-futures.kucoin.com/api/v1/level2/depth100?symbol=' + sym, timeoutMs)
      .then(function (json) {
        if (json.code !== '200000' || !json.data) throw new Error(json.msg || 'KuCoin empty');
        var pd = resolvePriceDecimals(symCfg);
        var toBase = function (rows) {
          return (rows || []).map(function (r) {
            return [r[0], String(parseFloat(r[1]) * mult)];
          });
        };
        var asks = aggregateLevels(toBase(json.data.asks), pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        var bids = aggregateLevels(toBase(json.data.bids), pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
        return okResult('kucoin', asks, bids, Date.now() - t0);
      })
      .catch(function (e) { return emptyResult('kucoin', e.message, Date.now() - t0); });
  }

  /** 格式化本所 depthGather 数据 */
  function normalizeLocalDepth(json, symCfg) {
    if (!json || !json.data || !json.data.depth) {
      return emptyResult('local', 'invalid local response');
    }
    var pd = resolvePriceDecimals(symCfg);
    var depth = json.data.depth;
    var asks = aggregateLevels(depth.ask || [], pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
    var bids = aggregateLevels(depth.bid || [], pd).sort(function (a, b) { return parseFloat(a.price) - parseFloat(b.price); });
    return okResult('local', asks, bids, 0, { stats_local: json.data.stats || {} });
  }

  /**
   * 批量拉取：全部完成后再返回（Promise.allSettled）
   * @param {Object} opts - { symCfg, localFetcher, timeoutMs }
   * @returns {Promise<{batch_ms, price_decimals, results: Object}>}
   */
  function fetchAllDepths(opts) {
    var symCfg = opts.symCfg;
    var timeoutMs = opts.timeoutMs || 10000;
    var batchStart = Date.now();

    return loadBinanceTickSizes().then(function () {
      var pd = resolvePriceDecimals(symCfg);

      var localPromise = Promise.resolve()
        .then(function () {
          var t0 = Date.now();
          return opts.localFetcher().then(function (json) {
            var r = normalizeLocalDepth(json, symCfg);
            r.latency_ms = Date.now() - t0;
            return r;
          }).catch(function (e) {
            return emptyResult('local', e.message, Date.now() - t0);
          });
        });

      return Promise.allSettled([
        localPromise,
        fetchBinanceDepth(symCfg, timeoutMs),
        fetchOkxDepth(symCfg, timeoutMs),
        fetchBybitDepth(symCfg, timeoutMs),
        fetchKucoinDepth(symCfg, timeoutMs)
      ]).then(function (settled) {
        var results = {};
        var order = ['local', 'binance', 'okx', 'bybit', 'kucoin'];
        settled.forEach(function (s, i) {
          var key = order[i];
          if (s.status === 'fulfilled') {
            results[key] = s.value;
          } else {
            results[key] = emptyResult(key, s.reason ? s.reason.message : 'rejected');
          }
        });
        return {
          batch_ms: Date.now() - batchStart,
          price_decimals: pd,
          symCfg: symCfg,
          results: results
        };
      });
    });
  }

  /** depth levels → Highcharts series [price, ±qty] */
  function levelsToSeries(levels, sign) {
    return (levels || []).map(function (row) {
      return [parseFloat(row.price), sign * (parseFloat(row.number) || 0)];
    }).filter(function (pt) { return !isNaN(pt[0]) && pt[1] !== 0; });
  }

  global.DepthCompare = {
    EXCHANGE_META: EXCHANGE_META,
    EXCHANGE_KEYS: ['local', 'binance', 'okx', 'bybit', 'kucoin'],
    fetchAllDepths: fetchAllDepths,
    levelsToSeries: levelsToSeries,
    loadBinanceTickSizes: loadBinanceTickSizes,
    resolvePriceDecimals: resolvePriceDecimals,
    aggregateLevels: aggregateLevels,
    roundPrice: roundPrice
  };
})(window);
