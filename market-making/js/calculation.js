/**
 * 铺单计算 — 对照 quant-admin/application/admin/controller/MxMarketMakingBox.php::index()
 * 与 application/admin/library/Calculation.php（bcmath）
 *
 * 两条与 PHP 对齐的关键语义：
 *   1. bcmath 是十进制定点运算，截断方向恒为「趋零」，不是四舍五入、也不是 floor。
 *      用 double 复刻会出错，例如 0.29 截断到 2 位会得到 0.28。这里用 BigInt 定点实现。
 *   2. price_num 取 (max_price - min_price) / tick，且用的是**未按精度截断**的原始乘积，
 *      与 PHP 中 intercept 发生在 price_num 之后的顺序一致。
 *
 * price_float 的区间方向：quant-admin 在 edit() 里强制 min <= max 入库，
 * 但历史数据与手工 JSON 常按「由盘口向外」书写，买盘会写成 99.995-99.7。
 * 参照 quant_monitor/mm_app.js::realAbsoluteSpreadFromPriceFloat 的做法统一归一化为
 * 低-高，避免算出负的价档数；同时把归一化过的行标记出来，不静默吞掉。
 *
 * 买卖的方向语义（存储恒为低-高，但读法相反）：
 *   买盘挂在盘口下方，越靠近盘口价格越高 → 近端 = 区间上界
 *   卖盘挂在盘口上方，越靠近盘口价格越低 → 近端 = 区间下界
 * 因此 enrichBox 额外给出 near_/far_ 字段，供表格按「近盘口 → 远盘口」展示，
 * 而 min_/max_ 保持与后台 quant-admin 同名字段一致，便于对账。
 */
(function (global) {
  'use strict';

  var NUM_PRECISION = 10;  // 对齐 Calculation::NUM_PRECISION
  var SCALE = 30;          // 内部定点标度，取足够大以避免中间步骤丢精度
  var HAS_BIGINT = typeof BigInt !== 'undefined';

  function pow10(n) { return BigInt(10) ** BigInt(n); }

  /** 十进制字符串 → 标度为 SCALE 的定点整数 */
  function toFixedInt(value) {
    var s = String(value === null || value === undefined || value === '' ? '0' : value).trim();
    if (!/^[+-]?\d*(\.\d*)?$/.test(s)) {
      var n = parseFloat(s);
      s = isNaN(n) ? '0' : n.toFixed(SCALE);
    }
    var neg = s.charAt(0) === '-';
    if (neg || s.charAt(0) === '+') s = s.slice(1);
    var parts = s.split('.');
    var int = parts[0] || '0';
    var frac = (parts[1] || '').slice(0, SCALE);
    while (frac.length < SCALE) frac += '0';
    var v = BigInt(int || '0') * pow10(SCALE) + BigInt(frac || '0');
    return neg ? -v : v;
  }

  function clampScale(scale) {
    var s = parseInt(scale, 10);
    if (isNaN(s) || s < 0) return 0;
    return s > SCALE ? SCALE : s;
  }

  /** 趋零截断到 scale 位小数（bcmath 的截断语义） */
  function truncFixed(v, scale) {
    var unit = pow10(SCALE - clampScale(scale));
    return (v / unit) * unit; // BigInt 除法本身即趋零截断
  }

  /** 定点整数 → 十进制字符串，保留恰好 scale 位小数（同 bcmath 输出） */
  function fromFixedInt(v, scale) {
    var neg = v < BigInt(0);
    if (neg) v = -v;
    var s = v.toString();
    while (s.length <= SCALE) s = '0' + s;
    var int = s.slice(0, s.length - SCALE);
    var frac = s.slice(s.length - SCALE).slice(0, clampScale(scale));
    return (neg ? '-' : '') + (frac.length ? int + '.' + frac : int);
  }

  function bcOp(fn) {
    return function (a, b, scale) {
      scale = scale === undefined ? NUM_PRECISION : scale;
      if (!HAS_BIGINT) return floatFallback(fn, a, b, scale);
      return fromFixedInt(truncFixed(fn(toFixedInt(a), toFixedInt(b)), scale), scale);
    };
  }

  function floatFallback(fn, a, b, scale) {
    var x = parseFloat(a) || 0, y = parseFloat(b) || 0;
    var r = fn === OP_ADD ? x + y : fn === OP_SUB ? x - y : fn === OP_MUL ? x * y : (y ? x / y : 0);
    return r.toFixed(scale);
  }

  function OP_ADD(a, b) { return a + b; }
  function OP_SUB(a, b) { return a - b; }
  function OP_MUL(a, b) { return (a * b) / pow10(SCALE); }
  function OP_DIV(a, b) { return b === BigInt(0) ? BigInt(0) : (a * pow10(SCALE)) / b; }

  var sbcadd = bcOp(OP_ADD);
  var sbcsub = bcOp(OP_SUB);
  var sbcmul = bcOp(OP_MUL);
  var sbcdiv = bcOp(OP_DIV);

  /** 比较两个十进制字符串，语义同 bccomp */
  function sbccomp(a, b) {
    if (!HAS_BIGINT) {
      var x = parseFloat(a) || 0, y = parseFloat(b) || 0;
      return x === y ? 0 : (x < y ? -1 : 1);
    }
    var A = toFixedInt(a), B = toFixedInt(b);
    return A === B ? 0 : (A < B ? -1 : 1);
  }

  /** 当前精度下的最小价位单位：10^(-precision) */
  function minNumber(precision) {
    var p = clampScale(precision);
    return sbcdiv('1', '1' + new Array(p + 1).join('0'), p);
  }

  /** 截断到指定小数位并保留该位数，等同 PHP bcadd($n, "0", $digit) */
  function interceptNumber(number, digit) {
    var d = parseInt(digit, 10) || 0;
    if (!HAS_BIGINT) return (parseFloat(number) || 0).toFixed(d);
    return fromFixedInt(truncFixed(toFixedInt(number), d), d);
  }

  /** 等同 MxMarketMakingBox::format_number：截断 8 位、去尾零、加千分位 */
  function formatNumber(number, decimalPlaces) {
    var dp = decimalPlaces === undefined ? 8 : decimalPlaces;
    var s = interceptNumber(number, dp);
    var parts = s.split('.');
    var frac = (parts[1] || '').replace(/0+$/, '');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return frac ? int + '.' + frac : int;
  }

  /**
   * 解析 "a-b" 区间。只按第一个 '-' 切分（与 PHP explode 限制一致的正数场景），
   * 返回归一化后的 lo/hi 以及是否发生过交换。
   */
  function parseRangeParts(str) {
    var raw = String(str === null || str === undefined ? '' : str).replace(/\s/g, '');
    var i = raw.indexOf('-');
    if (i <= 0) return { lo: '0', hi: '0', swapped: false, valid: false };
    var a = raw.slice(0, i);
    var b = raw.slice(i + 1);
    if (a === '' || b === '') return { lo: '0', hi: '0', swapped: false, valid: false };
    var swapped = sbccomp(a, b) > 0;
    return {
      lo: swapped ? b : a,
      hi: swapped ? a : b,
      swapped: swapped,
      valid: true
    };
  }

  /** 兼容旧签名：返回 [lo, hi] 数值，已归一化 */
  function parseRange(str) {
    var p = parseRangeParts(str);
    return [parseFloat(p.lo), parseFloat(p.hi)];
  }

  /**
   * 计算单条 box 的衍生字段（对应 MxMarketMakingBox::index）
   * @param {object} box 原始 box 行
   * @param {object} ctx { markPrice, contractValue, pricePrecision, numberPrecision }
   */
  function enrichBox(box, ctx) {
    var markPrice = String(ctx.markPrice || 0);
    var contractValue = String(ctx.contractValue === undefined || ctx.contractValue === null ? 1 : ctx.contractValue);
    var pricePrecision = parseInt(ctx.pricePrecision, 10);
    if (isNaN(pricePrecision) || pricePrecision < 0) pricePrecision = 2;
    var tick = minNumber(pricePrecision);
    var direction = parseInt(box.direction, 10);

    var price = parseRangeParts(box.price_float);
    var number = parseRangeParts(box.number_float);
    var change = parseRangeParts(box.change_number_float);

    var warnings = collectWarnings(box, direction, price, number, change, markPrice);

    // 与 PHP 顺序一致：先用未截断的乘积算价档数，再对显示价截断
    var minPriceRaw = sbcmul(markPrice, sbcdiv(price.lo, 100, NUM_PRECISION));
    var maxPriceRaw = sbcmul(markPrice, sbcdiv(price.hi, 100, NUM_PRECISION));
    var priceNum = sbcdiv(sbcsub(maxPriceRaw, minPriceRaw), tick, 0);

    var minPrice = interceptNumber(minPriceRaw, pricePrecision);
    var maxPrice = interceptNumber(maxPriceRaw, pricePrecision);
    var isBuy = direction === 1;

    return Object.assign({}, box, {
      mark_price: parseFloat(markPrice),
      contract_value: parseFloat(contractValue),
      price_precision: pricePrecision,
      number_precision: ctx.numberPrecision,
      is_buy: isBuy,
      min_price: minPrice,
      max_price: maxPrice,
      near_price: isBuy ? maxPrice : minPrice,
      far_price: isBuy ? minPrice : maxPrice,
      near_pct: isBuy ? price.hi : price.lo,
      far_pct: isBuy ? price.lo : price.hi,
      price_num: priceNum,
      min_number: formatNumber(sbcmul(number.lo, contractValue)),
      max_number: formatNumber(sbcmul(number.hi, contractValue)),
      min_change_number: formatNumber(sbcmul(change.lo, contractValue)),
      max_change_number: formatNumber(sbcmul(change.hi, contractValue)),
      price_float_normalized: price.valid ? price.lo + '-' + price.hi : box.price_float,
      warnings: warnings
    });
  }

  /** 复刻 MxMarketMakingBox::edit() 的入库校验，不阻断渲染，只标记 */
  function collectWarnings(box, direction, price, number, change, markPrice) {
    var w = [];
    if (sbccomp(markPrice, '0') <= 0) {
      w.push('标记价为 0，绝对价与价档数无意义');
    }
    if (!price.valid) {
      w.push('price_float 格式异常：' + box.price_float);
      return w;
    }
    if (price.swapped) {
      w.push('price_float 区间倒序（' + box.price_float + '），已归一化为 ' + price.lo + '-' + price.hi);
    }
    if (direction === 1 && sbccomp(price.hi, '100') > 0) {
      w.push('买盘价格区间不得高于 100，实为 ' + price.hi);
    }
    if (direction !== 1 && sbccomp(price.lo, '100') < 0) {
      w.push('卖盘价格区间不得低于 100，实为 ' + price.lo);
    }
    if (number.valid && number.swapped) {
      w.push('number_float 区间倒序（' + box.number_float + '），已归一化');
    }
    if (change.valid && change.swapped) {
      w.push('change_number_float 区间倒序（' + box.change_number_float + '），已归一化');
    }
    return w;
  }

  function enrichBoxes(boxes, ctx) {
    return boxes.map(function (b) { return enrichBox(b, ctx); });
  }

  /**
   * 跨行校验：卖盘最低价必须高于买盘最高价，否则买卖两侧价格重叠，
   * 铺出去会自成交。单行校验（买≤100/卖≥100）拦不住这种跨行问题。
   * @param {Array} rows enrichBox 的结果集合
   * @returns {{crossed: boolean, buyTop: string, sellBottom: string, message: string}|null}
   */
  function checkCross(rows) {
    var buyTop = null;   // 买盘最高价 = 各买盘近端价的最大值
    var sellBottom = null; // 卖盘最低价 = 各卖盘近端价的最小值

    rows.forEach(function (r) {
      if (parseInt(r.status, 10) !== 1) return; // 已关闭的盒子不铺单，不参与
      if (r.is_buy) {
        if (buyTop === null || sbccomp(r.near_price, buyTop) > 0) buyTop = r.near_price;
      } else {
        if (sellBottom === null || sbccomp(r.near_price, sellBottom) < 0) sellBottom = r.near_price;
      }
    });

    if (buyTop === null || sellBottom === null) return null;

    var crossed = sbccomp(sellBottom, buyTop) <= 0;
    return {
      crossed: crossed,
      buyTop: buyTop,
      sellBottom: sellBottom,
      message: crossed
        ? '买卖价格重叠：卖盘最低 ' + sellBottom + ' ≤ 买盘最高 ' + buyTop + '，铺单会自成交'
        : '盘口正常：买盘最高 ' + buyTop + ' < 卖盘最低 ' + sellBottom
    };
  }

  global.MMCalculation = {
    minNumber: minNumber,
    interceptNumber: interceptNumber,
    formatNumber: formatNumber,
    parseRange: parseRange,
    parseRangeParts: parseRangeParts,
    enrichBox: enrichBox,
    enrichBoxes: enrichBoxes,
    checkCross: checkCross,
    sbcadd: sbcadd,
    sbcmul: sbcmul,
    sbcdiv: sbcdiv,
    sbcsub: sbcsub,
    sbccomp: sbccomp
  };
})(window);
