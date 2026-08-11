/**
 * 铺单计算 — 移植自 quant-admin/application/admin/library/Calculation.php
 * 及 MxMarketMakingBox.php 中的挂单量/价格区间计算
 */
(function (global) {
  'use strict';

  var NUM_PRECISION = 10;

  function toStr(n) {
    if (n === null || n === undefined || n === '') return '0';
    return String(n);
  }

  function sbcadd(a, b, scale) {
    scale = scale === undefined ? NUM_PRECISION : scale;
    return (parseFloat(a) + parseFloat(b)).toFixed(scale);
  }

  function sbcsub(a, b, scale) {
    scale = scale === undefined ? NUM_PRECISION : scale;
    return (parseFloat(a) - parseFloat(b)).toFixed(scale);
  }

  function sbcmul(a, b, scale) {
    scale = scale === undefined ? NUM_PRECISION : scale;
    return (parseFloat(a) * parseFloat(b)).toFixed(scale);
  }

  function sbcdiv(a, b, scale) {
    scale = scale === undefined ? NUM_PRECISION : scale;
    var denom = parseFloat(b);
    if (!denom) return '0';
    return (parseFloat(a) / denom).toFixed(scale);
  }

  /** 精度最小价位单位：10^(-precision) */
  function minNumber(precision) {
    var p = parseInt(precision, 10) || 0;
    return sbcdiv(1, Math.pow(10, p), p);
  }

  /** 截取到指定小数位（不四舍五入，等同 PHP bcadd($n,"0",$digit)） */
  function interceptNumber(number, digit) {
    var d = parseInt(digit, 10) || 0;
    var n = parseFloat(number);
    if (isNaN(n)) return '0';
    var factor = Math.pow(10, d);
    var truncated = Math.trunc(n * factor) / factor;
    return truncated.toFixed(d).replace(/\.?0+$/, function (m) {
      return m.indexOf('.') >= 0 ? '' : m;
    });
  }

  function formatNumber(number, decimalPlaces) {
    decimalPlaces = decimalPlaces === undefined ? 8 : decimalPlaces;
    var n = parseFloat(number);
    if (isNaN(n)) return '0';
    var s = n.toFixed(decimalPlaces).replace(/\.?0+$/, '');
    var parts = s.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts[1] ? intPart + '.' + parts[1] : intPart;
  }

  function parseRange(str) {
    if (!str || str.indexOf('-') < 0) return [0, 0];
    var parts = String(str).split('-');
    return [parseFloat(parts[0]), parseFloat(parts[1])];
  }

  /**
   * 计算单条 box 的衍生字段（对应 MxMarketMakingBox::index）
   * @param {object} box 原始 box 行
   * @param {object} ctx { markPrice, contractValue, pricePrecision, numberPrecision }
   */
  function enrichBox(box, ctx) {
    var markPrice = parseFloat(ctx.markPrice) || 0;
    var contractValue = parseFloat(ctx.contractValue) || 1;
    var pricePrecision = parseInt(ctx.pricePrecision, 10) || 2;
    var minPriceNumber = minNumber(pricePrecision);

    var priceRange = parseRange(box.price_float);
    var numberRange = parseRange(box.number_float);
    var changeRange = parseRange(box.change_number_float);

    var minPriceRate = priceRange[0];
    var maxPriceRate = priceRange[1];
    var minNumberCfg = numberRange[0];
    var maxNumberCfg = numberRange[1];
    var changeMin = changeRange[0];
    var changeMax = changeRange[1];

    var minPrice = sbcmul(markPrice, minPriceRate / 100, NUM_PRECISION);
    var maxPrice = sbcmul(markPrice, maxPriceRate / 100, NUM_PRECISION);
    var priceNum = Math.floor(parseFloat(sbcdiv(sbcsub(maxPrice, minPrice, NUM_PRECISION), minPriceNumber, 10)));

    var minQty = sbcmul(minNumberCfg, contractValue, NUM_PRECISION);
    var maxQty = sbcmul(maxNumberCfg, contractValue, NUM_PRECISION);
    var minChangeQty = sbcmul(changeMin, contractValue, NUM_PRECISION);
    var maxChangeQty = sbcmul(changeMax, contractValue, NUM_PRECISION);

    return Object.assign({}, box, {
      mark_price: markPrice,
      contract_value: contractValue,
      price_precision: pricePrecision,
      number_precision: ctx.numberPrecision,
      min_price: interceptNumber(minPrice, pricePrecision),
      max_price: interceptNumber(maxPrice, pricePrecision),
      price_num: priceNum,
      min_number: formatNumber(minQty),
      max_number: formatNumber(maxQty),
      min_change_number: formatNumber(minChangeQty),
      max_change_number: formatNumber(maxChangeQty)
    });
  }

  function enrichBoxes(boxes, ctx) {
    return boxes.map(function (b) { return enrichBox(b, ctx); });
  }

  global.MMCalculation = {
    minNumber: minNumber,
    interceptNumber: interceptNumber,
    formatNumber: formatNumber,
    parseRange: parseRange,
    enrichBox: enrichBox,
    enrichBoxes: enrichBoxes,
    sbcmul: sbcmul,
    sbcdiv: sbcdiv,
    sbcsub: sbcsub
  };
})(window);
