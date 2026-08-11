/**
 * depth-chat mock 桥接
 * - api_base 来自 config/api-config.json（默认 http://18.177.36.184/futures）
 * - ?mock=1 时 /debug/depth、/debug/klineDiff 读本地 data/mock/*.json
 */
(function (global) {
  'use strict';

  var patched = false;

  function symbolIdFromUrl(url) {
    try {
      var u = new URL(url, global.location.href);
      return u.searchParams.get('symbol_id') || '';
    } catch (e) {
      var m = String(url).match(/symbol_id=(\d+)/);
      return m ? m[1] : '';
    }
  }

  function mockFile(cfg, kind, sid) {
    var mock = cfg.mock || {};
    var dir = mock.data_dir || 'data/mock';
    var tpl = (mock.files && mock.files[kind]) || (kind + '.symbol-{symbol_id}.json');
    var fb = (mock.files && mock.files[kind + '_fallback']) || (kind + '.default.json');
    var name = tpl.replace('{symbol_id}', sid || 'default');
    return { primary: dir + '/' + name, fallback: dir + '/' + fb };
  }

  function fetchMockJson(paths) {
    var url = DepthChatConfigLoader.resolveUrl(paths.primary);
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.ok) return r.json();
      return fetch(DepthChatConfigLoader.resolveUrl(paths.fallback), { cache: 'no-cache' }).then(function (r2) {
        if (!r2.ok) throw new Error('mock missing: ' + paths.primary);
        return r2.json();
      });
    });
  }

  function isDepthUrl(url) {
    return /\/debug\/depth(\?|$)/.test(url) && url.indexOf('depthGather') < 0;
  }

  function isKlineDiffUrl(url) {
    return /\/debug\/klineDiff/.test(url);
  }

  function rewriteApiBase(url, cfg) {
    if (!cfg || !cfg.api_base) return url;
    var base = cfg.api_base.replace(/\/$/, '');
    // 将生产/测试硬编码 host 统一到配置的 api_base（非 mock 模式）
    return url
      .replace(/^https?:\/\/[^/]+\/debug\//, base + '/debug/')
      .replace(/^https?:\/\/[^/]+\/futures\/debug\//, base + '/debug/');
  }

  function patchAjax(cfg) {
    if (patched || !global.jQuery) return;
    patched = true;
    var $ = global.jQuery;
    var orig = $.ajax.bind($);

    $.ajax = function (opts) {
      var o = typeof opts === 'string' ? { url: opts } : Object.assign({}, opts);
      var url = o.url || '';

      if (cfg.mock && cfg.mock.enabled) {
        if (isDepthUrl(url)) {
          var sid = symbolIdFromUrl(url);
          var paths = mockFile(cfg, 'depth', sid);
          var dfd = $.Deferred();
          fetchMockJson(paths).then(function (json) {
            if (o.success) o.success(json);
            if (o.complete) o.complete();
            dfd.resolve(json);
          }).catch(function (err) {
            if (o.error) o.error({ status: 0, statusText: err.message }, 'error', err.message);
            if (o.complete) o.complete();
            dfd.reject(err);
          });
          return dfd.promise();
        }
        if (isKlineDiffUrl(url)) {
          var sid2 = symbolIdFromUrl(url);
          var paths2 = mockFile(cfg, 'klineDiff', sid2);
          var dfd2 = $.Deferred();
          fetchMockJson(paths2).then(function (json) {
            if (o.success) o.success(json);
            if (o.complete) o.complete();
            dfd2.resolve(json);
          }).catch(function (err) {
            if (o.error) o.error({ status: 0, statusText: err.message }, 'error', err.message);
            if (o.complete) o.complete();
            dfd2.reject(err);
          });
          return dfd2.promise();
        }
      }

      if (url.indexOf('/debug/') >= 0) {
        o.url = rewriteApiBase(url, cfg);
      }
      return orig(o);
    };

    applySelectDefaults(cfg);
    console.info('[depth-chat mock-bridge] active mock=' + !!(cfg.mock && cfg.mock.enabled) +
      ' api_base=' + cfg.api_base);
  }

  /** 将下拉默认指向配置 api_base（非 mock 时走真接口） */
  function applySelectDefaults(cfg) {
    if (!cfg || !cfg.api_base) return;
    var base = cfg.api_base.replace(/\/$/, '');
    var depthEl = document.getElementById('market_monitor');
    var klineEl = document.getElementById('market_kline');
    if (depthEl) {
      var depthUrl = base + (cfg.endpoints.depth || '/debug/depth');
      var has = false;
      Array.prototype.forEach.call(depthEl.options, function (opt) {
        if (opt.value.indexOf('/debug/depth') >= 0) { opt.value = depthUrl; has = true; }
      });
      if (!has) {
        var o = document.createElement('option');
        o.value = depthUrl;
        o.textContent = '配置环境';
        o.selected = true;
        depthEl.appendChild(o);
      }
      depthEl.value = depthUrl;
    }
    if (klineEl) {
      var kUrl = base + (cfg.endpoints.klineDiff || '/debug/klineDiff');
      Array.prototype.forEach.call(klineEl.options, function (opt) {
        if (opt.value.indexOf('klineDiff') >= 0) opt.value = kUrl;
      });
      klineEl.value = kUrl;
    }
  }

  function boot() {
    DepthChatConfigLoader.load().then(function (cfg) {
      function tryPatch() {
        if (global.jQuery) {
          patchAjax(cfg);
        } else {
          setTimeout(tryPatch, 20);
        }
      }
      tryPatch();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
