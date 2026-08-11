/**
 * depth-chat 浏览器级 e2e —— 用真实 Chrome 跑，覆盖 Node 桩测试测不到的东西：
 *   1) 脚本加载时序（竞态）：mock 补丁必须早于页面 bootMain() 的首个请求
 *   2) 真实渲染：Highcharts 有没有画出数据、表格有没有行
 *   3) 请求泄漏：mock 模式下不允许任何请求打到本所域名
 *
 * 依赖（不入库，按需装）：
 *   npm i puppeteer-core
 * 前置：另开一个终端在 quant-visual-tools 目录跑 ./start.sh 8123
 * 运行：node test/e2e-browser.js
 */
'use strict';

const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error('缺少 puppeteer-core，请先执行：npm i puppeteer-core');
  process.exit(2);
}

const CHROME = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = process.env.PORT || 8123;
const ORIGIN = 'http://localhost:' + PORT;
const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'depth-chat.html');

const LOCAL_API = /contract\.chishee\.com|18\.177\.36\.184/;

/** api-config.json 人为延迟，逼出「页面已启动但补丁未装」的时间窗 */
const CONFIG_DELAY_MS = 1500;

function assert(list, ok, name, detail) {
  list.push({ ok: !!ok, name, detail: detail || '' });
}

async function openPage(browser, url, { delayConfig }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const leaked = [];
  const mockLogs = [];
  const jsErrors = [];

  await page.setRequestInterception(true);
  page.on('request', async r => {
    const u = r.url();
    if (delayConfig && /api-config\.json/.test(u)) {
      await new Promise(res => setTimeout(res, CONFIG_DELAY_MS));
      return r.continue();
    }
    // mock 模式下打到本所域名即为泄漏，记录并掐断，避免真的碰生产
    if (LOCAL_API.test(u)) {
      leaked.push(u.slice(0, 120));
      return r.abort();
    }
    // 币安是外网接口，不在 mock 范围，离线环境直接掐掉省时间
    if (/fapi\.binance\.com/.test(u)) return r.abort();
    r.continue();
  });
  page.on('console', m => { if (m.text().indexOf('[depth-chat]') === 0) mockLogs.push(m.text()); });
  page.on('pageerror', e => jsErrors.push(e.message));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) {
    jsErrors.push('goto: ' + e.message);
  }
  await new Promise(r => setTimeout(r, 6000));

  const dom = await page.evaluate(() => {
    const rows = id => (document.getElementById(id) || {}).childElementCount || 0;
    const sym = document.getElementById('symbol_id');
    const src = document.getElementById('market_monitor');
    return {
      dataSource: src && src.selectedIndex >= 0 ? src.options[src.selectedIndex].textContent : '(无)',
      symbols: sym ? sym.options.length : -1,
      askRows: rows('ask_orders_body'),
      bidRows: rows('bid_orders_body'),
      gatherRows: rows('dg_ask_body') + rows('dg_bid_body'),
      chartHasData: !!(window.Highcharts && Highcharts.charts.filter(Boolean)
        .some(c => c.series && c.series.some(s => s.data && s.data.length > 0)))
    };
  });

  const mockedFiles = [...new Set(mockLogs
    .filter(l => l.indexOf('mock →') >= 0)
    .map(l => l.split('mock/')[1]))];

  await page.close();
  return { leaked, mockedFiles, jsErrors, dom };
}

async function scenarioMock(browser, title, url, delayConfig) {
  const r = await openPage(browser, url, { delayConfig });
  const checks = [];
  assert(checks, r.leaked.length === 0, '无请求泄漏到本所域名', r.leaked.join(' , '));
  assert(checks, r.jsErrors.length === 0, '无 JS 异常', r.jsErrors.join(' | '));
  assert(checks, r.dom.dataSource === 'Mock 本地', '数据源 = Mock 本地', '实际 ' + r.dom.dataSource);
  assert(checks, r.mockedFiles.some(f => f && f.indexOf('exchangeInfo') === 0),
    'exchangeInfo 走 mock（补丁早于 bootMain）', '命中 ' + r.mockedFiles.join(', '));
  assert(checks, r.dom.symbols === 3, '交易对 = mock 的 3 个', '实际 ' + r.dom.symbols);
  assert(checks, r.dom.askRows > 0 && r.dom.bidRows > 0, '买卖挂单已渲染',
    r.dom.askRows + '/' + r.dom.bidRows);
  assert(checks, r.dom.gatherRows > 0, '价位聚合已渲染', String(r.dom.gatherRows));
  assert(checks, r.dom.chartHasData, '深度图有数据系列');
  return report(title + (delayConfig ? '（配置延迟 ' + CONFIG_DELAY_MS + 'ms）' : ''), checks);
}

async function scenarioLive(browser, title, url) {
  const r = await openPage(browser, url, { delayConfig: false });
  const checks = [];
  assert(checks, r.dom.dataSource === '测试环境', '数据源 = 测试环境', '实际 ' + r.dom.dataSource);
  assert(checks, r.mockedFiles.length === 0, '未误用 mock 数据', r.mockedFiles.join(', '));
  assert(checks, r.jsErrors.length === 0, '无 JS 异常', r.jsErrors.join(' | '));
  // 本所域名在本脚本里被 abort，所以只校验「确实尝试请求了真接口」
  assert(checks, r.leaked.length > 0, '确实向本所域名发起了请求', String(r.leaked.length));
  return report(title, checks);
}

function report(title, checks) {
  console.log('\n===== ' + title + ' =====');
  checks.forEach(c => console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  ' + c.name +
    (c.ok || !c.detail ? '' : '  ← ' + c.detail)));
  return checks.filter(c => !c.ok).length;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox']
  });

  let failed = 0;
  try {
    failed += await scenarioMock(browser, 'file:// 双击打开', FILE_URL, false);
    failed += await scenarioMock(browser, 'http:// 无参数（默认 Mock）', ORIGIN + '/depth-chat/depth-chat.html', false);
    failed += await scenarioMock(browser, 'http:// 无参数 · 竞态', ORIGIN + '/depth-chat/depth-chat.html', true);
    failed += await scenarioLive(browser, 'http:// ?mock=0（切回测试环境）', ORIGIN + '/depth-chat/depth-chat.html?mock=0');
  } finally {
    await browser.close();
  }

  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败'));
  process.exitCode = failed === 0 ? 0 : 1;
})();
