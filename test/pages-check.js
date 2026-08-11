/**
 * GitHub Pages 发布前检查：
 *  1) 首页所有链接可达
 *  2) 四个工具默认走 mock，不向内网/生产域名发起任何请求
 *  3) 页面真的渲染出数据、无 JS 异常
 */
const puppeteer = require('puppeteer-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 默认测本地静态服务；传 BASE 可直接测线上 Pages
const BASE = (process.env.BASE || 'http://localhost:8123').replace(/\/$/, '');

// 这些域名在 GitHub Pages 上要么不可达，要么根本不该碰
const FORBIDDEN = /18\.177\.36\.184|contract\.chishee\.com|contract\.hxexchge\.com|127\.0\.0\.1(?!:8123)/;
// 公网行情，允许（Pages 上是 https，可正常访问），这里 abort 只为跑得快
const EXTERNAL = /fapi\.binance\.com|www\.okx\.com|api\.bybit\.com|api-futures\.kucoin\.com/;

let failed = 0;
function check(ok, name, detail) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + (ok || !detail ? '' : '  ← ' + detail));
  if (!ok) failed++;
}

async function openTool(browser, { title, url, clickSelector, expect }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  const forbidden = [];
  const external = [];
  const jsErrors = [];
  const mockLogs = [];

  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (FORBIDDEN.test(u)) { forbidden.push(u.slice(0, 110)); return r.abort(); }
    if (EXTERNAL.test(u)) { external.push(u.split('?')[0]); return r.abort(); }
    r.continue();
  });
  page.on('pageerror', e => jsErrors.push(e.message));
  page.on('console', m => { if (/mock →|mock 模式|ready mode/.test(m.text())) mockLogs.push(m.text()); });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  } catch (e) { jsErrors.push('goto: ' + e.message); }
  await new Promise(r => setTimeout(r, 2500));

  if (clickSelector) {
    try { await page.click(clickSelector); } catch (e) { jsErrors.push('click ' + clickSelector + ': ' + e.message); }
    await new Promise(r => setTimeout(r, 3500));
  } else {
    await new Promise(r => setTimeout(r, 3500));
  }

  const dom = await page.evaluate(sel => {
    const el = document.querySelector(sel.node);
    return {
      rows: el ? el.childElementCount : -1,
      source: (() => {
        const s = document.getElementById('market_monitor');
        if (!s || s.selectedIndex < 0) return '(无下拉)';
        return s.options[s.selectedIndex].textContent.trim();
      })()
    };
  }, expect);

  console.log('\n----- ' + title + ' -----');
  check(forbidden.length === 0, '未请求内网/生产域名', [...new Set(forbidden)].join(' , '));
  check(jsErrors.length === 0, '无 JS 异常', [...new Set(jsErrors)].join(' | '));
  if (expect.source) check(dom.source === expect.source, '数据源默认 = ' + expect.source, '实际 ' + dom.source);
  check(dom.rows > 0, expect.label + ' 已渲染', '实际行数 ' + dom.rows);
  if (external.length) console.log('  INFO 外所公网请求（Pages 上正常，此处已 abort）: ' + [...new Set(external)].length + ' 个');
  if (mockLogs.length) console.log('  INFO mock 日志 ' + mockLogs.length + ' 条，例：' + mockLogs[0].slice(0, 80));

  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

  // ---- 1. 首页链接可达性 ----
  const page = await browser.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle2' });
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
  await page.close();

  console.log('\n----- 首页链接 -----');
  const internal = [...new Set(links.filter(h => !/^https?:/.test(h)))];
  for (const href of internal) {
    const res = await fetch(BASE + '/' + href).catch(() => null);
    check(res && res.ok, '站内链接可达: ' + href, res ? 'HTTP ' + res.status : '请求失败');
  }
  const ext = [...new Set(links.filter(h => /^https?:/.test(h)))];
  console.log('  INFO 外链 ' + ext.length + ' 个: ' + ext.join(' , '));
  check(ext.some(u => u.includes('trade-backtest')), '已加入 trade-backtest 外链');

  // ---- 2. 四个工具 ----
  await openTool(browser, {
    title: 'market-making 铺单工具',
    url: BASE + '/market-making/index.html',
    expect: { node: '#box_tbody', label: '铺单盒子表格', source: 'Mock 本地' }
  });
  await openTool(browser, {
    title: 'depth-chat 深度 V4',
    url: BASE + '/depth-chat/depth-chat.html',
    expect: { node: '#ask_orders_body', label: '挂单表格', source: 'Mock 本地' }
  });
  await openTool(browser, {
    title: 'depth-gather 深度均匀度',
    url: BASE + '/depth-gather/depthGather-chat.html',
    clickSelector: '#timeGetMarket',
    expect: { node: '#ask_orders_body, #orders_body, tbody', label: '订单簿', source: 'Mock 本地' }
  });
  await openTool(browser, {
    title: 'depth-compare 外所对比',
    url: BASE + '/depth-compare/depthCompare-chat.html',
    clickSelector: 'button[onclick="getMarketData()"]',
    expect: { node: 'tbody', label: '对比表格', source: 'Mock 本所' }
  });

  await browser.close();
  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败'));
  process.exitCode = failed ? 1 : 0;
})();
