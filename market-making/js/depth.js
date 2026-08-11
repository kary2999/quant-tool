/**
 * 深度图 — 移植 quant-admin mx_market_making_box/depthchat.html
 */
(function (global) {
  'use strict';

  var timer = null;
  var chart = null;
  var asksData = [];
  var bidsData = [];

  var depthObject = {
    chart: { type: 'area' },
    title: { text: '' },
    xAxis: {
      title: { text: '价格' },
      minPadding: 0,
      maxPadding: 0
    },
    yAxis: [
      {
        title: { text: '价格' },
        lineWidth: 1,
        gridLineWidth: 1,
        labels: { align: 'left', x: 8 },
        opposite: true,
        reversed: false
      },
      {
        title: { text: '深度' },
        lineWidth: 1,
        gridLineWidth: 1,
        labels: { align: 'right', x: -8 },
        opposite: false
      },
      {
        title: { text: '盘口差' },
        lineWidth: 2,
        gridLineWidth: 3,
        labels: { align: 'center', x: 8, y: 8 },
        reversed: false,
        opposite: false
      }
    ],
    legend: { enabled: false },
    plotOptions: {
      area: { fillOpacity: 0.2, lineWidth: 1, step: 'center' }
    },
    tooltip: {
      headerFormat: '<span style="font-size=10px;">{point.key} </span>',
      valueDecimals: 2,
      backgroundColor: '#FCFFC5',
      borderColor: 'black',
      borderRadius: 10,
      borderWidth: 3,
      shadow: true,
      animation: true,
      style: {
        color: 'rgba(255,0,0,0.78)',
        fontSize: '12px',
        fontWeight: 'bold',
        fontFamily: 'Courier new'
      },
      formatter: function () {
        var depthAnalyze = $('#depth_analyze').val() || '';
        return ' * <strong>' + this.x + '</strong> <br>' + depthAnalyze;
      }
    },
    series: [
      { type: 'area', name: '买盘', color: 'rgba(55,255,0,0.84)', yAxis: 0, data: [] },
      { type: 'area', name: '卖盘', color: '#fc5857', yAxis: 1, data: [] },
      { type: 'line', name: '盘口差', yAxis: 2, data: [], tooltip: { valueSuffix: '盘口差' } }
    ]
  };

  function depthChatChange(asksDepthData, bidsDepthData) {
    if (!chart) return;
    chart.series[0].setData(bidsDepthData || []);
    chart.series[1].setData(asksDepthData || []);
  }

  function renderStats(stats) {
    if (!stats) return;
    var html =
      "<div style='float:left;margin-right:15px;font-size:15px;'>" +
      "  <a class='red'>AP " + stats.ask_price + "</a> <strong class='white'>/</strong> " +
      "  <a class='green'>BP " + stats.bid_price + "</a><br/>" +
      "  <a class='blue'>MP " + stats.mark_price + "</a> <strong class='white'>/</strong> " +
      "  <a class='orange'>Cap " + stats.diff_price + "‱</a>" +
      "</div>" +
      "<div style='float:right;font-size:15px;'>" +
      "  <a class='red'> AV -" + stats.ask_qty + "</a> <strong class='white'>/</strong> " +
      "  <a class='green'> BV +" + stats.bid_qty + "</a><br/>" +
      "  <a class='blue'> UV " + stats.uid_num + "</a> <strong class='white'>/</strong> " +
      "  <a class='orange'> TV " + stats.order_num + "</a>" +
      "</div>";
    $('#stats_info').html(html);

    if (stats.mark_price && global.MMTable) {
      global.MMTable.setMarkPrice(stats.mark_price);
    }
  }

  function getMarketData() {
    var url = $('#market_monitor').val();
    var sid = $('#symbol_id').val();
    $.ajax({
      url: url + '?symbol_id=' + sid,
      processData: false,
      dataType: 'json',
      async: true,
      success: function (json) {
        if (!json || !json.data) return;
        var stats = json.data.stats;
        $('#depth_analyze').val(json.data.depth_analyze || '');
        renderStats(stats);
        asksData = json.data.asks || [];
        bidsData = json.data.bids || [];
        depthChatChange(asksData, bidsData);
      },
      error: function () {
        if (global.QUANT_TOOLS_MOCK && global.QUANT_TOOLS_MOCK.depth) {
          var json = global.QUANT_TOOLS_MOCK.depth;
          if (json && json.data) {
            renderStats(json.data.stats);
            $('#depth_analyze').val(json.data.depth_analyze || '');
            depthChatChange(json.data.asks || [], json.data.bids || []);
            return;
          }
        }
      }
    });
  }

  function timeGetMarket() {
    if (timer) return;
    timer = setInterval(getMarketData, 500);
    getMarketData();
  }

  function stopMarket() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function initChart() {
    chart = Highcharts.chart('container', depthObject);
  }

  function bindEvents() {
    $('#symbol_id').on('change', function () {
      getMarketData();
      if (global.MMApp) global.MMApp.reloadBoxData();
    });
    $('#market_monitor').on('change', getMarketData);
  }

  global.MMDepth = {
    init: function () {
      initChart();
      bindEvents();
      timeGetMarket();
    },
    refresh: getMarketData,
    stop: stopMarket,
    getMarkPriceFromStats: function () {
      var mp = $('#stats_info .blue').first().text();
      var m = mp && mp.match(/MP\s+([\d.]+)/);
      return m ? parseFloat(m[1]) : 0;
    }
  };
})(window);
