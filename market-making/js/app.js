/**
 * 铺单工具入口 — 列表 + 深度 + 网格配置
 */
(function () {
  'use strict';

  var defaultDataFile = 'data/symbol-1000001.json';
  var store = { raw: null, boxesByPid: {} };

  function resolveDataUrl(file) {
    return QuantToolsConfigLoader.resolveUrl(location.href, file);
  }

  function normalizePayload(data) {
    if (data.list && data.boxes) {
      store.raw = data;
      store.boxesByPid = data.boxes;
      return {
        list: data.list,
        activePid: data.active_pid || (data.list[0] && data.list[0].pid),
        fileLabel: true
      };
    }
    if (data.symbol && Array.isArray(data.boxes)) {
      var row = Object.assign({ pid: 1 }, data.symbol);
      store.raw = { list: [row], boxes: { 1: data.boxes }, active_pid: 1 };
      store.boxesByPid = store.raw.boxes;
      return { list: [row], activePid: 1, fileLabel: true };
    }
    throw new Error('JSON 需包含 list + boxes 或 symbol + boxes');
  }

  function applyListRow(row) {
    if (!row) return;
    var boxes = store.boxesByPid[String(row.pid)] || store.boxesByPid[row.pid] || [];
    MMTable.setContext(row, boxes);
    document.getElementById('symbol_id').value = row.symbol_id;
    document.getElementById('mark_price_input').value = row.mark_price;
    MMDepth.refresh();
  }

  function applyPayload(data, label) {
    var norm = normalizePayload(data);
    MMList.setData(norm.list, norm.activePid);
    document.getElementById('data_file_label').textContent = label;
    applyListRow(MMList.getActiveRow());
  }

  function loadEmbeddedData() {
    if (!window.QUANT_TOOLS_MOCK || !window.QUANT_TOOLS_MOCK.marketMaking) {
      throw new Error('无内嵌 mock 数据');
    }
    applyPayload(window.QUANT_TOOLS_MOCK.marketMaking, 'mock-data.js (内嵌)');
  }

  function loadData(file) {
    file = file || defaultDataFile;
    if (location.protocol === 'file:') {
      try {
        loadEmbeddedData();
        return Promise.resolve();
      } catch (e) {
        return Promise.reject(e);
      }
    }
    return fetch(resolveDataUrl(file), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        applyPayload(data, file.split('/').pop());
      })
      .catch(function (err) {
        console.warn('[MMApp] JSON 加载失败，fallback 内嵌 mock:', err.message);
        loadEmbeddedData();
      });
  }

  function showFileModeBanner() {
    if (location.protocol !== 'file:') return;
    var el = document.getElementById('file_mode_banner');
    if (el) el.style.display = 'block';
  }

  function applyMockFlag(cfg) {
    var cb = document.getElementById('use_mock');
    if (!cb || !cfg.mock) return;
    cb.checked = !!cfg.mock.enabled || location.protocol === 'file:';
    cb.addEventListener('change', function () {
      if (!window.QuantToolsConfig) return;
      QuantToolsConfig.mock.enabled = cb.checked;
      if (window.QuantToolsConfigLoader && QuantToolsConfigLoader.installMockAjax) {
        QuantToolsConfigLoader.installMockAjax(QuantToolsConfig);
      }
      MMDepth.refresh();
    });
  }

  function bindUi(cfg) {
    MMList.onSelect(applyListRow);

    document.querySelector('.btn-refresh').addEventListener('click', function () {
      MMDepth.refresh();
      loadData((cfg.market_making && cfg.market_making.file) || defaultDataFile);
    });

    document.querySelector('.btn-add-box').addEventListener('click', function () {
      alert('本地模式：请在 JSON boxes["' + MMList.getActivePid() + '"] 中追加网格层');
    });

    document.getElementById('mark_price_input').addEventListener('change', function () {
      var row = MMList.getActiveRow();
      if (row) row.mark_price = parseFloat(this.value) || row.mark_price;
      MMTable.setMarkPrice(this.value);
      MMList.render();
    });

    document.getElementById('data_file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          var norm = normalizePayload(data);
          MMList.setData(norm.list, norm.activePid);
          document.getElementById('data_file_label').textContent = file.name;
          applyListRow(MMList.getActiveRow());
        } catch (err) {
          alert('JSON 解析失败: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  function start(cfg) {
    if (cfg.market_making && cfg.market_making.file) {
      defaultDataFile = cfg.market_making.file;
    }

    QuantToolsConfigLoader.applyDepthEndpointSelect(cfg, 'market_monitor');
    if (cfg.defaults && cfg.defaults.symbol_id) {
      document.getElementById('symbol_id').value = cfg.defaults.symbol_id;
    }

    showFileModeBanner();
    applyMockFlag(cfg);
    bindUi(cfg);

    loadData(defaultDataFile).finally(function () {
      MMDepth.init();
    });
  }

  document.addEventListener('quant-tools-config-ready', function (ev) {
    window.MMApp = {
      reloadBoxData: function () { return loadData(defaultDataFile); },
      getStore: function () { return store; }
    };
    start(ev.detail || {});
  });
})();
