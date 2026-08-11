/**
 * depth-chat mock 桥接（与 depth-gather 一致）
 * - 下拉「Mock 本地」→ 本所相关接口读 data/mock/*.json
 * - 下拉「测试环境」→ api_base 真接口，不被 mock 拦截
 * - market_monitor / market_kline 同步切换，?mock=1 仅默认选中 Mock
 */
(function (global) {
  'use strict';

  var patched = false;
  var fetchPatched = false;
  var origFetch = null;
  var builtOnce = false;

  // 页面启动（waitLibs → bootMain → fetchExchangeInfo）不等配置加载，
  // 所以这里先用内嵌配置同步兜底，等 api-config.json 到了再覆盖。
  var cfg = (global.QUANT_DC_MOCK && global.QUANT_DC_MOCK.config) ||
    { api_base: 'http://18.177.36.184/futures', mock: { data_dir: 'data/mock' } };

  var ROUTES = [
    { test: /^mock:\/\/depth(\?|$)/, kind: 'depth', needSid: true },
    { test: /^mock:\/\/klineDiff/, kind: 'klineDiff', needSid: true },
    { test: /\/pub\/exchangeInfo(\?|$)/, kind: 'exchangeInfo', needSid: false },
    { test: /\/pub\/v2\/tickerList/, kind: 'tickerList', needSid: false },
    { test: /\/debug\/depthGather/, kind: 'depthGather', needSid: true },
    { test: /\/debug\/exchangePrice/, kind: 'exchangePrice', needSid: false },
    { test: /\/debug\/priceHash/, kind: 'priceHash', needSid: false },
    { test: /\/debug\/klineDiff/, kind: 'klineDiff', needSid: true },
    { test: /\/debug\/depth(\?|$)/, kind: 'depth', needSid: true }
  ];

  function parseQuery() {
    var q = {};
    global.location.search.replace(/^\?/, '').split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  function symbolIdFromUrl(url) {
    try {
      return new URL(url, global.location.href).searchParams.get('symbol_id') || '';
    } catch (e) {
      var m = String(url).match(/symbol_id=(\d+)/);
      return m ? m[1] : '';
    }
  }

  function matchRoute(url) {
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i].test.test(url)) return ROUTES[i];
    }
    return null;
  }

  function isLocalApiRequest(url) {
    return /^mock:\/\//.test(url) ||
      /contract\.chishee\.com/.test(url) ||
      /\/debug\//.test(url) ||
      /\/pub\//.test(url) ||
      /\/futures\/debug\//.test(url) ||
      /\/futures\/pub\//.test(url);
  }

  function getDepthSelect() {
    return document.getElementById('market_monitor');
  }

  /**
   * 默认走 mock。理由：本页要发布到 GitHub Pages，
   * 公网既够不着内网 18.177.36.184，https 页面也不允许请求 http（混合内容），
   * 更不该让一个公开页面去打生产域名。
   * 要真接口：URL 加 ?mock=0，或顶栏下拉切「测试环境」。
   */
  function preferMockDefault() {
    var q = parseQuery();
    return !(q.mock === '0' || q.mock === 'false');
  }

  /** 下拉还没被重写前的意图（补丁装得比下拉重建早，必须能独立判断） */
  function earlyMockIntent() {
    return preferMockDefault();
  }

  function isMockSelected() {
    if (!builtOnce) return earlyMockIntent();
    var sel = getDepthSelect();
    if (!sel || sel.selectedIndex < 0) return false;
    var opt = sel.options[sel.selectedIndex];
    return opt && opt.getAttribute('data-mock') === '1';
  }

  function shouldMockRequest(url) {
    if (/^mock:\/\//.test(url)) return true;
    if (!isMockSelected()) return false;
    return isLocalApiRequest(url) && matchRoute(url) !== null;
  }

  function apiBase() {
    return (cfg && cfg.api_base) ? cfg.api_base.replace(/\/$/, '') : 'http://18.177.36.184/futures';
  }

  function liveUrl(path) {
    return apiBase() + path;
  }

  function mockFile(kind, sid) {
    var mock = (cfg && cfg.mock) || {};
    var dir = mock.data_dir || 'data/mock';
    var tpl = (mock.files && mock.files[kind]) || (kind + '.symbol-{symbol_id}.json');
    var fbKey = kind + '_fallback';
    var fb = (mock.files && mock.files[fbKey]) || (kind + '.default.json');
    var name = tpl.indexOf('{symbol_id}') >= 0
      ? tpl.replace('{symbol_id}', sid || 'default')
      : tpl;
    return { primary: dir + '/' + name, fallback: dir + '/' + fb };
  }

  function isFileMode() {
    return global.location.protocol === 'file:';
  }

  function baseName(path) {
    return String(path).split('/').pop();
  }

  /** file:// 下无法 fetch 本地 JSON，改读 js/mock-data.js 内嵌数据 */
  function inlineMock(paths) {
    var store = global.QUANT_DC_MOCK && global.QUANT_DC_MOCK.files;
    if (!store) return null;
    return store[baseName(paths.primary)] ||
      (paths.fallback ? store[baseName(paths.fallback)] : null) ||
      null;
  }

  function fetchMockJson(paths) {
    var embedded = inlineMock(paths);
    if (isFileMode()) {
      return embedded
        ? Promise.resolve(embedded)
        : Promise.reject(new Error('内嵌 mock 缺少 ' + baseName(paths.primary)));
    }

    var rawFetch = origFetch || global.fetch.bind(global);
    var url = DepthChatConfigLoader.resolveUrl(paths.primary);
    return rawFetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.ok) return r.json();
      if (!paths.fallback) throw new Error('mock missing: ' + paths.primary);
      return rawFetch(DepthChatConfigLoader.resolveUrl(paths.fallback), { cache: 'no-cache' }).then(function (r2) {
        if (!r2.ok) throw new Error('mock missing: ' + paths.primary);
        return r2.json();
      });
    }).catch(function (err) {
      if (embedded) return embedded;
      throw err;
    });
  }

  function rewriteApiBase(url) {
    if (!cfg || !cfg.api_base) return url;
    var base = apiBase();
    return url
      .replace(/^https?:\/\/[^/]+\/debug\//, base + '/debug/')
      .replace(/^https?:\/\/[^/]+\/pub\//, base + '/pub/')
      .replace(/^https?:\/\/[^/]+\/futures\/debug\//, base + '/debug/')
      .replace(/^https?:\/\/[^/]+\/futures\/pub\//, base + '/pub/');
  }

  var MOCK_TIP = 'Mock 模式（默认）— 本所接口走 <code>data/mock/*.json</code>（exchangeInfo / depth / kline / 牌价等）。' +
    '要连真接口：顶栏下拉切「测试环境」，或 URL 加 <code>?mock=0</code>。' +
    '说明见 <a href="demo.html" style="color:#58a6ff;">demo.html</a>';
  var FILE_LIVE_TIP = '当前用 <code>file://</code> 打开，浏览器会拦截对测试环境的跨域请求。' +
    '请切回「Mock 本地」，或在 quant-visual-tools 目录执行 <code>./start.sh</code> 后访问 ' +
    '<code>http://localhost:8080/depth-chat/depth-chat.html</code>';

  function updateBanner() {
    var banner = document.getElementById('mock_banner');
    if (!banner) return;
    if (isMockSelected()) {
      banner.innerHTML = MOCK_TIP;
      banner.style.display = 'block';
    } else if (isFileMode()) {
      banner.innerHTML = FILE_LIVE_TIP;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  function fillSelect(sel, mockUrl, liveUrl, preferMock) {
    if (!sel) return;
    // 首次构建按 preferMock；后续重建保持用户当前选择
    var prevMock = sel.selectedIndex >= 0 &&
      sel.options[sel.selectedIndex].getAttribute('data-mock') === '1';
    var keepPrev = builtOnce;
    sel.innerHTML = '';
    [
      { label: 'Mock 本地', url: mockUrl, mock: true },
      { label: '测试环境', url: liveUrl, mock: false }
    ].forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.url;
      o.textContent = opt.label;
      o.setAttribute('data-mock', opt.mock ? '1' : '0');
      sel.appendChild(o);
    });
    var wantMock = keepPrev ? prevMock : !!preferMock;
    for (var i = 0; i < sel.options.length; i++) {
      if ((sel.options[i].getAttribute('data-mock') === '1') === wantMock) {
        sel.selectedIndex = i;
        break;
      }
    }
  }

  function buildEndpointSelects(preferMock) {
    var ep = (cfg && cfg.endpoints) || {};
    fillSelect(
      getDepthSelect(),
      'mock://depth',
      liveUrl(ep.depth || '/debug/depth'),
      preferMock
    );
    fillSelect(
      document.getElementById('market_kline'),
      'mock://klineDiff',
      liveUrl(ep.klineDiff || '/debug/klineDiff'),
      preferMock
    );
    builtOnce = true;
    updateBanner();
  }

  function syncEnvSelects(fromEl) {
    var depthSel = getDepthSelect();
    var klineSel = document.getElementById('market_kline');
    if (!depthSel || !klineSel || fromEl === undefined) return;
    var src = fromEl === klineSel ? klineSel : depthSel;
    var dst = fromEl === klineSel ? depthSel : klineSel;
    var mock = src.options[src.selectedIndex].getAttribute('data-mock');
    for (var i = 0; i < dst.options.length; i++) {
      if (dst.options[i].getAttribute('data-mock') === mock) {
        dst.selectedIndex = i;
        break;
      }
    }
  }

  function refreshAllOnEnvChange() {
    if (typeof global.fetchExchangeInfo === 'function') global.fetchExchangeInfo();
    if (typeof global.fetchTickerList === 'function') global.fetchTickerList();
    if (typeof global.fetchExchangePrice === 'function') global.fetchExchangePrice();
    if (typeof global.fetchPriceHash === 'function') global.fetchPriceHash();
    if (typeof global.fetchDepthGather === 'function') global.fetchDepthGather();
    if (typeof global.getMarketData === 'function') global.getMarketData();
    if (typeof global.timeGetKline === 'function') global.timeGetKline();
  }

  function onEnvChange(ev) {
    syncEnvSelects(ev && ev.target);
    updateBanner();
    console.info('[depth-chat] 切换数据源 →', isMockSelected() ? 'Mock 本地' : '测试环境');
    refreshAllOnEnvChange();
  }

  function bindEnvSelects() {
    var depthSel = getDepthSelect();
    var klineSel = document.getElementById('market_kline');
    [depthSel, klineSel].forEach(function (sel) {
      if (!sel || sel._dcMockBound) return;
      sel._dcMockBound = true;
      sel.addEventListener('change', onEnvChange);
    });
  }

  function ajaxMock(url, o) {
    var route = matchRoute(url);
    if (!route) return null;
    var sid = route.needSid ? symbolIdFromUrl(url) : '';
    var paths = mockFile(route.kind, sid);
    var $ = global.jQuery;
    var dfd = $.Deferred();
    console.info('[depth-chat] mock →', paths.primary);
    fetchMockJson(paths).then(function (json) {
      if (o.success) o.success(json);
      if (o.complete) o.complete();
      dfd.resolve(json);
    }).catch(function (err) {
      console.error('[depth-chat] mock failed:', err.message);
      if (o.error) o.error({ status: 0, statusText: err.message }, 'error', err.message);
      if (o.complete) o.complete();
      dfd.reject(err);
    });
    return dfd.promise();
  }

  /** 页面内有直接用原生 fetch 调本所接口的地方（如全市场扫描），同样需要接管 */
  function patchFetch() {
    if (fetchPatched || typeof global.fetch !== 'function') return;
    fetchPatched = true;
    origFetch = global.fetch.bind(global);

    global.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';

      if (shouldMockRequest(url)) {
        var route = matchRoute(url);
        if (route) {
          var sid = route.needSid ? symbolIdFromUrl(url) : '';
          var paths = mockFile(route.kind, sid);
          console.info('[depth-chat] mock(fetch) →', paths.primary);
          return fetchMockJson(paths).then(function (json) {
            return new Response(JSON.stringify(json), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        }
      }

      if (typeof input === 'string' && isLocalApiRequest(url) && !/^mock:\/\//.test(url)) {
        return origFetch(rewriteApiBase(url), init);
      }
      return origFetch(input, init);
    };
  }

  function patchAjax() {
    if (patched || !global.jQuery) return;
    patched = true;
    var orig = global.jQuery.ajax.bind(global.jQuery);

    global.jQuery.ajax = function (opts) {
      var o = typeof opts === 'string' ? { url: opts } : Object.assign({}, opts);
      var url = o.url || '';

      if (shouldMockRequest(url)) {
        var mocked = ajaxMock(url, o);
        if (mocked) return mocked;
      }

      if (isLocalApiRequest(url) && !/^mock:\/\//.test(url)) {
        o.url = rewriteApiBase(url);
      }
      return orig(o);
    };
  }

  function applyConfig(c) {
    cfg = c;
    buildEndpointSelects(preferMockDefault());
    bindEnvSelects();
  }

  /**
   * 必须同步打补丁：页面的 waitLibs() 一见到 jQuery + Highcharts 就 bootMain()，
   * 不等 api-config.json。挂在配置回调里会让首个 exchangeInfo 漏到生产域名。
   * defer 脚本按文档顺序执行，jquery 在本文件之前，此处 jQuery 必然已就绪。
   */
  function installPatches() {
    patchFetch();
    if (global.jQuery) {
      patchAjax();
      return;
    }
    console.warn('[depth-chat] jQuery 尚未就绪，轮询补丁安装');
    (function retry() {
      if (global.jQuery) patchAjax();
      else setTimeout(retry, 5);
    })();
  }

  function boot() {
    DepthChatConfigLoader.load().then(function (c) {
      applyConfig(c);
      console.info('[depth-chat] ready mode=' + (isMockSelected() ? 'mock' : 'live') +
        ' api_base=' + apiBase());
    });
  }

  installPatches();

  global.DepthChatMock = {
    isMockSelected: isMockSelected,
    refreshAll: refreshAllOnEnvChange
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
