/**
 * depth-gather mock 桥接
 * - 下拉「Mock 本地」→ 读 data/mock/*.json
 * - 下拉「测试环境」→ 真实 api_base 接口（不被 mock 拦截）
 * - 两项始终保留，可随时动态切换
 */
(function (global) {
  'use strict';

  var CONFIG_PATH = 'config/config.json';
  var MOCK_URL = 'mock://depthGather';
  var DEFAULT_LIVE = 'http://18.177.36.184/futures/debug/depthGather';
  var patched = false;
  var builtOnce = false;
  var cfg = null;

  function parseQuery() {
    var q = {};
    global.location.search.replace(/^\?/, '').split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  function resolveUrl(rel) {
    try {
      return new URL(rel, global.location.href).href;
    } catch (e) {
      return rel;
    }
  }

  function symbolIdFromUrl(url) {
    try {
      return new URL(url, global.location.href).searchParams.get('symbol_id') || '';
    } catch (e) {
      var m = String(url).match(/symbol_id=(\d+)/);
      return m ? m[1] : '';
    }
  }

  function isDepthGatherRequest(url) {
    return /^mock:\/\/depthGather/.test(url) ||
      /\/debug\/depthGather(\?|$)/.test(url);
  }

  function getSelect() {
    return document.getElementById('market_monitor');
  }

  /**
   * 默认走 mock。理由：本页要发布到 GitHub Pages，
   * 公网既够不着内网 18.177.36.184，https 页面也不允许请求 http（混合内容）。
   * 要真接口：URL 加 ?mock=0，或顶栏下拉切「测试环境」。
   */
  function preferMockDefault() {
    var q = parseQuery();
    return !(q.mock === '0' || q.mock === 'false');
  }

  function isMockSelected() {
    var sel = getSelect();
    if (!sel || sel.selectedIndex < 0) return preferMockDefault();
    var opt = sel.options[sel.selectedIndex];
    return opt && opt.getAttribute('data-mock') === '1';
  }

  function shouldMockRequest(url) {
    if (/^mock:\/\//.test(url)) return true;
    if (!isDepthGatherRequest(url)) return false;
    return isMockSelected();
  }

  function liveDepthGatherUrl() {
    var base = (cfg && cfg.api_base) ? cfg.api_base.replace(/\/$/, '') : 'http://18.177.36.184/futures';
    var path = (cfg && cfg.endpoints && cfg.endpoints.depthGather) || '/debug/depthGather';
    return base + path;
  }

  function mockPaths(kind, sid) {
    var mock = (cfg && cfg.mock) || {};
    var dir = mock.data_dir || 'data/mock';
    var tpl = (mock.files && mock.files[kind]) || kind + '.symbol-{symbol_id}.json';
    var fb = (mock.files && mock.files[kind + '_fallback']) || kind + '.default.json';
    return {
      primary: dir + '/' + tpl.replace('{symbol_id}', sid || 'default'),
      fallback: dir + '/' + fb
    };
  }

  function fetchMockJson(paths) {
    if (global.location.protocol === 'file:' && global.QUANT_DG_MOCK && global.QUANT_DG_MOCK.depthGather) {
      return Promise.resolve(global.QUANT_DG_MOCK.depthGather);
    }
    return fetch(resolveUrl(paths.primary), { cache: 'no-cache' }).then(function (r) {
      if (r.ok) return r.json();
      return fetch(resolveUrl(paths.fallback), { cache: 'no-cache' }).then(function (r2) {
        if (!r2.ok) throw new Error('mock missing: ' + paths.primary);
        return r2.json();
      });
    }).catch(function (err) {
      var embedded = global.QUANT_DG_MOCK && global.QUANT_DG_MOCK.depthGather;
      if (embedded) return embedded;
      throw err;
    });
  }

  function loadConfig() {
    if (global.location.protocol === 'file:' && global.QUANT_DG_MOCK && global.QUANT_DG_MOCK.config) {
      return Promise.resolve(global.QUANT_DG_MOCK.config);
    }
    return fetch(resolveUrl(CONFIG_PATH), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('config HTTP ' + r.status);
      return r.json();
    }).catch(function () {
      return (global.QUANT_DG_MOCK && global.QUANT_DG_MOCK.config) || {
        api_base: 'http://18.177.36.184/futures',
        endpoints: { depthGather: '/debug/depthGather' },
        mock: { data_dir: 'data/mock' }
      };
    });
  }

  function updateBanner() {
    var banner = document.getElementById('mock_banner');
    if (!banner) return;
    banner.style.display = isMockSelected() ? 'block' : 'none';
  }

  /** 始终保留 Mock + 测试环境两项；重建时尽量保持当前选中模式 */
  function buildEndpointSelect(preferMock) {
    var sel = getSelect();
    if (!sel) return;

    // HTML 里本来就写死了 option，不能用 selectedIndex 判断「用户是否选过」，
    // 否则 preferMock 永远进不去；用 builtOnce 区分首次构建与后续重建。
    var prevMock = isMockSelected();
    var hadSelection = builtOnce;
    var liveUrl = liveDepthGatherUrl();
    var options = [
      { label: 'Mock 本所', url: MOCK_URL, mock: true },
      { label: '测试环境', url: liveUrl, mock: false }
    ];

    sel.innerHTML = '';
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.url;
      o.textContent = opt.label;
      o.setAttribute('data-mock', opt.mock ? '1' : '0');
      sel.appendChild(o);
    });

    var wantMock;
    if (hadSelection) {
      wantMock = prevMock;
    } else if (preferMock) {
      wantMock = true;
    } else {
      wantMock = false;
    }

    for (var i = 0; i < sel.options.length; i++) {
      var isMockOpt = sel.options[i].getAttribute('data-mock') === '1';
      if (wantMock === isMockOpt) {
        sel.selectedIndex = i;
        break;
      }
    }
    builtOnce = true;
    updateBanner();
  }

  function onEndpointChange() {
    updateBanner();
    console.info('[depth-compare] 切换数据源 →', isMockSelected() ? 'Mock 本所' : '测试环境',
      getSelect() ? getSelect().value : '');
    if (global.getMarketData) {
      global.getMarketData();
    }
  }

  function bindSelectEvents() {
    var sel = getSelect();
    if (!sel || sel._dgMockBound) return;
    sel._dgMockBound = true;
    sel.addEventListener('change', onEndpointChange);
  }

  function bindSymbolEvents() {
    var sid = document.getElementById('symbol_id');
    if (!sid || sid._dgMockBound) return;
    sid._dgMockBound = true;
    sid.addEventListener('change', function () {
      if (global.getMarketData) global.getMarketData();
    });
    sid.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && global.getMarketData) global.getMarketData();
    });
  }

  function applyConfig(c) {
    cfg = c;
    var query = parseQuery();
    var preferMock = preferMockDefault();

    if (query.symbol_id) {
      cfg.defaults = cfg.defaults || {};
      cfg.defaults.symbol_id = query.symbol_id;
    }

    buildEndpointSelect(preferMock);
    bindSelectEvents();
    bindSymbolEvents();

    var sidEl = document.getElementById('symbol_id');
    if (sidEl && cfg.defaults && cfg.defaults.symbol_id && !query.symbol_id) {
      sidEl.value = cfg.defaults.symbol_id;
    }
  }

  function patchAjax() {
    if (patched || !global.jQuery) return;
    patched = true;
    var orig = global.jQuery.ajax.bind(global.jQuery);

    global.jQuery.ajax = function (opts) {
      var o = typeof opts === 'string' ? { url: opts } : Object.assign({}, opts);
      var url = o.url || '';

      if (isDepthGatherRequest(url) && shouldMockRequest(url)) {
        var sid = symbolIdFromUrl(url) || (global.jQuery('#symbol_id').val() || '');
        var paths = mockPaths('depthGather', sid);
        console.info('[depth-compare] mock →', paths.primary);
        var dfd = global.jQuery.Deferred();
        fetchMockJson(paths).then(function (json) {
          if (o.success) o.success(json);
          if (o.complete) o.complete();
          dfd.resolve(json);
        }).catch(function (err) {
          console.error('[depth-compare] mock failed:', err.message);
          if (o.error) o.error({ status: 0, statusText: err.message }, 'error', err.message);
          if (o.complete) o.complete();
          dfd.reject(err);
        });
        return dfd.promise();
      }

      return orig(o);
    };
  }

  function boot() {
    loadConfig().then(function (c) {
      applyConfig(c);
      function tryPatch() {
        if (global.jQuery) patchAjax();
        else setTimeout(tryPatch, 20);
      }
      tryPatch();
      global.dispatchEvent(new CustomEvent('depth-compare-config-ready', { detail: cfg }));
      var sel = getSelect();
      console.info('[depth-compare] ready mode=' + (isMockSelected() ? 'mock' : 'live') +
        ' url=' + (sel ? sel.value : DEFAULT_LIVE));
    });
  }

  global.DepthCompareMock = {
    reload: boot,
    getConfig: function () { return cfg; },
    isMockSelected: isMockSelected,
    switchToMock: function () {
      var sel = getSelect();
      if (!sel) return;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].getAttribute('data-mock') === '1') {
          sel.selectedIndex = i;
          onEndpointChange();
          break;
        }
      }
    },
    switchToLive: function () {
      var sel = getSelect();
      if (!sel) return;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].getAttribute('data-mock') === '0') {
          sel.selectedIndex = i;
          onEndpointChange();
          break;
        }
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
