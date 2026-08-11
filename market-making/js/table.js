/**
 * 铺单表格 — 移植 quant-admin mx_market_making_box.js 列展示
 */
(function (global) {
  'use strict';

  var state = {
    symbol: null,
    boxes: [],
    markPrice: 0
  };

  function directionFmt(val) {
    return parseInt(val, 10) === 1
      ? '<span style="color:green">买盘</span>'
      : '<span style="color:red">卖盘</span>';
  }

  function trustNumFmt(v, row) {
    return '<span style="color:green">' + v + '</span> / <span style="color:red;">' + row.price_num + '</span>';
  }

  function priceFloatFmt(v, row) {
    return v + '<br/><a class="price-abs">' + row.min_price + '</a> - <a class="price-abs">' + row.max_price + '</a>';
  }

  function numberFloatFmt(v, row) {
    return v + '<br/><a class="price-abs">' + row.min_number + '</a> - <a class="price-abs">' + row.max_number + '</a>';
  }

  function changeNumberFmt(v, row) {
    return v + '<br/><a class="price-abs">' + row.min_change_number + '</a> - <a class="price-abs">' + row.max_change_number + '</a>';
  }

  function statusFmt(value) {
    var yes = 1;
    var no = 2;
    var on = parseInt(value, 10) === yes;
    return "<a href='javascript:;' title='点击切换' class='btn-change' data-status='" + value + "'>" +
      "<i class='fa fa-toggle-on " + (on ? 'text-success' : 'fa-flip-horizontal text-gray') + " fa-2x'></i></a>";
  }

  function operateFmt(row) {
    return "<a href='javascript:;' class='btn btn-xs btn-success btn-edit-row' data-id='" + row.box_id + "' title='编辑'>" +
      "<i class='fa fa-pencil'></i></a>";
  }

  function getCtx() {
    return {
      markPrice: state.markPrice,
      contractValue: state.symbol ? state.symbol.contract_value : 1,
      pricePrecision: state.symbol ? state.symbol.price_precision : 2,
      numberPrecision: state.symbol ? state.symbol.number_precision : 3
    };
  }

  function sortBoxes(boxes) {
    return boxes.slice().sort(function (a, b) {
      if (a.dom !== b.dom) return a.dom - b.dom;
      return a.direction - b.direction;
    });
  }

  function render() {
    var tbody = document.getElementById('box_tbody');
    if (!tbody) return;

    var sorted = sortBoxes(state.boxes);
    var rows = sorted.map(function (box) {
      return MMCalculation.enrichBox(box, getCtx());
    });

    tbody.innerHTML = rows.map(function (row) {
      return '<tr data-box-id="' + row.box_id + '">' +
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
    }).join('');

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
      var boxId = $(this).data('id');
      var box = state.boxes.find(function (b) { return b.box_id === boxId; });
      if (!box) return;
      alert('本地模式：请直接编辑 JSON 配置文件\n\nbox_id: ' + boxId +
        '\nprice_float: ' + box.price_float +
        '\nnumber_float: ' + box.number_float);
    });
  }

  function setData(symbol, boxes) {
    state.symbol = symbol;
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
    var inp = document.getElementById('mark_price_input');
    if (inp) inp.value = p;
    render();
  }

  global.MMTable = {
    setData: setData,
    setMarkPrice: setMarkPrice,
    render: render,
    getMarkPrice: function () { return state.markPrice; }
  };
})(window);
