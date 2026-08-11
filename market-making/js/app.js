/**
 * 铺单工具入口 — 协调配置加载、深度、表格
 */
(function () {
  'use strict';

  var defaultDataFile = 'data/symbol-1000001.json';

  function resolveDataUrl(file) {
    return QuantToolsConfigLoader.resolveUrl(location.href, file);
  }

  function loadBoxData(file) {
    file = file || defaultDataFile;
    return fetch(resolveDataUrl(file), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        MMTable.setData(data.symbol, data.boxes);
        document.getElementById('data_file_label').textContent = file.split('/').pop();
        if (data.symbol && data.symbol.symbol_id) {
          document.getElementById('symbol_id').value = data.symbol.symbol_id;
        }
        if (data.symbol && data.symbol.mark_price) {
          document.getElementById('mark_price_input').value = data.symbol.mark_price;
        }
      });
  }

  function applyMockFlag(cfg) {
    var cb = document.getElementById('use_mock');
    if (!cb || !cfg.mock) return;
    cb.checked = !!cfg.mock.enabled;
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
    document.querySelector('.btn-refresh').addEventListener('click', function () {
      MMDepth.refresh();
      loadBoxData((cfg.market_making && cfg.market_making.file) || defaultDataFile);
    });

    document.getElementById('mark_price_input').addEventListener('change', function () {
      MMTable.setMarkPrice(this.value);
    });

    document.getElementById('data_file').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          MMTable.setData(data.symbol, data.boxes);
          document.getElementById('data_file_label').textContent = file.name;
          if (data.symbol && data.symbol.symbol_id) {
            document.getElementById('symbol_id').value = data.symbol.symbol_id;
          }
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

    applyMockFlag(cfg);
    bindUi(cfg);

    loadBoxData(defaultDataFile).finally(function () {
      MMDepth.init();
    });
  }

  document.addEventListener('quant-tools-config-ready', function (ev) {
    window.MMApp = { reloadBoxData: function () { return loadBoxData(defaultDataFile); } };
    start(ev.detail || {});
  });
})();
