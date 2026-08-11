/**
 * 加载 config/api-config.json → window.DepthChatConfig
 * file:// 下浏览器禁止 fetch 本地文件，改用 js/mock-data.js 内嵌配置
 */
(function (global) {
  'use strict';

  var cfg = null;
  var ready = null;

  function parseQuery() {
    var q = {};
    global.location.search.replace(/^\?/, '').split('&').forEach(function (p) {
      if (!p) return;
      var kv = p.split('=');
      q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  function resolveUrl(rel) {
    return new URL(rel, global.location.href).href;
  }

  function isFileMode() {
    return global.location.protocol === 'file:';
  }

  function inlineConfig() {
    if (global.QUANT_DC_MOCK && global.QUANT_DC_MOCK.config) {
      return JSON.parse(JSON.stringify(global.QUANT_DC_MOCK.config));
    }
    return {
      api_base: 'http://18.177.36.184/futures',
      endpoints: { depth: '/debug/depth', klineDiff: '/debug/klineDiff' },
      mock: { data_dir: 'data/mock' }
    };
  }

  function finalize(json) {
    cfg = json;
    var q = parseQuery();
    cfg.mock = cfg.mock || {};
    if (q.mock === '1' || q.mock === 'true') cfg.mock.enabled = true;
    if (cfg.mock.enabled_by_default) cfg.mock.enabled = true;
    if (q.api_base) cfg.api_base = q.api_base;
    cfg.file_mode = isFileMode();
    global.DepthChatConfig = cfg;
    return cfg;
  }

  function load() {
    if (ready) return ready;

    if (isFileMode()) {
      ready = Promise.resolve(finalize(inlineConfig()));
      return ready;
    }

    ready = fetch(resolveUrl('config/api-config.json'), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('config HTTP ' + r.status);
        return r.json();
      })
      .then(finalize)
      .catch(function () {
        console.warn('[depth-chat] api-config.json 加载失败，使用内嵌配置');
        return finalize(inlineConfig());
      });
    return ready;
  }

  global.DepthChatConfigLoader = {
    load: load,
    get: function () { return cfg; },
    resolveUrl: resolveUrl,
    isFileMode: isFileMode
  };
})(window);
