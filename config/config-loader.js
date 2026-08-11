/**
 * 量化展示工具 — 外部配置加载器
 * 用法：页面引入本脚本后，可通过 URL 参数覆盖：
 *   ?config=../config/app-config.json
 *   ?mock=1
 *   ?symbol_id=1000001
 */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG_PATH = '../config/app-config.json';
  var loaded = null;
  var loadPromise = null;

  function parseQuery() {
    var q = {};
    var s = global.location.search.replace(/^\?/, '');
    if (!s) return q;
    s.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  function resolveUrl(base, rel) {
    try {
      return new URL(rel, base).href;
    } catch (e) {
      return rel;
    }
  }

  function deepMerge(target, patch) {
    var out = Object.assign({}, target);
    Object.keys(patch || {}).forEach(function (k) {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
        out[k] = deepMerge(out[k] || {}, patch[k]);
      } else {
        out[k] = patch[k];
      }
    });
    return out;
  }

  function isFileProtocol() {
    return global.location.protocol === 'file:';
  }

  function getEmbeddedConfig() {
    return global.QUANT_TOOLS_MOCK && global.QUANT_TOOLS_MOCK.config;
  }

  /**
   * 默认走 mock。理由：本页要发布到 GitHub Pages，
   * 公网既够不着内网接口，https 页面也不允许请求 http（混合内容）。
   * 要真接口：URL 加 ?mock=0，或页面上取消勾选「使用 Mock」。
   */
  function preferMockDefault() {
    var q = parseQuery();
    return !(q.mock === '0' || q.mock === 'false');
  }

  function applyQueryOverrides(cfg) {
    var query = parseQuery();
    cfg.mock = cfg.mock || {};
    cfg.mock.enabled = preferMockDefault();
    if (query.symbol_id) {
      cfg.defaults = cfg.defaults || {};
      cfg.defaults.symbol_id = query.symbol_id;
    }
    if (query.mark_price) {
      cfg.defaults = cfg.defaults || {};
      cfg.defaults.mark_price = parseFloat(query.mark_price);
    }
    return cfg;
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' @ ' + url);
      return r.json();
    });
  }

  function loadConfig(customPath) {
    if (loadPromise) return loadPromise;

    var query = parseQuery();
    var path = customPath || query.config || DEFAULT_CONFIG_PATH;
    var base = global.location.href;

    if (isFileProtocol() && getEmbeddedConfig()) {
      loaded = applyQueryOverrides(Object.assign({}, getEmbeddedConfig()));
      global.QuantToolsConfig = loaded;
      global.dispatchEvent(new CustomEvent('quant-tools-config-ready', { detail: loaded }));
      loadPromise = Promise.resolve(loaded);
      return loadPromise;
    }

    loadPromise = fetchJson(resolveUrl(base, path))
      .then(function (cfg) {
        loaded = applyQueryOverrides(cfg);
        global.QuantToolsConfig = loaded;
        global.dispatchEvent(new CustomEvent('quant-tools-config-ready', { detail: loaded }));
        return loaded;
      })
      .catch(function (err) {
        console.warn('[config-loader] 加载失败，尝试内嵌 mock:', err.message);
        var fallback = getEmbeddedConfig();
        loaded = fallback
          ? applyQueryOverrides(Object.assign({}, fallback))
          : applyQueryOverrides({ defaults: {}, endpoints: {}, mock: { enabled: isFileProtocol() } });
        global.QuantToolsConfig = loaded;
        global.dispatchEvent(new CustomEvent('quant-tools-config-ready', { detail: loaded }));
        return loaded;
      });

    return loadPromise;
  }

  /** 将配置中的 endpoint 选项注入到 select#market_monitor */
  function applyDepthEndpointSelect(cfg, selectId) {
    var sel = document.getElementById(selectId || 'market_monitor');
    if (!sel || !cfg || !cfg.endpoints) return;

    var path = global.location.pathname || '';
    var isGather = path.indexOf('depth-gather') >= 0 || path.indexOf('depthGather') >= 0;
    var ep = isGather ? cfg.endpoints.depth_gather : cfg.endpoints.depth;

    if (!ep || !ep.options || !ep.options.length) return;

    // mock 开启时优先选中 mock:// 项，关闭时回到配置里的 default_index，
    // 免得取消勾选后下拉还停在 mock:// 这个打不通的地址上。
    var wantIdx = ep.default_index || 0;
    if (cfg.mock && cfg.mock.enabled) {
      for (var i = 0; i < ep.options.length; i++) {
        if (/^mock:\/\//.test(ep.options[i].url)) { wantIdx = i; break; }
      }
    }

    sel.innerHTML = '';
    ep.options.forEach(function (opt, idx) {
      var o = document.createElement('option');
      o.value = opt.url;
      o.textContent = opt.label;
      if (idx === wantIdx) o.selected = true;
      sel.appendChild(o);
    });
  }

  /** depth-chat 内 fetchDepthGather 使用的 base URL */
  function getDepthGatherBaseUrl(cfg) {
    cfg = cfg || loaded || {};
    var ep = cfg.endpoints && cfg.endpoints.depth_gather;
    if (ep && ep.options && ep.options.length) {
      var idx = ep.default_index || 0;
      return ep.options[idx].url;
    }
    return 'https://contract.chishee.com/debug/depthGather';
  }

  function applyDefaults(cfg) {
    if (!cfg || !cfg.defaults) return;
    var sidEl = document.getElementById('symbol_id');
    if (sidEl && cfg.defaults.symbol_id) sidEl.value = cfg.defaults.symbol_id;
  }

  /** mock 模式下包装 $.ajax，命中 contract.chishee.com 相关接口时走本地 JSON */
  function installMockAjax(cfg) {
    if (!global.jQuery) return;
    var $ = global.jQuery;
    if ($.ajax.__quantMockInstalled) return;

    var orig = $.ajax.bind($);
    var mockMap = [
      { test: /depthGather/, key: 'depth_gather', fallback: 'depthGather.default.json' },
      { test: /^mock:\/\/depth(\?|$)/, key: 'depth', fallback: 'depth.default.json' },
      { test: /\/debug\/depth(\?|$)/, key: 'depth', fallback: 'depth.default.json' },
      { test: /exchangeInfo/, key: 'exchangeInfo' },
      { test: /tickerList/, key: 'tickerList' },
      { test: /exchangePrice/, key: 'exchangePrice' },
      { test: /priceHash/, key: 'priceHash' }
    ];

    $.ajax = function (opts) {
      // 每次请求实时读开关：装一次即可，勾选框来回切都生效
      var live = global.QuantToolsConfig || cfg;
      if (!live.mock || !live.mock.enabled) return orig(opts);

      var url = typeof opts === 'string' ? opts : (opts && opts.url);
      if (!url) return orig(opts);

      for (var i = 0; i < mockMap.length; i++) {
        var rule = mockMap[i];
        if (!rule.test.test(url)) continue;

        if (rule.key === 'depth' && global.QUANT_TOOLS_MOCK && global.QUANT_TOOLS_MOCK.depth) {
          console.info('[config-loader] mock → embedded depth');
          var depthPayload = global.QUANT_TOOLS_MOCK.depth;
          var dfd = $.Deferred();
          setTimeout(function () { dfd.resolve(depthPayload); }, 0);
          return dfd.promise();
        }

        var mockPath = cfg.mock[rule.key];
        if (!mockPath && rule.fallback) {
          mockPath = '../depth-chat/data/mock/' + rule.fallback;
        }
        if (mockPath && mockPath !== 'embedded') {
          var mockUrl = resolveUrl(global.location.href, mockPath);
          var newOpts = typeof opts === 'string'
            ? { url: mockUrl, dataType: 'json' }
            : Object.assign({}, opts, { url: mockUrl });
          console.info('[config-loader] mock →', mockUrl);
          return orig(newOpts);
        }
      }
      return orig(opts);
    };
    $.ajax.__quantMockInstalled = true;
  }

  function bootstrap(opts) {
    opts = opts || {};
    return loadConfig(opts.configPath).then(function (cfg) {
      applyDefaults(cfg);
      if (opts.endpointSelect !== false) applyDepthEndpointSelect(cfg, opts.selectId);
      installMockAjax(cfg);
      return cfg;
    });
  }

  global.QuantToolsConfigLoader = {
    load: loadConfig,
    bootstrap: bootstrap,
    get: function () { return loaded; },
    applyDepthEndpointSelect: applyDepthEndpointSelect,
    applyDefaults: applyDefaults,
    resolveUrl: resolveUrl,
    getDepthGatherBaseUrl: getDepthGatherBaseUrl,
    installMockAjax: installMockAjax
  };

  // 自动 bootstrap（DOM 就绪后）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bootstrap();
    });
  } else {
    bootstrap();
  }
})(window);
