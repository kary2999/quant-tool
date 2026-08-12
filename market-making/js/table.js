/**
 * 网格配置表格 — 移植 quant-admin mx_market_making_box.js
 */
(function (global) {
  'use strict';

  var state = {
    listRow: null,
    boxes: [],
    markPrice: 0
  };

  function directionFmt(val) {
    return parseInt(val, 10) === 1
      ? '<span class="green">买盘</span>'
      : '<span class="red">卖盘</span>';
  }

  function trustNumFmt(v, row) {
    return '<span class="green">' + v + '</span> / <span class="red">' + row.price_num + '</span>';
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function warnBadge(row) {
    if (!row.warnings || !row.warnings.length) return '';
    return ' <i class="fa fa-exclamation-triangle box-warn" title="' +
      escAttr(row.warnings.join('\n')) + '"></i>';
  }

  /**
   * 价格区间按「近盘口 → 远盘口」展示。
   * 买盘越靠近盘口价越高，卖盘越靠近盘口价越低，所以两侧的箭头方向天然相反。
   */
  function priceFloatFmt(v, row) {
    var pct = row.near_pct + '% → ' + row.far_pct + '%';
    if (row.price_float_normalized && row.price_float_normalized !== v) {
      pct += ' <s class="text-muted">' + v + '</s>';
    }
    return pct + warnBadge(row) +
      '<br/><a class="price-abs">' + row.near_price + '</a>' +
      ' <span class="text-muted">→</span> ' +
      '<a class="price-abs">' + row.far_price + '</a>';
  }

  function numberFloatFmt(v, row) {
    return v + '<br/><a class="price-abs">' + row.min_number + '</a> - <a class="price-abs">' + row.max_number + '</a>';
  }

  function changeNumberFmt(v, row) {
    return v + '<br/><a class="price-abs">' + row.min_change_number + '</a> - <a class="price-abs">' + row.max_change_number + '</a>';
  }

  function statusFmt(value) {
    var on = parseInt(value, 10) === 1;
    return "<a href='javascript:;' class='toggle-link btn-change' data-status='" + value + "'>" +
      "<i class='fa fa-toggle-on " + (on ? 'text-success' : 'fa-flip-horizontal text-gray') + " fa-2x'></i></a>";
  }

  function operateFmt(row) {
    return "<a href='javascript:;' class='btn btn-xs btn-success btn-edit-row' data-id='" + row.box_id + "' title='编辑'>" +
      "<i class='fa fa-pencil'></i></a>";
  }

  function getCtx() {
    var row = state.listRow || {};
    return {
      markPrice: state.markPrice,
      contractValue: row.contract_value || 1,
      pricePrecision: row.price_precision || 2,
      numberPrecision: row.number_precision || 3
    };
  }

  function renderPreview(box) {
    var enriched = MMCalculation.enrichBox(box, getCtx());
    var html = '价档 ' + enriched.price_num +
      ' · 近盘口 ' + enriched.near_price + ' → 远端 ' + enriched.far_price +
      '<br/>固量 ' + enriched.min_number + ' ~ ' + enriched.max_number;
    if (enriched.warnings.length) {
      html += '<div class="preview-warn">' + enriched.warnings.map(function (w) {
        return '<i class="fa fa-exclamation-triangle"></i> ' + escAttr(w);
      }).join('<br/>') + '</div>';
    }
    return html;
  }

  function openEditModal(box) {
    $('#edit_box_id').val(box.box_id);
    $('#edit_pid').val(box.pid);
    $('#edit_direction').val(String(box.direction));
    $('#edit_dom').val(box.dom);
    $('#edit_trust_num').val(box.trust_num);
    $('#edit_price_float').val(box.price_float);
    $('#edit_number_float').val(box.number_float);
    $('#edit_change_trust_num').val(box.change_trust_num);
    $('#edit_change_number_float').val(box.change_number_float);
    $('#edit_change_survival_time').val(box.change_survival_time);
    $('#edit_preview').html(renderPreview(box));
    $('#box_edit_modal').modal('show');
  }

  function updatePreviewFromForm() {
    var draft = {
      box_id: parseInt($('#edit_box_id').val(), 10),
      pid: parseInt($('#edit_pid').val(), 10),
      direction: parseInt($('#edit_direction').val(), 10),
      dom: parseInt($('#edit_dom').val(), 10),
      trust_num: parseInt($('#edit_trust_num').val(), 10) || 0,
      price_float: $('#edit_price_float').val(),
      number_float: $('#edit_number_float').val(),
      change_trust_num: parseInt($('#edit_change_trust_num').val(), 10) || 0,
      change_number_float: $('#edit_change_number_float').val(),
      change_survival_time: $('#edit_change_survival_time').val(),
      status: 1
    };
    $('#edit_preview').html(renderPreview(draft));
  }

  function saveEditForm(e) {
    e.preventDefault();
    var boxId = parseInt($('#edit_box_id').val(), 10);
    var box = state.boxes.find(function (b) { return b.box_id === boxId; });
    if (!box) return;

    box.direction = parseInt($('#edit_direction').val(), 10);
    box.trust_num = parseInt($('#edit_trust_num').val(), 10) || 0;
    box.price_float = $('#edit_price_float').val();
    box.number_float = $('#edit_number_float').val();
    box.change_trust_num = parseInt($('#edit_change_trust_num').val(), 10) || 0;
    box.change_number_float = $('#edit_change_number_float').val();
    box.change_survival_time = $('#edit_change_survival_time').val();

    $('#box_edit_modal').modal('hide');
    render();
  }

  var COL_COUNT = 11;

  function dataRow(row) {
    return '<tr data-box-id="' + row.box_id + '" class="' + (row.is_buy ? 'row-buy' : 'row-sell') + '">' +
      '<td>' + row.pid + '</td>' +
      '<td>' + directionFmt(row.direction) + '</td>' +
      '<td>' + row.dom + '</td>' +
      '<td>' + trustNumFmt(row.trust_num, row) + '</td>' +
      '<td>' + priceFloatFmt(row.price_float, row) + '</td>' +
      '<td>' + numberFloatFmt(row.number_float, row) + '</td>' +
      '<td>' + row.change_trust_num + '</td>' +
      '<td>' + changeNumberFmt(row.change_number_float, row) + '</td>' +
      '<td>' + row.change_survival_time + '</td>' +
      '<td>' + statusFmt(row.status) + '</td>' +
      '<td>' + operateFmt(row) + '</td>' +
      '</tr>';
  }

  function groupRow(cls, text) {
    return '<tr class="' + cls + '"><td colspan="' + COL_COUNT + '">' + text + '</td></tr>';
  }

  /** 盘口分隔行：把买卖是否重叠直接摆在两组中间 */
  function spreadRow(cross) {
    if (!cross) return '';
    var cls = cross.crossed ? 'row-spread crossed' : 'row-spread';
    var icon = cross.crossed ? '<i class="fa fa-exclamation-triangle"></i> ' : '';
    return groupRow(cls, icon + cross.message);
  }

  function render() {
    var tbody = document.getElementById('box_tbody');
    if (!tbody) return;

    var ctx = getCtx();
    var rows = state.boxes.map(function (box) { return MMCalculation.enrichBox(box, ctx); });
    var cross = MMCalculation.checkCross(rows);

    // 订单簿式布局：卖盘在上（远→近），买盘在下（近→远），盘口居中
    var sells = rows.filter(function (r) { return !r.is_buy; })
      .sort(function (a, b) { return b.dom - a.dom; });
    var buys = rows.filter(function (r) { return r.is_buy; })
      .sort(function (a, b) { return a.dom - b.dom; });

    var html = '';
    if (sells.length) {
      html += groupRow('row-group group-sell', '卖盘 · 挂在盘口上方，越靠近盘口价格越低（下方为第 1 层）');
      html += sells.map(dataRow).join('');
    }
    html += spreadRow(cross);
    if (buys.length) {
      html += groupRow('row-group group-buy', '买盘 · 挂在盘口下方，越靠近盘口价格越高（上方为第 1 层）');
      html += buys.map(dataRow).join('');
    }

    tbody.innerHTML = html;
    bindRowEvents();
  }

  function bindRowEvents() {
    $('#box_tbody').off('click', '.btn-change').on('click', '.btn-change', function () {
      var tr = $(this).closest('tr');
      var boxId = parseInt(tr.data('box-id'), 10);
      var box = state.boxes.find(function (b) { return b.box_id === boxId; });
      if (!box) return;
      box.status = parseInt(box.status, 10) === 1 ? 2 : 1;
      render();
    });

    $('#box_tbody').off('click', '.btn-edit-row').on('click', '.btn-edit-row', function () {
      var boxId = parseInt($(this).data('id'), 10);
      var box = state.boxes.find(function (b) { return b.box_id === boxId; });
      if (box) openEditModal(box);
    });
  }

  function bindModalEvents() {
    $('#box_edit_form').off('submit').on('submit', saveEditForm);
    $('#box_edit_form input, #box_edit_form select').off('input change').on('input change', updatePreviewFromForm);
  }

  function setContext(listRow, boxes) {
    state.listRow = listRow;
    state.boxes = boxes || [];
    if (listRow && listRow.mark_price) {
      state.markPrice = parseFloat(listRow.mark_price) || 0;
    }
    render();
  }

  /** 兼容旧 API：symbol + boxes 数组 */
  function setData(symbol, boxes) {
    state.listRow = symbol;
    state.boxes = boxes || [];
    if (symbol && symbol.mark_price) {
      state.markPrice = parseFloat(symbol.mark_price) || 0;
    }
    render();
  }

  function setMarkPrice(price) {
    var p = parseFloat(price);
    if (!p || isNaN(p)) return;
    state.markPrice = p;
    if (state.listRow) state.listRow.mark_price = p;
    var inp = document.getElementById('mark_price_input');
    if (inp) inp.value = p;
    render();
  }

  bindModalEvents();

  global.MMTable = {
    setData: setData,
    setContext: setContext,
    setMarkPrice: setMarkPrice,
    render: render,
    getMarkPrice: function () { return state.markPrice; },
    getBoxes: function () { return state.boxes; }
  };
})(window);
