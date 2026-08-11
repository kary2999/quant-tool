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

    loadPromise = fetchJson(resolveUrl(base, path))
      .then(function (cfg) {
        loaded = cfg;
        if (query.mock === '1' || query.mock === 'true') {
          loaded.mock = loaded.mock || {};
          loaded.mock.enabled = true;
        }
        if (query.symbol_id) {
          loaded.defaults = loaded.defaults || {};
          loaded.defaults.symbol_id = query.symbol_id;
        }
        if (query.mark_price) {
          loaded.defaults = loaded.defaults || {};
          loaded.defaults.mark_price = parseFloat(query.mark_price);
        }
        global.QuantToolsConfig = loaded;
        global.dispatchEvent(new CustomEvent('quant-tools-config-ready', { detail: loaded }));
        return loaded;
      })
      .catch(function (err) {
        console.warn('[config-loader] 加载失败，使用空配置:', err.message);
        loaded = { defaults: {}, endpoints: {}, mock: { enabled: false } };
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

    sel.innerHTML = '';
    ep.options.forEach(function (opt, idx) {
      var o = document.createElement('option');
      o.value = opt.url;
      o.textContent = opt.label;
      if (idx === (ep.default_index || 0)) o.selected = true;
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

  /** mock 模式下包装 $.ajax，命中 depth / depthGather 时走本地 JSON */
  function installMockAjax(cfg) {
    if (!cfg.mock || !cfg.mock.enabled || !global.jQuery) return;

    var $ = global.jQuery;
    var orig = $.ajax.bind($);

    $.ajax = function (opts) {
      var url = typeof opts === 'string' ? opts : (opts && opts.url);
      if (!url) return orig(opts);

      var mockPath = null;
      if (url.indexOf('depthGather') >= 0 && cfg.mock.depth_gather) {
        mockPath = cfg.mock.depth_gather;
      } else if (url.indexOf('/debug/depth') >= 0 && cfg.mock.depth) {
        mockPath = cfg.mock.depth;
      }

      if (mockPath) {
        var mockUrl = resolveUrl(global.location.href, mockPath);
        var newOpts = typeof opts === 'string'
          ? { url: mockUrl, dataType: 'json' }
          : Object.assign({}, opts, { url: mockUrl });
        console.info('[config-loader] mock →', mockUrl);
        return orig(newOpts);
      }
      return orig(opts);
    };
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
