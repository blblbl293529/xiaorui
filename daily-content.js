/* daily-content.js — 每日内容（抖音搜索入口/图文），无依赖。渲染统一用 textContent。 */
(() => {
  'use strict';
  const API = '/api/daily', KEY = 'xiaorui_daily_content_douyin_v1', TZ = 'Asia/Shanghai';
  const STATIC = document.documentElement?.dataset.dailySource === 'static';
  const TRAIN = [
    { key: 'legs', label: '腿部塑形', kw: '腿部塑形 健身' },
    { key: 'glutes', label: '臀部力量', kw: '臀部训练 健身' },
    { key: 'stretch', label: '放松拉伸', kw: '全身拉伸 放松' },
  ];
  const $ = (id) => document.getElementById(id);
  let controller = null, loading = false, lastFgDate = null, timer = null, lastAttempt = 0;
  let retrySoon = true;

  const isHttps = (u) => { try { const url = new URL(u); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; } };
  const shDate = (d = new Date()) => {
    return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  };
  const validItem = (i) => !!i && typeof i === 'object' && typeof i.id === 'string' && typeof i.title === 'string' && i.title.trim() !== '' && isHttps(i.url);
  const secOk = (s) => !!s && typeof s === 'object' && ['fresh', 'stale', 'empty', 'error'].includes(s.status);
  function validPayload(p) {
    return !!p && typeof p === 'object' && typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      !!p.sections && typeof p.sections === 'object' && TRAIN.every(t => secOk(p.sections[t.key])) && secOk(p.sections.video) && secOk(p.sections.photo) && secOk(p.sections.article);
  }
  const readCache = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return validPayload(v) ? v : null; } catch { return null; } };
  const writeCache = (p) => { if (validPayload(p)) try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} };

  // ---- 通用渲染原语 ----
  function el(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = String(txt); return n; }
  function link(href, text, cls) {
    if (!isHttps(href)) return el('span', cls || 'daily-link-disabled', text);
    const a = el('a', cls || 'daily-link', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  function searchUrl(kw) { return 'https://www.douyin.com/search/' + encodeURIComponent(kw); }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    try { return new Intl.DateTimeFormat('zh-CN', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); } catch { return iso.slice(0, 10); }
  }
  function metaLine(item) {
    const wrap = el('div', 'daily-meta');
    if (item.source) wrap.append(el('span', 'daily-source', '来源：' + item.source));
    const dt = fmtDate(item.publishedAt); if (dt) wrap.append(el('span', 'daily-date', (item.dateLabel || '发布于') + ' ' + dt));
    if (item.duration) wrap.append(el('span', 'daily-dur', '时长 ' + item.duration));
    return wrap;
  }
  function cover(item, alt) {
    const box = el('div', 'daily-cover');
    if (isHttps(item.imageUrl)) {
      const img = el('img'); img.src = item.imageUrl; img.alt = alt || item.title || ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      const fb = el('p', 'daily-cover-fail', '图片加载中…');
      img.addEventListener('error', () => { img.hidden = true; fb.textContent = '图片暂无法加载'; fb.hidden = false; });
      img.addEventListener('load', () => { img.hidden = false; fb.hidden = true; });
      box.append(img, fb);
    } else box.append(el('p', 'daily-cover-fail', '暂无配图'));
    return box;
  }
  // 通用条目渲染：variant 决定标题/说明密度
  function renderItem(item, opts = {}) {
    const card = el('article', 'daily-card');
    card.append(el('h3', 'daily-title', item.title));
    card.append(metaLine(item));
    if (opts.cover !== false) card.append(cover(item, item.title));
    if (item.description && opts.desc !== false) card.append(el('p', 'daily-desc', item.description));
    card.append(link(item.url, opts.cta || '打开原始来源'));
    return card;
  }
  function messageBox(text, extraNode) {
    const b = el('div', 'daily-msg'); b.append(el('p', null, text || '暂无内容')); if (extraNode) b.append(extraNode); return b;
  }
  function searchHint(kw) { return link(searchUrl(kw), '前往抖音搜索', 'daily-search'); }

  // ---- 区块渲染 ----
  function renderTraining(sec, def) {
    const wrap = el('div', 'daily-section');
    wrap.append(el('h2', 'daily-h2', def.label));
    const card = el('article', 'daily-card');
    card.append(el('p', 'daily-desc', '在抖音选择适合自己的跟练视频。'));
    card.append(link(searchUrl(def.kw), '去抖音看' + def.label, 'daily-cta'));
    const button = el('button', 'workout-done', workoutLabel(def.key, 'douyin-search'));
    button.type = 'button'; button.dataset.vid = 'douyin-search'; button.dataset.kw = def.key;
    button.dataset.day = shDate();
    button.setAttribute('aria-pressed', String(isDone(def.key, 'douyin-search')));
    button.addEventListener('click', onToggleDone);
    card.append(button); wrap.append(card);
    return wrap;
  }
  function renderMedia(id, sec, kw, title, cta) {
    const host = $(id); if (!host) return;
    host.textContent = ''; host.className = 'content-block';
    host.append(el('h2', 'daily-h2', title));
    if (sec && sec.status === 'fresh' && validItem(sec.item)) { const c = renderItem(sec.item, { cta }); c.classList.add('daily-fresh'); host.append(c); }
    else if (sec && sec.status === 'stale') {
      host.append(el('p', 'daily-note', '未能刷新，显示 ' + (sec.selectedDate || '旧日期') + ' 的内容'));
      if (validItem(sec.item)) { const c = renderItem(sec.item, { cta }); c.classList.add('daily-stale'); host.append(c); }
      else host.append(messageBox(sec.message || '暂时无法获取内容', searchHint(kw)));
    } else host.append(messageBox(sec && sec.message ? sec.message : '暂时无法获取内容', searchHint(kw)));
  }
  function renderVideo() {
    const host = $('video-body'); if (!host) return;
    host.textContent = ''; host.className = 'content-block';
    host.append(el('h2', 'daily-h2', '抖音视频'));
    host.append(el('p', 'daily-desc', '前往抖音搜索自然、人文与纪录片视频。当前为搜索入口，暂未接入每日自动推荐。'));
    host.append(link(searchUrl('自然 人文 纪录片'), '去抖音看视频', 'daily-cta'));
  }
  function renderPhoto(sec) {
    const host = $('photo-body'); if (!host) return;
    host.textContent = ''; host.className = 'content-block';
    if (sec && sec.status === 'fresh' && validItem(sec.item)) {
      const c = renderItem(sec.item, { cta: '查看原图来源' });
      host.append(c);
      const credit = el('p', 'daily-credit');
      credit.append(el('span', null, '图片来源：' + (sec.item.source || '见原始来源')));
      if (isHttps(sec.item.url)) credit.append(document.createTextNode(' · '), link(sec.item.url, '原始来源'));
      host.append(credit);
    } else if (sec && sec.status === 'stale' && validItem(sec.item)) {
      host.append(el('p', 'daily-note', '显示 ' + (sec.selectedDate || '旧日期') + ' 的图片'));
      const c = renderItem(sec.item, { cta: '查看原图来源' }); c.classList.add('daily-stale'); host.append(c);
    } else host.append(messageBox(sec && sec.message ? sec.message : '暂时无法获取图片'));
  }
  function renderArticle(sec) {
    const host = $('article-text'); if (!host) return;
    host.textContent = '';
    if (sec && (sec.status === 'fresh' || sec.status === 'stale') && validItem(sec.item)) {
      if (sec.status === 'stale') host.append(el('p', 'daily-note', '显示 ' + (sec.selectedDate || '旧日期') + ' 的文章'));
      host.append(el('h3', 'daily-title', sec.item.title), metaLine(sec.item));
      if (sec.item.description) host.append(el('p', 'daily-desc', sec.item.description));
      host.append(link(sec.item.url, '阅读原文'));
    } else host.append(messageBox(sec && sec.message ? sec.message : '暂无文章'));
  }

  // ---- 完成标记 ----
  function doneKey(kw, vid) { return 'xiaorui_workout_done_' + shDate() + '_' + kw + '_' + vid; }
  function lsOk() { try { localStorage.setItem('xiaorui_storage_probe', '1'); localStorage.removeItem('xiaorui_storage_probe'); return true; } catch { return false; } }
  function isDone(kw, vid) { try { return localStorage.getItem(doneKey(kw, vid)) === '1'; } catch { return false; } }
  function workoutLabel(kw, vid) { return isDone(kw, vid) ? '今日已完成' : '标记完成'; }
  function onToggleDone(e) {
    const b = e.currentTarget, kw = b.dataset.kw, vid = b.dataset.vid;
    if (b.dataset.day !== shDate()) { refresh(false); return; }
    if (!lsOk()) { b.textContent = '浏览器未允许保存进度'; b.disabled = true; return; }
    const next = !isDone(kw, vid);
    try { next ? localStorage.setItem(doneKey(kw, vid), '1') : localStorage.removeItem(doneKey(kw, vid)); } catch { b.textContent = '无法保存进度'; return; }
    b.textContent = workoutLabel(kw, vid); b.setAttribute('aria-pressed', String(next));
  }

  // ---- 状态/整体渲染 ----
  function setStatus(txt, kind) { const s = $('daily-content-status'); if (s) { s.textContent = txt || ''; s.dataset.state = kind || ''; } }
  function renderAll(payload, opts = {}) {
    if (payload && (opts.staleDate || payload.date !== shDate())) {
      payload = { ...payload, sections: Object.fromEntries(Object.entries(payload.sections).map(([key, sec]) =>
        [key, { ...sec, status: sec.item ? 'stale' : sec.status, selectedDate: sec.selectedDate || payload.date }])) };
      opts.staleDate = opts.staleDate || payload.date;
    }
    const sectionsHost = $('workout-videos');
    const sec = (payload && payload.sections) || {};
    if (sectionsHost) {
      sectionsHost.textContent = '';
      TRAIN.forEach(t => sectionsHost.append(renderTraining(sec[t.key], t)));
    }
    renderVideo(sec.video); renderPhoto(sec.photo); renderArticle(sec.article);
    const ws = $('workout-status'); if (ws) ws.textContent = '侧重腿臀力量与柔韧性，不承诺局部减脂。按自身情况选择强度。';
    if (opts.staleDate) setStatus('未能刷新，显示 ' + opts.staleDate + ' 的缓存内容', 'stale');
    else if (payload) {
      const discovered = ['photo', 'article'].filter(k => sec[k]?.status === 'fresh').length;
      const checked = new Date(payload.refreshedAt).toLocaleString('zh-CN', { timeZone: TZ });
      setStatus((STATIC ? '云端更新：' : '最近检查：') + checked + ' · 图文 ' + discovered + '/2 · 视频为抖音搜索入口' +
        (discovered < 2 ? '，部分图文待更新' : ''), discovered < 2 ? 'partial' : 'ok');
    }
  }
  function renderEmpty(msg) {
    const h = $('workout-videos');
    if (h) { h.textContent = ''; TRAIN.forEach(t => h.append(renderTraining(null, t))); }
    renderVideo();
    if ($('photo-body')) { $('photo-body').textContent = ''; $('photo-body').append(messageBox('暂无图片')); }
    if ($('article-text')) { $('article-text').textContent = ''; $('article-text').append(messageBox('暂无文章')); }
    if ($('workout-status')) $('workout-status').textContent = '侧重腿臀力量与柔韧性，不承诺局部减脂。按自身情况选择强度。';
    setStatus(msg || '暂无内容', 'error');
  }
  function renderStaticError(msg) { renderEmpty(msg); setStatus(msg, 'error'); }

  // ---- 网络 ----
  async function fetchDaily(method) {
    if (location.protocol === 'file:') throw Object.assign(new Error('file'), { code: 'file' });
    controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 50000);
    try {
      const endpoint = STATIC ? new URL('daily.json', document.baseURI) : method === 'POST' ? API + '/refresh' : API;
      if (STATIC) endpoint.searchParams.set('check', String(Date.now()));
      const r = await fetch(String(endpoint), { method: STATIC ? 'GET' : method, cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!r.ok) throw makeError(r.status === 404 ? 'nonjson' : 'HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (!/json/i.test(ct)) throw makeError('nonjson');
      const data = await r.json();
      if (!validPayload(data)) throw new Error('bad payload');
      return data;
    } finally { clearTimeout(t); controller = null; }
  }
  function makeError(code) { return Object.assign(new Error(code), { code }); }
  function errMsg(e) {
    if (STATIC && e && e.code === 'nonjson') return '云端每日内容暂不可用，请稍后检查更新';
    if (e && e.code === 'file') return '请通过小睿服务打开，静态文件无法获取每日内容';
    if (e && e.code === 'nonjson') return '请通过小睿服务打开，静态文件无法获取每日内容';
    if (e && e.name === 'AbortError') return '请求超时（50 秒），请稍后重试';
    return '内容加载失败，请稍后重试';
  }
  async function refresh(manual) {
    if (loading) return; loading = true; lastAttempt = Date.now();
    const buttons = [$('btn-refresh-content'), $('btn-refresh-workouts')].filter(Boolean);
    buttons.forEach(btn => { btn.disabled = true; });
    setStatus(manual ? '正在刷新…' : '正在加载每日内容…', 'loading');
    try {
      const data = await fetchDaily(manual ? 'POST' : 'GET');
      writeCache(data); renderAll(data); lastFgDate = data.date;
      retrySoon = ['photo', 'article'].some(key => data.sections[key].status !== 'fresh');
    } catch (e) {
      retrySoon = true;
      const c = readCache(); const msg = errMsg(e);
      if (c) { renderAll(c, { staleDate: c.date }); setStatus(msg + '；已显示缓存（' + c.date + '）', 'error'); }
      else renderStaticError(msg + '。请点击“检查更新”重试。');
    } finally {
      loading = false; buttons.forEach(btn => { btn.disabled = false; });
    }
  }
  function checkForUpdates(resumed = false) {
    if (document.visibilityState !== 'visible') return;
    const interval = resumed || shDate() !== lastFgDate ? 60000 : retrySoon ? 120000 : 900000;
    if (Date.now() - lastAttempt >= interval) refresh(false);
  }
  function onVisibility() { checkForUpdates(true); }
  function onStartup() {
    if (!document.getElementById('daily-content') && !document.getElementById('workout-videos')) return;
    $('btn-refresh-content')?.addEventListener('click', () => refresh(true));
    $('btn-refresh-workouts')?.addEventListener('click', () => refresh(true));
    if (STATIC) {
      [$('btn-refresh-content'), $('btn-refresh-workouts')].filter(Boolean).forEach(btn => {
        btn.textContent = '检查云端更新';
        btn.title = '云端定时生成内容，此按钮读取最新发布结果';
      });
    }
    const c = readCache();
    if (c) renderAll(c, { staleDate: c.date });
    else renderEmpty('正在加载每日图文…');
    lastFgDate = shDate();
    refresh(false);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('online', onVisibility);
    document.addEventListener('click', e => {
      const page = e.target.closest?.('[data-page]')?.dataset.page;
      if (page === 'fitness' || page === 'music') onVisibility();
    });
    // 同一天的失败恢复也要同步到页面；GET 仍遵守服务端来源缓存。
    timer = setInterval(() => checkForUpdates(), 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onStartup, { once: true });
  else onStartup();
  window.__xiaoruiDaily = { refresh: () => refresh(true) };
})();
