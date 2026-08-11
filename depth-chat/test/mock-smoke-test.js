/**
 * depth-chat mock 冒烟测试
 * 用最小 DOM 桩实跑 js/{mock-data,api-config,mock-bridge}.js，覆盖两种打开方式：
 *   1) file://  — 浏览器禁止 fetch 本地 JSON，必须走 js/mock-data.js 内嵌数据
 *   2) http://  — 正常 fetch config/api-config.json + data/mock/*.json
 * 用法：cd depth-chat && node test/mock-smoke-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function makeSelect(id) {
  return {
    id,
    options: [],
    selectedIndex: -1,
    appendChild(o) {
      this.options.push(o);
      if (this.selectedIndex < 0) this.selectedIndex = 0;
    },
    addEventListener() {},
    get value() {
      const o = this.options[this.selectedIndex];
      return o ? o.value : '';
    },
    set innerHTML(v) {
      if (v === '') { this.options = []; this.selectedIndex = -1; }
    },
    get innerHTML() { return ''; }
  };
}

/** 造一个跑 mock-bridge 的沙箱；protocol=file: 时 fetch 一律失败，模拟浏览器行为 */
function buildSandbox({ protocol, search }) {
  const selects = {
    market_monitor: makeSelect('market_monitor'),
    market_kline: makeSelect('market_kline')
  };
  const banner = { style: {}, innerHTML: '' };

  const fileMode = protocol === 'file:';
  const diskFetch = (url) => {
    const rel = String(url).replace(/^https?:\/\/localhost:8000\//, '').replace(/\?.*$/, '');
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(abs, 'utf8')))
    });
  };

  const sandbox = {
    console, URL, Response, Promise, setTimeout, JSON,
    fetch: fileMode
      ? () => Promise.reject(new TypeError('Failed to fetch'))
      : diskFetch,
    location: {
      protocol,
      search,
      href: fileMode
        ? 'file://' + ROOT + '/depth-chat.html' + search
        : 'http://localhost:8000/depth-chat.html' + search
    },
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById(id) {
        if (selects[id]) return selects[id];
        if (id === 'mock_banner') return banner;
        return null;
      },
      createElement() {
        const attrs = {};
        return {
          value: '', textContent: '',
          setAttribute(k, v) { attrs[k] = String(v); },
          getAttribute(k) { return k in attrs ? attrs[k] : null; }
        };
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.jQuery = {
    Deferred() {
      const onOk = [], onErr = [];
      const d = {
        resolve(v) { onOk.forEach(f => f(v)); return d; },
        reject(e) { onErr.forEach(f => f(e)); return d; },
        promise: () => ({ then(f) { onOk.push(f); return this; }, fail(f) { onErr.push(f); return this; } })
      };
      return d;
    },
    ajax(o) { throw new Error('jQuery.ajax 未被 patch: ' + o.url); }
  };

  vm.createContext(sandbox);
  for (const f of ['js/mock-data.js', 'js/api-config.js', 'js/mock-bridge.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return { sandbox, selects, banner };
}

/** 断言接口能返回页面真正用到的字段，而不只是「有响应」 */
const CASES = [
  ['depth', 'mock://depth?symbol_id=1000001',
    j => Object.keys(j.data.depth.ask).length > 0 && j.data.depth.ask[0].number !== undefined],
  ['depth 未知 symbol 回退 default', 'mock://depth?symbol_id=999999',
    j => Object.keys(j.data.depth.ask).length > 0],
  ['klineDiff', 'mock://klineDiff?symbol_id=1000001&resolution=1',
    j => j.data.last.kline.length > 0 && j.data.mark.kline.length > 0],
  ['exchangeInfo', 'https://contract.chishee.com/pub/exchangeInfo',
    j => Array.isArray(j.data.symbols) && j.data.symbols.length > 0],
  ['tickerList', 'https://contract.chishee.com/pub/v2/tickerList',
    j => Array.isArray(j.data.field) && Array.isArray(j.data.value) && j.data.field.includes('symbol_id')],
  ['depthGather', 'https://contract.chishee.com/debug/depthGather?symbol_id=1000001',
    j => Object.values(j.data.depth.ask).every(o => o.price && o.qty && o.direction !== undefined)],
  ['exchangePrice', 'https://contract.chishee.com/debug/exchangePrice',
    j => j.data['1000001'] && j.data['1000001'].price],
  ['priceHash', 'https://contract.chishee.com/debug/priceHash',
    j => j.data.some(d => String(d.symbol).includes('(1000001)'))]
];

function runCases(sandbox) {
  return Promise.all(CASES.map(([name, url, check]) => new Promise(resolve => {
    sandbox.jQuery.ajax({
      url,
      success(json) {
        let ok = false, why = '';
        try { ok = !!check(json); } catch (e) { why = e.message; }
        resolve({ name, ok, why: why || (ok ? '' : '字段校验不通过') });
      },
      error(xhr, s, msg) { resolve({ name, ok: false, why: msg }); }
    });
  })));
}

function scenario(title, opts, expectDefault) {
  const { sandbox, selects, banner } = buildSandbox(opts);
  return new Promise(r => setTimeout(r, 30)).then(() => {
    const sel = selects.market_monitor;
    const kline = selects.market_kline;
    const cur = sel.options[sel.selectedIndex];
    const results = [];

    results.push({
      name: '下拉保留 Mock 本地 + 测试环境 两项',
      ok: sel.options.length === 2 &&
        sel.options.map(o => o.textContent).join(',') === 'Mock 本地,测试环境',
      why: '实际: ' + sel.options.map(o => o.textContent).join(',')
    });
    results.push({
      name: '默认选中 = ' + expectDefault,
      ok: cur.textContent === expectDefault,
      why: '实际: ' + cur.textContent
    });
    results.push({
      name: 'K线下拉与深度下拉同模式',
      ok: kline.options[kline.selectedIndex].getAttribute('data-mock') === cur.getAttribute('data-mock'),
      why: '实际: ' + kline.options[kline.selectedIndex].textContent
    });
    results.push({
      name: '测试环境地址指向 api_base',
      ok: /^http:\/\/18\.177\.36\.184\/futures\/debug\/depth$/.test(
        sel.options.find(o => o.getAttribute('data-mock') === '0').value),
      why: '实际: ' + sel.options.find(o => o.getAttribute('data-mock') === '0').value
    });

    const isMock = cur.getAttribute('data-mock') === '1';
    const dataCases = isMock ? runCases(sandbox) : Promise.resolve([]);
    return dataCases.then(rs => {
      const all = results.concat(rs);
      console.log('\n== ' + title + ' ==');
      console.log('   banner: ' + (banner.style.display || 'none'));
      all.forEach(r => console.log('   ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + (r.ok ? '' : '  ← ' + r.why)));
      return all.filter(r => !r.ok).length;
    });
  });
}

Promise.resolve()
  .then(() => scenario('file:// 直接双击打开（默认 Mock）',
    { protocol: 'file:', search: '' }, 'Mock 本地'))
  .then(f1 => scenario('http:// 本地服务器 · 无参数（默认 Mock）',
    { protocol: 'http:', search: '' }, 'Mock 本地').then(f2 => f1 + f2))
  .then(f => scenario('http:// 本地服务器 · ?mock=1（显式 Mock）',
    { protocol: 'http:', search: '?mock=1' }, 'Mock 本地').then(f3 => f + f3))
  .then(f => scenario('http:// 本地服务器 · ?mock=0（切回测试环境）',
    { protocol: 'http:', search: '?mock=0' }, '测试环境').then(f4 => f + f4))
  .then(failed => {
    console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败'));
    process.exitCode = failed === 0 ? 0 : 1;
  })
  .catch(e => { console.error(e); process.exitCode = 1; });
