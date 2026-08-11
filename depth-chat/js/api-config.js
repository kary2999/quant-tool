/**
 * 加载 config/api-config.json → window.DepthChatConfig
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

  function load() {
    if (ready) return ready;
    ready = fetch(resolveUrl('config/api-config.json'), { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        cfg = json;
        var q = parseQuery();
        cfg.mock = cfg.mock || {};
        if (q.mock === '1' || q.mock === 'true') cfg.mock.enabled = true;
        if (cfg.mock.enabled_by_default) cfg.mock.enabled = true;
        if (q.api_base) cfg.api_base = q.api_base;
        global.DepthChatConfig = cfg;
        return cfg;
      })
      .catch(function () {
        cfg = {
          api_base: 'http://18.177.36.184/futures',
          endpoints: { depth: '/debug/depth', klineDiff: '/debug/klineDiff' },
          mock: { enabled: parseQuery().mock === '1', data_dir: 'data/mock' }
        };
        global.DepthChatConfig = cfg;
        return cfg;
      });
    return ready;
  }

  global.DepthChatConfigLoader = { load: load, get: function () { return cfg; }, resolveUrl: resolveUrl };
})(window);
