// Run the real frontend with an in-memory DOM and clock; no network or user data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() { this.children = []; this.dataset = {}; this.classList = { add() {} }; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ''; }
  get firstChild() { return this.children[0]; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute() {}
  addEventListener() {}
}

async function main(staticSite = false) {
  let now = Date.parse('2026-10-20T02:00:00Z');
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const hosts = new Map(['workout-videos', 'daily-content-status', 'video-body'].map(id => [id, new Element()]));
  const documentEvents = {}, windowEvents = {}, storage = new Map(), requests = [];
  let tick, fail = false, nextPayload;
  const document = {
    readyState: 'complete', visibilityState: 'visible',
    documentElement: { dataset: { dailySource: staticSite ? 'static' : '' } },
    baseURI: 'https://example.org/xiaorui/',
    getElementById: id => hosts.get(id),
    createElement: () => new Element(),
    createTextNode: text => ({ textContent: text }),
    addEventListener: (name, handler) => { documentEvents[name] = handler; },
  };
  const window = { addEventListener: (name, handler) => { windowEvents[name] = handler; } };
  function payload(fresh) {
    return {
      date: new Clock(now + 8 * 3600000).toISOString().slice(0, 10),
      refreshedAt: new Clock().toISOString(),
      sections: Object.fromEntries(['legs', 'glutes', 'stretch', 'video', 'photo', 'article'].map(key => [
        key, fresh ? { status: 'fresh', item: {
          id: key, title: 'recovered ' + key, url: 'https://example.com/' + key,
        } } : { status: 'error' },
      ])),
    };
  }
  nextPayload = payload(false);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../daily-content.js'), 'utf8'), {
    document, window, Date: Clock, URL, Intl, AbortController,
    location: { protocol: 'http:' },
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    setTimeout: () => 1, clearTimeout() {},
    setInterval: callback => { tick = callback; return 1; },
    fetch: async (url, options) => {
      requests.push({ url, method: options.method });
      if (fail) throw new Error('offline');
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => nextPayload };
    },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert.equal(requests.length, 1);
  now += 60000; tick(); await flush();
  assert.equal(requests.length, 1, 'partial results do not poll more than once per two minutes');
  nextPayload = payload(true);
  now += 60000; tick(); await flush();
  assert.equal(requests.length, 2, 'same-day failures must recover without manual refresh');
  assert.match(hosts.get('daily-content-status').textContent, /图文 2\/2/);
  const workoutCard = hosts.get('workout-videos').children[0].children[1];
  assert.equal(new URL(workoutCard.children[1].href).hostname, 'www.douyin.com');
  assert.equal(workoutCard.children[2].dataset.vid, 'douyin-search');
  assert.ok(!JSON.stringify(workoutCard).includes('recovered legs'), 'old source payloads cannot restore old videos');
  now += 120000; tick(); await flush();
  assert.equal(requests.length, 2, 'healthy results use a longer interval');
  now += 780000; tick(); await flush();
  assert.equal(requests.length, 3, 'healthy same-day pages still periodically synchronize');
  document.visibilityState = 'hidden';
  now += 900000; tick(); await flush();
  assert.equal(requests.length, 3, 'background tabs do not poll');
  document.visibilityState = 'visible';
  documentEvents.visibilitychange(); await flush();
  assert.equal(requests.length, 4, 'resuming checks the server');
  windowEvents.focus(); windowEvents.online(); await flush();
  assert.equal(requests.length, 4, 'simultaneous wake events are throttled');
  now += 60000;
  documentEvents.click({ target: { closest: () => ({ dataset: { page: 'music' } }) } });
  await flush();
  assert.equal(requests.length, 5, 'opening Discover refreshes stale UI');
  fail = true;
  now += 60000; windowEvents.online(); await flush();
  assert.equal(requests.length, 6);
  assert.equal(hosts.get('daily-content-status').dataset.state, 'error');
  fail = false;
  now += 120000; tick(); await flush();
  assert.equal(requests.length, 7, 'network failures retry on the short interval');
  assert.equal(hosts.get('daily-content-status').dataset.state, 'ok');
  now = Date.parse('2026-10-20T15:59:00Z');
  nextPayload = payload(true); tick(); await flush();
  now += 60000;
  nextPayload = payload(true); tick(); await flush();
  assert.equal(requests.length, 9, 'Shanghai midnight refreshes within one minute');
  assert.ok(requests.every(r => r.method === 'GET'), 'automatic checks never force upstream refreshes');
  await window.__xiaoruiDaily.refresh();
  assert.equal(requests.at(-1).method, staticSite ? 'GET' : 'POST');
  if (staticSite) {
    assert.ok(requests.every(r => new URL(r.url).pathname === '/xiaorui/daily.json'),
      'Pages requests stay under the project subdirectory');
    assert.ok(requests.every(r => new URL(r.url).searchParams.has('check')),
      'Pages requests bypass stale CDN responses');
  }
  nextPayload = payload(true);
  for (const [index, key] of ['legs', 'glutes', 'stretch', 'video'].entries()) {
    nextPayload.sections[key].mode = 'automatic';
    nextPayload.sections[key].item.url = 'https://www.douyin.com/video/' + (123400 + index);
  }
  await window.__xiaoruiDaily.refresh();
  assert.match(hosts.get('daily-content-status').textContent, /抖音推荐 4\/4/);
  assert.ok(JSON.stringify(hosts.get('workout-videos')).includes('recovered legs'));
  assert.ok(JSON.stringify(hosts.get('video-body')).includes('https://www.douyin.com/video/123403'));
  nextPayload.sections.video.status = 'empty';
  nextPayload.sections.video.item = null;
  now += 120000; tick(); await flush(); // previous healthy interval still applies
  await window.__xiaoruiDaily.refresh();
  const beforeRetry = requests.length;
  now += 120000; tick(); await flush();
  assert.equal(requests.length, beforeRetry + 1, 'missing automatic videos use short retries');
  assert.ok(!JSON.stringify(hosts.get('video-body')).includes('recovered video'), 'exhaustion cannot loop the old video');
  console.log('Daily refresh regression checks passed: ' + (staticSite ? 'Pages' : 'local API'));
}
main().then(() => main(true)).catch(error => { console.error(error); process.exitCode = 1; });
