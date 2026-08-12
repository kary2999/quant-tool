/**
 * 铺单计算回归测试
 *
 * 口径基准：quant-admin/application/admin/controller/MxMarketMakingBox.php::index()
 *          + application/admin/library/Calculation.php（bcmath，scale=10，截断趋零）
 *
 * 这里用一份**独立**的 BigInt 定点实现（refBc*）复刻 bcmath 作为 ground truth，
 * 不复用 calculation.js 的任何代码，避免"自己验自己"。
 *
 * 跑法：node market-making/test/calculation-test.js
 */
'use strict';

const path = require('path');
const fs = require('fs');

global.window = {};
require(path.join(__dirname, '..', 'js', 'calculation.js'));
const C = global.window.MMCalculation;

// ---------------------------------------------------------------- ground truth
const S = 40;
const P = (n) => 10n ** BigInt(n);

function refToBI(v) {
  let s = String(v == null || v === '' ? '0' : v).trim();
  const neg = s.startsWith('-');
  if (neg || s.startsWith('+')) s = s.slice(1);
  const [i = '0', f = ''] = s.split('.');
  const frac = (f + '0'.repeat(S)).slice(0, S);
  const out = BigInt(i || '0') * P(S) + BigInt(frac || '0');
  return neg ? -out : out;
}
function refTrunc(v, scale) {
  const unit = P(S - scale);
  return (v / unit) * unit;
}
function refStr(v, scale) {
  const neg = v < 0n;
  if (neg) v = -v;
  const s = v.toString().padStart(S + 1, '0');
  const i = s.slice(0, s.length - S);
  const f = s.slice(s.length - S).slice(0, scale);
  return (neg ? '-' : '') + (f.length ? `${i}.${f}` : i);
}
const refBcSub = (a, b, sc = 10) => refStr(refTrunc(refToBI(a) - refToBI(b), sc), sc);
const refBcMul = (a, b, sc = 10) => refStr(refTrunc((refToBI(a) * refToBI(b)) / P(S), sc), sc);
const refBcDiv = (a, b, sc = 10) => {
  const B = refToBI(b);
  if (B === 0n) return '0';
  return refStr(refTrunc((refToBI(a) * P(S)) / B, sc), sc);
};
const refIntercept = (n, d) => refStr(refTrunc(refToBI(n), d), d);
const refMinNumber = (p) => refBcDiv('1', '1' + '0'.repeat(p), p);
function refFormatNumber(n, dp = 8) {
  const s = refIntercept(n, dp);
  let [i, f = ''] = s.split('.');
  f = f.replace(/0+$/, '');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? `${i}.${f}` : i;
}
/** 复刻 PHP index() 的一行计算，输入必须是升序区间（PHP edit() 保证） */
function refRow(box, ctx) {
  const [loPct, hiPct] = String(box.price_float).split('-');
  const [loNum, hiNum] = String(box.number_float).split('-');
  const [loChg, hiChg] = String(box.change_number_float).split('-');
  const tick = refMinNumber(ctx.pricePrecision);
  const minPrice = refBcMul(String(ctx.markPrice), refBcDiv(loPct, '100', 18));
  const maxPrice = refBcMul(String(ctx.markPrice), refBcDiv(hiPct, '100', 18));
  return {
    min_price: refIntercept(minPrice, ctx.pricePrecision),
    max_price: refIntercept(maxPrice, ctx.pricePrecision),
    price_num: refBcDiv(refBcSub(maxPrice, minPrice), tick, 0),
    min_number: refFormatNumber(refBcMul(loNum, String(ctx.contractValue))),
    max_number: refFormatNumber(refBcMul(hiNum, String(ctx.contractValue))),
    min_change_number: refFormatNumber(refBcMul(loChg, String(ctx.contractValue))),
    max_change_number: refFormatNumber(refBcMul(hiChg, String(ctx.contractValue)))
  };
}

// ---------------------------------------------------------------- harness
let failed = 0;
let passed = 0;
function eq(actual, expected, name) {
  if (String(actual) === String(expected)) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        期望 ${expected}\n        实际 ${actual}`);
  }
}
function ok(cond, name, detail) {
  if (cond) { passed++; } else { failed++; console.log(`  FAIL  ${name}${detail ? '  ← ' + detail : ''}`); }
}
function group(title) { console.log('\n----- ' + title + ' -----'); }

// ---------------------------------------------------------------- 1. 与 PHP 逐位对齐
group('1. 与 PHP bcmath 逐位对齐（真实配置数据）');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'symbol-1000001.json'), 'utf8'));
let rowCount = 0;
for (const list of data.list) {
  const ctx = {
    markPrice: list.mark_price,
    contractValue: list.contract_value,
    pricePrecision: list.price_precision,
    numberPrecision: list.number_precision
  };
  for (const box of data.boxes[String(list.pid)] || []) {
    const got = C.enrichBox(box, ctx);
    const want = refRow(box, ctx);
    for (const k of Object.keys(want)) {
      eq(got[k], want[k], `pid${list.pid} box${box.box_id} ${k}`);
    }
    rowCount++;
  }
}
console.log(`  已比对 ${rowCount} 行 × 7 字段`);

// ---------------------------------------------------------------- 2. 价档数非负
group('2. 价档数不得为负（本次 bug 的直接症状）');
for (const list of data.list) {
  const ctx = {
    markPrice: list.mark_price, contractValue: list.contract_value,
    pricePrecision: list.price_precision, numberPrecision: list.number_precision
  };
  for (const box of data.boxes[String(list.pid)] || []) {
    const got = C.enrichBox(box, ctx);
    ok(Number(got.price_num) >= 0, `pid${list.pid} box${box.box_id} price_num >= 0`, `实际 ${got.price_num}`);
  }
}

// ---------------------------------------------------------------- 3. 配置数据自身合法
group('3. 配置数据符合 quant-admin edit() 的入库约束');
for (const pid of Object.keys(data.boxes)) {
  for (const box of data.boxes[pid]) {
    const [a, b] = String(box.price_float).split('-').map(Number);
    ok(a <= b, `box${box.box_id} price_float 升序`, `${box.price_float}`);
    if (parseInt(box.direction, 10) === 1) {
      ok(b <= 100, `box${box.box_id} 买盘上界 <= 100`, `${box.price_float}`);
    } else {
      ok(a >= 100, `box${box.box_id} 卖盘下界 >= 100`, `${box.price_float}`);
    }
  }
}

// ---------------------------------------------------------------- 4. 截断语义
group('4. interceptNumber 等同 bcadd($n,"0",$digit)');
// 4.1 浮点实现会把 0.29 截成 0.28，这是修复前的真实缺陷
eq(C.interceptNumber('0.29', 2), '0.29', 'interceptNumber(0.29, 2) 不受浮点误差影响');
eq(C.interceptNumber('1.005', 2), '1.00', 'interceptNumber(1.005, 2)');
eq(C.interceptNumber('8.115', 2), '8.11', 'interceptNumber(8.115, 2) 截断而非四舍五入');
// 4.2 bcadd 保留固定位数，不去尾零
eq(C.interceptNumber('65969.0000000000', 1), '65969.0', '保留尾零 65969.0');
eq(C.interceptNumber('100.0000000000', 2), '100.00', '保留尾零 100.00');
eq(C.interceptNumber('3449.9000000000', 2), '3449.90', '保留尾零 3449.90');
// 4.3 负数按趋零截断，不是 floor
eq(C.interceptNumber('-1.9', 0), '-1', '负数趋零截断（非 floor 的 -2）');
eq(C.sbcdiv('-196.177', '0.1', 0), '-1961', 'sbcdiv 负数趋零截断');

// ---------------------------------------------------------------- 5. 区间归一化
group('5. price_float 区间归一化与告警');
const ctxBtc = { markPrice: 66501.1, contractValue: 0.001, pricePrecision: 1, numberPrecision: 3 };
const base = {
  box_id: 900, pid: 1, dom: 1, trust_num: 10, number_float: '10000-10000',
  change_trust_num: 0, change_number_float: '1-100', change_survival_time: '3-10', status: 1
};

const desc = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: '99.995-99.7' }), ctxBtc);
const asc = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: '99.7-99.995' }), ctxBtc);
ok(Number(desc.price_num) > 0, '倒序区间不再产生负价档', `实际 ${desc.price_num}`);
eq(desc.price_num, asc.price_num, '倒序与升序算出同一价档数');
eq(desc.min_price, asc.min_price, '倒序与升序 min_price 一致');
eq(desc.max_price, asc.max_price, '倒序与升序 max_price 一致');
eq(desc.price_float_normalized, '99.7-99.995', '归一化后的区间字符串');
ok(desc.warnings.some(w => w.includes('倒序')), '倒序区间产生告警', JSON.stringify(desc.warnings));
ok(asc.warnings.length === 0, '合法升序区间无告警', JSON.stringify(asc.warnings));

// ---------------------------------------------------------------- 6. 买卖方向约束
group('6. 买卖方向约束（对应 edit() 的两条不同校验）');
const buyBad = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: '99.9-100.5' }), ctxBtc);
ok(buyBad.warnings.some(w => w.includes('买盘')), '买盘上界超过 100 时告警', JSON.stringify(buyBad.warnings));

const sellBad = C.enrichBox(Object.assign({}, base, { direction: -1, price_float: '99.5-100.2' }), ctxBtc);
ok(sellBad.warnings.some(w => w.includes('卖盘')), '卖盘下界低于 100 时告警', JSON.stringify(sellBad.warnings));

const sellOk = C.enrichBox(Object.assign({}, base, { direction: -1, price_float: '100.005-100.3' }), ctxBtc);
ok(sellOk.warnings.length === 0, '合法卖盘无告警', JSON.stringify(sellOk.warnings));

// ---------------------------------------------------------------- 7. 边界输入
group('7. 边界输入不崩溃');
const noMark = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: '99.7-99.995' }), { markPrice: 0, contractValue: 0.001, pricePrecision: 1 });
eq(noMark.price_num, '0', '标记价为 0 时价档数为 0');
ok(noMark.warnings.some(w => w.includes('标记价')), '标记价为 0 时告警');

const junk = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: 'abc' }), ctxBtc);
ok(junk.warnings.some(w => w.includes('格式异常')), '非法 price_float 告警', JSON.stringify(junk.warnings));
ok(!isNaN(Number(junk.price_num)), '非法输入不产生 NaN', String(junk.price_num));

// ---------------------------------------------------------------- 8. 买卖近远端语义
group('8. 买卖方向语义：买盘越近价越高，卖盘越近价越低');
const buyRow = C.enrichBox(Object.assign({}, base, { direction: 1, price_float: '99.7-99.995' }), ctxBtc);
const sellRow = C.enrichBox(Object.assign({}, base, { direction: -1, price_float: '100.005-100.3' }), ctxBtc);

ok(buyRow.is_buy === true, '买盘 is_buy 为真');
ok(sellRow.is_buy === false, '卖盘 is_buy 为假');
// 买盘：近端 = 区间上界（贴盘口的高价）
eq(buyRow.near_price, buyRow.max_price, '买盘近端 = 区间上界');
eq(buyRow.far_price, buyRow.min_price, '买盘远端 = 区间下界');
eq(buyRow.near_pct, '99.995', '买盘近端百分比');
ok(Number(buyRow.near_price) > Number(buyRow.far_price), '买盘近端价高于远端价',
  `${buyRow.near_price} vs ${buyRow.far_price}`);
// 卖盘：近端 = 区间下界（贴盘口的低价）
eq(sellRow.near_price, sellRow.min_price, '卖盘近端 = 区间下界');
eq(sellRow.far_price, sellRow.max_price, '卖盘远端 = 区间上界');
eq(sellRow.near_pct, '100.005', '卖盘近端百分比');
ok(Number(sellRow.near_price) < Number(sellRow.far_price), '卖盘近端价低于远端价',
  `${sellRow.near_price} vs ${sellRow.far_price}`);
// 两侧近端价夹住标记价
ok(Number(buyRow.near_price) < ctxBtc.markPrice && Number(sellRow.near_price) > ctxBtc.markPrice,
  '买盘近端 < 标记价 < 卖盘近端');

// ---------------------------------------------------------------- 9. 买卖交叉校验
group('9. 卖盘不得低于买盘（跨行校验）');
function crossOf(pairs) {
  return C.checkCross(pairs.map((p, i) =>
    C.enrichBox(Object.assign({}, base, {
      box_id: 800 + i, direction: p.dir, price_float: p.pf,
      status: p.status === undefined ? 1 : p.status
    }), ctxBtc)));
}

const normal = crossOf([{ dir: 1, pf: '99.7-99.995' }, { dir: -1, pf: '100.005-100.3' }]);
ok(normal && normal.crossed === false, '正常盘口不报交叉', JSON.stringify(normal));
eq(normal.buyTop, '66497.7', '买盘最高价取各买盘近端的最大值');
eq(normal.sellBottom, '66504.4', '卖盘最低价取各卖盘近端的最小值');

// 卖盘下探到买盘区间内
const crossed = crossOf([{ dir: 1, pf: '99.7-100.2' }, { dir: -1, pf: '99.9-100.3' }]);
ok(crossed && crossed.crossed === true, '卖盘最低 ≤ 买盘最高时判定为交叉', JSON.stringify(crossed));
ok(crossed.message.includes('自成交'), '交叉时给出自成交提示');

// 多层时取全局极值，而不是只看第一层
const multi = crossOf([
  { dir: 1, pf: '99.7-99.9' }, { dir: 1, pf: '99.9-99.995' },
  { dir: -1, pf: '100.005-100.3' }, { dir: -1, pf: '100.3-100.8' }
]);
eq(multi.buyTop, '66497.7', '多层买盘取最高的近端价');
eq(multi.sellBottom, '66504.4', '多层卖盘取最低的近端价');
ok(multi.crossed === false, '多层正常配置不报交叉');

// 已关闭的盒子不参与判定（status !== 1 不铺单）
const offCrossed = crossOf([
  { dir: 1, pf: '99.7-99.995' },
  { dir: -1, pf: '99.5-99.8', status: 2 },
  { dir: -1, pf: '100.005-100.3' }
]);
ok(offCrossed.crossed === false, '已关闭的越界卖盘不触发交叉告警', JSON.stringify(offCrossed));

// 只有单边时无法判定
const onlyBuy = crossOf([{ dir: 1, pf: '99.7-99.995' }]);
ok(onlyBuy === null, '只有买盘时不做交叉判定');

// ---------------------------------------------------------------- 10. 真实配置整体自洽
group('10. 真实配置：买卖不交叉');
for (const list of data.list) {
  const ctx = {
    markPrice: list.mark_price, contractValue: list.contract_value,
    pricePrecision: list.price_precision, numberPrecision: list.number_precision
  };
  const rows = (data.boxes[String(list.pid)] || []).map(b => C.enrichBox(b, ctx));
  const cr = C.checkCross(rows);
  ok(cr && !cr.crossed, `pid${list.pid} 买卖不交叉`, cr ? cr.message : '无数据');
}

// ---------------------------------------------------------------- 汇总
console.log(`\n${failed === 0 ? '全部通过' : failed + ' 项失败'}  (${passed} 项断言通过)`);
process.exitCode = failed ? 1 : 0;
