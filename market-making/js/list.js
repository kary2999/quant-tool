/**
 * 铺单列表 — 移植 quant-admin mx_market_making_list.js 列展示
 */
(function (global) {
  'use strict';

  var state = {
    list: [],
    activePid: null,
    onSelect: null
  };

  function precisionToFixed(value) {
    return parseFloat(Number(value).toFixed(20));
  }

  /** 张数换算走十进制，避免 15000 × 0.001 × 66501.1 显示成 997516.5000000001 */
  function decMul(a, b) {
    var s = MMCalculation.sbcmul(String(a == null ? 0 : a), String(b == null ? 0 : b), 10);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  function statusToggle(row, field, yes, no) {
    var value = row[field];
    var on = parseInt(value, 10) === yes;
    return "<a href='javascript:;' class='toggle-link btn-list-toggle' data-pid='" + row.pid +
      "' data-field='" + field + "' data-yes='" + yes + "' data-no='" + no + "'>" +
      "<i class='fa fa-toggle-on " + (on ? 'text-success' : 'fa-flip-horizontal text-gray') + " fa-2x'></i></a>";
  }

  function strategyFmt(v) {
    switch (parseInt(v, 10)) {
      case 1: return '平均';
      case 2: return '最优';
      case 3: return '最差';
      default: return v;
    }
  }

  function benchmarkTypeFmt(v) {
    switch (parseInt(v, 10)) {
      case 6: return '对标系数价缓存(6)';
      case 1: return '对标系数价(1)';
      case 2: return '标记价格(2)';
      case 3: return '指数价格(3)';
      case 4: return '盘口价(4)';
      case 5: return '最新价(5)';
      default: return v;
    }
  }

  function depthOptFmt(v) {
    switch (parseInt(v, 10)) {
      case 0: return '关闭(0)';
      case 1: return '激活深度系数(1)';
      case 2: return '激活限价优化方案(2)';
      case 3: return '激活快速消费(3)';
      default: return v;
    }
  }

  function moveQtyFmt(val, row) {
    return '<span class="red">' + decMul(val, row.contract_value) + '</span>';
  }

  function moveAmountFmt(val, row) {
    var cVolume = decMul(row.move_position_qty, row.contract_value);
    return '<span class="green">' + decMul(cVolume, row.mark_price) + 'U</span>';
  }

  function symbolFmt(value, row) {
    return String(value).toUpperCase() + '(' + row.symbol_id + ')';
  }

  function operateFmt(row) {
    return "<a href='javascript:;' class='btn btn-xs btn-success btn-list-edit' data-pid='" + row.pid + "'>" +
      "<i class='fa fa-pencil'></i></a>";
  }

  function getRow(pid) {
    return state.list.find(function (r) { return r.pid === pid; });
  }

  function render() {
    var tbody = document.getElementById('list_tbody');
    if (!tbody) return;

    tbody.innerHTML = state.list.map(function (row) {
      var cls = row.pid === state.activePid ? ' class="active"' : '';
      return '<tr data-pid="' + row.pid + '"' + cls + '>' +
        '<td>' + row.pid + '</td>' +
        '<td>' + symbolFmt(row.symbol, row) + '</td>' +
        '<td>' + statusToggle(row, 'status', 1, 2) + '</td>' +
        '<td>' + (row.maker_tag || '') + '</td>' +
        '<td>' + precisionToFixed(row.mark_price) + '</td>' +
        '<td>' + (row.benchmark_exchange || '') + '</td>' +
        '<td>' + strategyFmt(row.strategy) + '</td>' +
        '<td>' + benchmarkTypeFmt(row.benchmark_type) + '</td>' +
        '<td>' + depthOptFmt(row.depth_optimization) + '</td>' +
        '<td>' + row.trading_gap + '</td>' +
        '<td>' + row.contract_ratio + '</td>' +
        '<td>' + row.leverage + '</td>' +
        '<td>' + statusToggle(row, 'is_knock', 1, 0) + '</td>' +
        '<td>' + moveQtyFmt(row.move_position_qty, row) + '</td>' +
        '<td>' + moveAmountFmt(null, row) + '</td>' +
        '<td>' + (row.paving_ratio || '') + '</td>' +
        '<td>' + precisionToFixed(row.contract_value) + '</td>' +
        '<td>' + precisionToFixed(row.price_step) + '</td>' +
        '<td>' + row.price_precision + '</td>' +
        '<td>' + (row.st_unit || '') + '</td>' +
        '<td>' + operateFmt(row) + '</td>' +
        '</tr>';
    }).join('');

    bindEvents();
  }

  function selectPid(pid, silent) {
    pid = parseInt(pid, 10);
    if (!getRow(pid)) return;
    state.activePid = pid;
    render();
    var label = document.getElementById('active_pid_label');
    if (label) label.textContent = pid;
    if (!silent && typeof state.onSelect === 'function') {
      state.onSelect(getRow(pid));
    }
  }

  function bindEvents() {
    $('#list_tbody').off('click', 'tr').on('click', 'tr', function (e) {
      if ($(e.target).closest('.btn-list-toggle, .btn-list-edit').length) return;
      selectPid($(this).data('pid'));
    });

    $('#list_tbody').off('click', '.btn-list-toggle').on('click', '.btn-list-toggle', function (e) {
      e.stopPropagation();
      var pid = parseInt($(this).data('pid'), 10);
      var field = $(this).data('field');
      var yes = parseInt($(this).data('yes'), 10);
      var no = parseInt($(this).data('no'), 10);
      var row = getRow(pid);
      if (!row) return;
      row[field] = parseInt(row[field], 10) === yes ? no : yes;
      render();
      if (pid === state.activePid && typeof state.onSelect === 'function') {
        state.onSelect(row);
      }
    });

    $('#list_tbody').off('click', '.btn-list-edit').on('click', '.btn-list-edit', function (e) {
      e.stopPropagation();
      selectPid($(this).data('pid'));
      alert('本地模式：铺单任务参数请编辑 JSON 中 list[] 对应项');
    });
  }

  function setData(list, activePid) {
    state.list = list || [];
    if (activePid) {
      selectPid(activePid, true);
    } else if (state.list.length) {
      selectPid(state.list[0].pid, true);
    } else {
      render();
    }
  }

  function onSelect(fn) {
    state.onSelect = fn;
  }

  global.MMList = {
    setData: setData,
    render: render,
    selectPid: selectPid,
    onSelect: onSelect,
    getActiveRow: function () { return getRow(state.activePid); },
    getActivePid: function () { return state.activePid; }
  };
})(window);
