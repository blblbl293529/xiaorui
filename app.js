'use strict';

/* ============ 工具函数 ============ */
const $ = (sel) => document.querySelector(sel);

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (a, b) => {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
};
const fmtDate = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;

/* ============ 问候语 ============ */
function setGreeting() {
  const h = new Date().getHours();
  let text = '你好呀～';
  if (h < 6) text = '夜深了，早点休息哦～';
  else if (h < 12) text = '早上好呀～';
  else if (h < 18) text = '下午好呀～';
  else text = '晚上好呀～';
  $('#greeting').textContent = text;
}

/* ============ 页面切换 ============ */
function switchPage(name) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  $('#page-' + name).classList.add('active');
  document.querySelector(`.tab[data-page="${name}"]`).classList.add('active');
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchPage(tab.dataset.page));
});
document.querySelectorAll('[data-goto]').forEach((el) => {
  el.addEventListener('click', () => switchPage(el.dataset.goto));
});

/* ============ 天气 ============ */
const LS_CITY = 'xiaorui_city';

const WMO = {
  0: ['☀️', '晴'], 1: ['🌤️', '大部晴朗'], 2: ['⛅', '多云'], 3: ['☁️', '阴'],
  45: ['🌫️', '有雾'], 48: ['🌫️', '雾凇'],
  51: ['🌦️', '小毛毛雨'], 53: ['🌦️', '毛毛雨'], 55: ['🌧️', '大雨毛'],
  56: ['🌧️', '冻毛毛雨'], 57: ['🌧️', '冻毛毛雨'],
  61: ['🌦️', '小雨'], 63: ['🌧️', '中雨'], 65: ['🌧️', '大雨'],
  66: ['🌧️', '冻雨'], 67: ['🌧️', '冻雨'],
  71: ['🌨️', '小雪'], 73: ['🌨️', '中雪'], 75: ['❄️', '大雪'], 77: ['🌨️', '雪粒'],
  80: ['🌦️', '阵雨'], 81: ['🌧️', '强阵雨'], 82: ['⛈️', '暴雨'],
  85: ['🌨️', '阵雪'], 86: ['❄️', '强阵雪'],
  95: ['⛈️', '雷阵雨'], 96: ['⛈️', '雷阵雨伴冰雹'], 99: ['⛈️', '雷阵雨伴大冰雹'],
};
const wmoInfo = (code) => WMO[code] || ['☁️', '未知'];

const RAINY_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`
    );
    const data = await res.json();
    return data.city || data.locality || data.principalSubdivision || '当前位置';
  } catch {
    return '当前位置';
  }
}

async function searchCity(name) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=zh&format=json`
  );
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: [r.name, r.admin1].filter(Boolean).join(' · '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('天气接口请求失败');
  return res.json();
}

function buildReminders(cur, today, tomorrow) {
  const list = [];
  const rainToday = today.precip >= 50;
  const maybeRainToday = RAINY_CODES.has(today.code) && today.precip >= 30;
  const rainTomorrow = tomorrow.precip >= 50;
  const maybeRainTomorrow = RAINY_CODES.has(tomorrow.code) && tomorrow.precip >= 30;
  const coldToday = today.tmax < 15 || today.tmin < 10;
  const drop = tomorrow.tmax - today.tmax;

  if (rainToday) list.push('☂️ 今天有雨，出门记得带伞哦');
  else if (maybeRainToday) list.push('☂️ 今天可能有阵雨，带上伞更保险');
  if (rainTomorrow) list.push(rainToday ? '☂️ 明天也还有雨，雨伞别落下' : '☂️ 明天有雨，记得带伞');
  else if (maybeRainTomorrow) list.push('☂️ 明天可能有阵雨，出门留意天气');
  if (drop <= -5) list.push('🧣 明天要降温啦，记得多穿衣服');
  else if (coldToday) list.push('🧣 今天有点冷，注意保暖哦');
  if (cur.temp >= 30) list.push('💦 今天比较热，多喝水注意防晒');
  if (list.length === 0) list.push('🌤️ 天气不错，祝你今天心情棒棒哒～');
  return list;
}

function renderWeather(data, cityName) {
  const cur = data.current;
  const [today, tomorrow] = data.daily.time.map((t, i) => ({
    date: t,
    code: data.daily.weather_code[i],
    tmax: Math.round(data.daily.temperature_2m_max[i]),
    tmin: Math.round(data.daily.temperature_2m_min[i]),
    precip: data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[i] : 0,
  }));

  const [emoji, text] = wmoInfo(cur.weather_code);
  $('#city-name').textContent = cityName;
  $('#temp-now').textContent = `${Math.round(cur.temperature_2m)}°`;
  $('#weather-desc').textContent = `${text} · 体感 ${Math.round(cur.apparent_temperature)}°`;
  $('#weather-emoji').textContent = emoji;
  $('#weather-extra').innerHTML =
    `今天 ${today.tmin}° ~ ${today.tmax}°，降水概率 ${today.precip}%<br>` +
    `明天 ${tomorrow.tmin}° ~ ${tomorrow.tmax}°，降水概率 ${tomorrow.precip}%`;
  $('#weather-reminder').innerHTML = buildReminders(cur, today, tomorrow)
    .map((r) => `<span class="reminder-item">${r}</span>`)
    .join('');
}

async function loadWeather() {
  const saved = JSON.parse(localStorage.getItem(LS_CITY) || 'null');
  let loc = saved;
  if (!loc) {
    loc = await new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        async (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '当前位置' }),
        () => resolve(null),
        { timeout: 6000 }
      );
    });
    if (loc && loc.name === '当前位置') loc.name = await reverseGeocode(loc.lat, loc.lon);
    if (!loc) loc = { lat: 39.9042, lon: 116.4074, name: '北京' };
    localStorage.setItem(LS_CITY, JSON.stringify(loc));
  }
  try {
    const data = await fetchWeather(loc.lat, loc.lon);
    renderWeather(data, loc.name);
  } catch (e) {
    $('#city-name').textContent = loc.name;
    $('#weather-reminder').textContent = '😢 天气加载失败，请检查网络后点刷新按钮';
  }
}

$('#btn-refresh-weather').addEventListener('click', loadWeather);

$('#btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('当前环境不支持定位');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      localStorage.setItem(LS_CITY, JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, name }));
      loadWeather();
    },
    () => alert('定位失败，请手动搜索城市'),
    { timeout: 8000 }
  );
});

$('#btn-search-city').addEventListener('click', async () => {
  const name = $('#city-input').value.trim();
  if (!name) return;
  const results = await searchCity(name);
  const box = $('#city-results');
  box.innerHTML = '';
  if (results.length === 0) {
    box.innerHTML = '<div class="city-result">没找到这个城市，换个名字试试？</div>';
    return;
  }
  results.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'city-result';
    btn.textContent = r.name;
    btn.addEventListener('click', () => {
      localStorage.setItem(LS_CITY, JSON.stringify(r));
      $('#city-input').value = '';
      box.innerHTML = '';
      loadWeather();
    });
    box.appendChild(btn);
  });
});

/* ============ 姨妈期记录 ============ */
const LS_PERIOD = 'xiaorui_period_days';

function getPeriodDays() {
  return new Set(JSON.parse(localStorage.getItem(LS_PERIOD) || '[]'));
}
function savePeriodDays(set) {
  localStorage.setItem(LS_PERIOD, JSON.stringify([...set].sort()));
}

/* 把已标记日期聚合成连续区间 */
function getRuns(days) {
  const sorted = [...days].map(parseKey).sort((a, b) => a - b);
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && daysBetween(last.end, d) === 1) last.end = d;
    else runs.push({ start: d, end: d });
  }
  return runs;
}

function getStats() {
  const days = getPeriodDays();
  const runs = getRuns(days);
  let cycle = 28, len = 5, lastStart = null, nextStart = null;

  if (runs.length > 0) {
    lastStart = runs[runs.length - 1].start;
    const lens = runs.map((r) => daysBetween(r.start, r.end) + 1);
    len = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
    if (runs.length >= 2) {
      const gaps = [];
      for (let i = 1; i < runs.length; i++) gaps.push(daysBetween(runs[i - 1].start, runs[i].start));
      cycle = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    }
    nextStart = new Date(lastStart);
    nextStart.setDate(nextStart.getDate() + cycle);
  }
  return { days, runs, cycle, len, lastStart, nextStart };
}

/* 当前是否正处于经期（含预测窗口） */
function currentRunInfo(stats) {
  const today = new Date();
  for (const r of stats.runs) {
    const start = r.start, end = new Date(r.end);
    if (daysBetween(start, today) >= 0 && daysBetween(today, end) <= 0) {
      return { inPeriod: true, dayNum: daysBetween(start, today) + 1 };
    }
  }
  if (stats.nextStart) {
    const wait = daysBetween(today, stats.nextStart);
    if (wait < 0) return { inPeriod: false, overdue: true, dayNum: -wait };
    return { inPeriod: false, overdue: false, dayNum: wait };
  }
  return { inPeriod: false, overdue: false, dayNum: null };
}

function renderPeriodSummary() {
  const stats = getStats();
  const info = currentRunInfo(stats);
  let text;
  if (info.inPeriod) text = `经期第 ${info.dayNum} 天，好好休息 🌸`;
  else if (info.overdue) text = `已推迟 ${info.dayNum} 天，注意观察哦`;
  else if (info.dayNum === null) text = '记录第一次姨妈开始日期吧';
  else if (info.dayNum === 0) text = '预计就是今天啦，做好准备 🌸';
  else text = `距下次姨妈约 ${info.dayNum} 天`;
  $('#period-summary').textContent = text;
}

/* ---------- 日历 ---------- */
let calCursor = new Date();
calCursor.setDate(1);

function renderCalendar() {
  const year = calCursor.getFullYear(), month = calCursor.getMonth();
  $('#cal-title').textContent = `${year}年${month + 1}月`;
  const days = getPeriodDays();
  const stats = getStats();
  const predicted = new Set();
  if (stats.nextStart) {
    const pStart = stats.nextStart;
    for (let i = 0; i < stats.len; i++) {
      const d = new Date(pStart);
      d.setDate(d.getDate() + i);
      predicted.add(dateKey(d));
    }
  }

  const grid = $('#cal-grid');
  grid.innerHTML = '';
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement('div');
    grid.appendChild(blank);
  }
  for (let d = 1; d <= totalDays; d++) {
    const key = dateKey(new Date(year, month, d));
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = d;
    if (key === todayKey) btn.classList.add('today');
    if (days.has(key)) btn.classList.add('period-day');
    else if (predicted.has(key)) btn.classList.add('predicted');
    btn.addEventListener('click', () => {
      const set = getPeriodDays();
      if (set.has(key)) set.delete(key);
      else set.add(key);
      savePeriodDays(set);
      renderCalendar();
      renderPeriodStats();
      renderPeriodSummary();
    });
    grid.appendChild(btn);
  }
}

function renderPeriodStats() {
  const stats = getStats();
  const info = currentRunInfo(stats);
  $('#stat-last').textContent = stats.lastStart ? fmtDate(stats.lastStart) : '尚未记录';
  $('#stat-cycle').textContent = stats.runs.length >= 2 ? `约 ${stats.cycle} 天` : '记录2次后自动计算';
  $('#stat-len').textContent = stats.runs.length > 0 ? `约 ${stats.len} 天` : '记录后自动计算';
  $('#stat-next').textContent = stats.nextStart ? fmtDate(stats.nextStart) : '--';
}

$('#cal-prev').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  renderCalendar();
});
$('#cal-next').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  renderCalendar();
});

$('#btn-period-came').addEventListener('click', () => {
  const set = getPeriodDays();
  const today = new Date();
  const inToday = set.has(dateKey(today));
  if (inToday) {
    // 已标记今天 → 结束经期：取消今天标记
    set.delete(dateKey(today));
    savePeriodDays(set);
    renderCalendar(); renderPeriodStats(); renderPeriodSummary();
    return;
  }
  // 检查今天是否与最近一段经期相邻（顺延）
  const runs = getRuns(set);
  const last = runs[runs.length - 1];
  if (last && daysBetween(last.end, today) <= 1) {
    set.add(dateKey(today));
  } else if (last && daysBetween(last.end, today) <= 15) {
    // 距离上次结束很近，可能是新一次，重新开始
    set.add(dateKey(today));
  } else {
    set.add(dateKey(today));
  }
  savePeriodDays(set);
  renderCalendar(); renderPeriodStats(); renderPeriodSummary();
});

$('#btn-period-went').addEventListener('click', () => {
  const set = getPeriodDays();
  const today = new Date();
  const todayKey = dateKey(today);
  if (!set.has(todayKey)) {
    alert('今天没有标记姨妈哦，可以点日历直接标记～');
    return;
  }
  // 取消今天起之后连续的标记（结束本次经期）
  let d = new Date(today);
  while (set.has(dateKey(d))) {
    set.delete(dateKey(d));
    d.setDate(d.getDate() + 1);
  }
  savePeriodDays(set);
  renderCalendar(); renderPeriodStats(); renderPeriodSummary();
});

/* ============ 每日歌曲 ============ */
const SONGS = [
  { t: '晴天', a: '周杰伦' }, { t: '七里香', a: '周杰伦' }, { t: '稻香', a: '周杰伦' },
  { t: '平凡之路', a: '朴树' }, { t: '生如夏花', a: '朴树' },
  { t: '成都', a: '赵雷' }, { t: '南方姑娘', a: '赵雷' }, { t: '理想', a: '赵雷' },
  { t: '小幸运', a: '田馥甄' }, { t: '演员', a: '薛之谦' }, { t: '认真的雪', a: '薛之谦' },
  { t: '光年之外', a: '邓紫棋' }, { t: '泡沫', a: '邓紫棋' }, { t: '倒数', a: '邓紫棋' },
  { t: '年少有为', a: '李荣浩' }, { t: '模特', a: '李荣浩' }, { t: '不将就', a: '李荣浩' },
  { t: '起风了', a: '买辣椒也用券' }, { t: '芒种', a: '音阙诗听' }, { t: '少年', a: '梦然' },
  { t: '夜空中最亮的星', a: '逃跑计划' }, { t: '追光者', a: '岑宁儿' },
  { t: '告白气球', a: '周杰伦' }, { t: '等你下课', a: '周杰伦' }, { t: '说好不哭', a: '周杰伦' },
  { t: '江南', a: '林俊杰' }, { t: '修炼爱情', a: '林俊杰' }, { t: '不为谁而作的歌', a: '林俊杰' },
  { t: '突然好想你', a: '五月天' }, { t: '倔强', a: '五月天' }, { t: '知足', a: '五月天' },
  { t: '好久不见', a: '陈奕迅' }, { t: '十年', a: '陈奕迅' }, { t: '富士山下', a: '陈奕迅' },
  { t: '遇见', a: '孙燕姿' }, { t: '我怀念的', a: '孙燕姿' },
  { t: '后来', a: '刘若英' }, { t: '勇气', a: '梁静茹' }, { t: '暖暖', a: '梁静茹' },
  { t: '匆匆那年', a: '王菲' }, { t: '红豆', a: '王菲' },
  { t: '可惜不是你', a: '梁静茹' }, { t: '体面', a: '于文文' },
  { t: '岁月神偷', a: '金玟岐' }, { t: '理想三旬', a: '陈鸿宇' },
  { t: '南山南', a: '马頔' }, { t: '安和桥', a: '宋冬野' },
  { t: '贝加尔湖畔', a: '李健' }, { t: '风吹麦浪', a: '李健' },
  { t: '凉凉', a: '杨宗纬、张碧晨' }, { t: '慢慢喜欢你', a: '莫文蔚' },
  { t: '这世界那么多人', a: '莫文蔚' }, { t: '永不失联的爱', a: '周兴哲' },
  { t: '一路生花', a: '温奕心' }, { t: '孤勇者', a: '陈奕迅' },
  { t: '星辰大海', a: '黄霄雲' }, { t: '大鱼', a: '周深' }, { t: '光亮', a: '周深' },
  { t: '花海', a: '周杰伦' }, { t: '微微', a: '傅如乔' }, { t: '空空如也', a: '胡66' },
];

const COVER_EMOJIS = ['🎵', '🎶', '🎧', '💿', '🎼', '🌙', '🌟', '🎹', '🎤'];
const LS_HOT = 'xiaorui_hot_songs';

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/* QQ音乐热歌榜（JSONP），当天有效，失败则用内置歌单 */
function getHotSongs() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_HOT) || '{}');
    if (data.date === dateKey(new Date()) && Array.isArray(data.songs) && data.songs.length) return data.songs;
  } catch (e) { /* ignore */ }
  return [];
}

function loadQQHotSongs(onLoaded) {
  const cbName = '__xiaoruiHotCb';
  window[cbName] = (resp) => {
    try {
      const list = (resp && resp.songlist) || [];
      const songs = [];
      for (const item of list) {
        const d = item && item.data;
        if (!d || !d.songname) continue;
        const singer = Array.isArray(d.singer) && d.singer.length
          ? d.singer.map((s) => s.name).filter(Boolean).join(' / ')
          : '';
        songs.push({ t: d.songname, a: singer || 'QQ音乐热歌' });
        if (songs.length >= 100) break;
      }
      if (songs.length) {
        localStorage.setItem(LS_HOT, JSON.stringify({ date: dateKey(new Date()), songs }));
      }
    } catch (e) { /* ignore */ }
    cleanup();
    if (onLoaded) onLoaded();
  };
  const cleanup = () => {
    const s = document.getElementById('qqhot-script');
    if (s) s.remove();
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
  };
  const script = document.createElement('script');
  script.id = 'qqhot-script';
  script.onerror = () => { cleanup(); if (onLoaded) onLoaded(); };
  script.src = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=26&format=jsonp&jsonpCallback=${cbName}&tpl=3&page=detail&type=top&song_begin=0&song_num=100`;
  document.body.appendChild(script);
}

function getDailySong() {
  const hot = getHotSongs();
  const pool = hot.length ? hot : SONGS;
  const offset = parseInt(localStorage.getItem('xiaorui_song_offset') || '0', 10);
  const dayIndex = Math.floor(Date.now() / 86400000);
  const idx = ((dayIndex + offset) % pool.length + pool.length) % pool.length;
  return { song: pool[idx], idx, fromHot: hot.length > 0 };
}

function renderSong() {
  const { song, fromHot } = getDailySong();
  $('#song-title').textContent = song.t;
  $('#song-artist').textContent = song.a;
  $('#song-cover').textContent = COVER_EMOJIS[hashStr(song.t) % COVER_EMOJIS.length];
  $('#song-summary').textContent = `${song.t} - ${song.a}`;
  const label = document.querySelector('.song-label');
  if (label) label.textContent = fromHot ? '🔥 QQ音乐热歌榜 · 今日推荐' : '今日份小睿推荐';
}

/* 尝试唤起 QQ 音乐 App 搜索歌曲；未安装则回退到 QQ 音乐网页版 */
$('#btn-play-song').addEventListener('click', () => {
  const { song } = getDailySong();
  const q = encodeURIComponent(`${song.t} ${song.a}`);
  const scheme = `qqmusic://qq.com/ui/search?q=${q}`;
  const webUrl = `https://y.qq.com/n/ryqq/search?w=${q}`;
  const start = Date.now();
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = scheme;
  document.body.appendChild(iframe);
  setTimeout(() => {
    iframe.remove();
    if (Date.now() - start < 1500) {
      const win = window.open(webUrl, '_blank');
      if (!win) location.href = webUrl;
    }
  }, 1000);
});

$('#btn-next-song').addEventListener('click', () => {
  const hot = getHotSongs();
  const pool = hot.length ? hot : SONGS;
  const offset = Math.floor(Math.random() * pool.length);
  localStorage.setItem('xiaorui_song_offset', String(offset));
  renderSong();
});

/* ============ 健康管理 ============ */
const LS_FIT = 'xiaorui_fitness';
const LS_WLOG = 'xiaorui_weight_log';
const FITNESS_DEFAULT = { height: 165, weight: 55, target: 50, age: 25, gender: 'f', act: 1.375 };

function getProfile() {
  return Object.assign({}, FITNESS_DEFAULT, JSON.parse(localStorage.getItem(LS_FIT) || '{}'));
}

function saveProfile(p) {
  localStorage.setItem(LS_FIT, JSON.stringify(p));
  const log = JSON.parse(localStorage.getItem(LS_WLOG) || '{}');
  log[dateKey(new Date())] = p.weight;
  localStorage.setItem(LS_WLOG, JSON.stringify(log));
}

function getWeightLog() {
  return JSON.parse(localStorage.getItem(LS_WLOG) || '{}');
}

/* Mifflin-St Jeor 公式 */
function calcFitness(p) {
  const bmr = Math.round(10 * p.weight + 6.25 * p.height - 5 * p.age + (p.gender === 'm' ? 5 : -161));
  const tdee = Math.round(bmr * p.act);
  const diff = p.weight - p.target;
  let goal = 'maintain', deficit = 0, weekly = 0;
  if (diff > 0.5) {
    goal = 'lose';
    weekly = Math.min(0.6, Math.max(0.3, diff / 8));
    deficit = Math.round((weekly * 7700) / 7 / 10) * 10;
    deficit = Math.min(500, Math.max(300, deficit));
  } else if (diff < -0.5) {
    goal = 'gain';
  }
  const floor = p.gender === 'f' ? 1200 : 1500;
  const intake = Math.max(floor, tdee - deficit + (goal === 'gain' ? 300 : 0));
  return { bmr, tdee, deficit, goal, intake, diff, weekly };
}

const ACTIVITIES = [
  { name: '快走', emoji: '🚶', met: 4.3 },
  { name: '慢跑', emoji: '🏃', met: 8 },
  { name: '跳绳', emoji: '🤸', met: 10 },
  { name: '骑行', emoji: '🚴', met: 6.8 },
  { name: '游泳', emoji: '🏊', met: 8 },
  { name: '瑜伽', emoji: '🧘', met: 3 },
];

function exMinutes(kcal, met, weight) {
  return Math.max(5, Math.round((kcal * 200) / (met * 3.5 * weight) / 5) * 5);
}

function renderExercise() {
  if (!localStorage.getItem(LS_FIT)) {
    $('#exercise-card').hidden = true;
    return;
  }
  const r = calcFitness(getProfile());
  const p = getProfile();
  const target = r.goal === 'lose' ? Math.min(r.deficit, 500) : 250;
  const day = getDailyLog();
  const burn = day.exercises.reduce((s, x) => s + x.kcal, 0);
  const remaining = target - burn;
  $('#exercise-card').hidden = false;
  const list = $('#exercise-list');
  list.innerHTML = '';
  if (remaining <= 0) {
    $('#ex-hint').textContent = '🎉 今日运动目标已完成，继续保持！';
    return;
  }
  $('#ex-hint').textContent = `今日运动目标 ${target} 千卡，已完成 ${burn} 千卡，还差 ${remaining} 千卡～`;
  ACTIVITIES.slice(0, 4).forEach((a) => {
    const row = document.createElement('div');
    row.className = 'ex-item';
    row.innerHTML =
      `<span class="ex-emoji">${a.emoji}</span>` +
      `<span class="ex-name">${a.name}</span>` +
      `<span class="ex-time">${exMinutes(remaining, a.met, p.weight)} 分钟</span>`;
    list.appendChild(row);
  });
}

/* 食谱库：每餐 1-2 样搭配，尽量贴近目标热量 */
const MEALS = {
  breakfast: [
    { n: '燕麦粥 + 水煮蛋', e: '🥣', kcal: 320 },
    { n: '全麦面包 + 牛奶', e: '🍞', kcal: 350 },
    { n: '豆浆 + 素包子', e: '🥟', kcal: 380 },
    { n: '鸡蛋三明治 + 黑咖啡', e: '🥪', kcal: 400 },
    { n: '小米粥 + 凉拌黄瓜', e: '🥒', kcal: 300 },
    { n: '紫薯 + 无糖酸奶', e: '🍠', kcal: 360 },
    { n: '玉米 + 鸡蛋 + 牛奶', e: '🌽', kcal: 420 },
    { n: '香蕉 + 酸奶麦片', e: '🍌', kcal: 380 },
    { n: '蔬菜蛋饼 + 豆浆', e: '🫓', kcal: 330 },
    { n: '荞麦面 + 煎蛋', e: '🍜', kcal: 450 },
  ],
  lunch: [
    { n: '鸡胸肉沙拉 + 糙米饭', e: '🥗', kcal: 550 },
    { n: '番茄炒蛋 + 米饭', e: '🍅', kcal: 600 },
    { n: '清蒸鱼 + 杂粮饭', e: '🐟', kcal: 580 },
    { n: '虾仁西兰花 + 米饭', e: '🦐', kcal: 560 },
    { n: '豆腐蔬菜煲 + 米饭', e: '🍲', kcal: 540 },
    { n: '去皮鸡腿饭', e: '🍗', kcal: 630 },
    { n: '荞麦凉面 + 鸡丝', e: '🥢', kcal: 520 },
    { n: '青椒肉丝 + 米饭', e: '🫑', kcal: 640 },
    { n: '牛肉面（少油）', e: '🍜', kcal: 620 },
    { n: '番茄牛腩 + 半碗饭', e: '🍅', kcal: 650 },
  ],
  dinner: [
    { n: '蔬菜豆腐汤 + 半碗饭', e: '🍲', kcal: 420 },
    { n: '凉拌鸡丝 + 小米粥', e: '🥣', kcal: 450 },
    { n: '清蒸虾 + 蒸南瓜', e: '🎃', kcal: 430 },
    { n: '番茄龙利鱼汤', e: '🍅', kcal: 460 },
    { n: '香菇青菜 + 杂粮饭', e: '🥬', kcal: 480 },
    { n: '紫菜蛋花汤 + 饺子6个', e: '🥟', kcal: 500 },
    { n: '烤鸡胸 + 蔬菜沙拉', e: '🥗', kcal: 440 },
    { n: '冬瓜汤 + 红薯', e: '🍠', kcal: 410 },
    { n: '白灼菜心 + 瘦肉粥', e: '🥬', kcal: 470 },
    { n: '豆腐蒸蛋 + 凉拌木耳', e: '🍄', kcal: 400 },
  ],
  snack: [
    { n: '苹果', e: '🍎', kcal: 90 },
    { n: '无糖酸奶', e: '🥛', kcal: 120 },
    { n: '坚果一小把（20g）', e: '🌰', kcal: 130 },
    { n: '香蕉', e: '🍌', kcal: 105 },
    { n: '橙子', e: '🍊', kcal: 60 },
    { n: '全麦饼干 2 片', e: '🍪', kcal: 110 },
    { n: '水煮蛋', e: '🥚', kcal: 75 },
    { n: '圣女果 10 颗', e: '🍅', kcal: 40 },
    { n: '牛奶 200ml', e: '🥛', kcal: 110 },
    { n: '黄瓜条', e: '🥒', kcal: 30 },
  ],
};
const SLOTS = [
  { key: 'breakfast', tag: '早餐', ratio: 0.25 },
  { key: 'lunch', tag: '午餐', ratio: 0.35 },
  { key: 'dinner', tag: '晚餐', ratio: 0.28 },
  { key: 'snack', tag: '加餐', ratio: 0.12 },
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCombo(pool, target, rng) {
  const combos = [];
  for (let i = 0; i < pool.length; i++) combos.push({ items: [pool[i]], kcal: pool[i].kcal });
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      combos.push({ items: [pool[i], pool[j]], kcal: pool[i].kcal + pool[j].kcal });
    }
  }
  combos.sort((a, b) => Math.abs(a.kcal - target) - Math.abs(b.kcal - target));
  const top = combos.slice(0, 3);
  return top[Math.floor(rng() * top.length)];
}

function renderRecipe(intake) {
  const offset = parseInt(localStorage.getItem('xiaorui_recipe_offset') || '0', 10);
  const dayIndex = Math.floor(Date.now() / 86400000);
  const rng = mulberry32(dayIndex * 7919 + offset * 104729 + 12345);
  const listEl = $('#recipe-list');
  listEl.innerHTML = '';
  let total = 0;
  SLOTS.forEach((slot) => {
    const combo = pickCombo(MEALS[slot.key], intake * slot.ratio, rng);
    total += combo.kcal;
    const row = document.createElement('div');
    row.className = 'recipe-row';
    row.innerHTML =
      `<span class="r-tag">${slot.tag}</span>` +
      `<span class="r-name">${combo.items.map((m) => `${m.e} ${m.n}`).join(' ＋ ')}</span>` +
      `<span class="r-kcal">${combo.kcal} 千卡</span>`;
    listEl.appendChild(row);
  });
  $('#recipe-total').textContent = `全天合计约 ${total} 千卡（建议摄入 ${intake} 千卡，可自行微调分量）`;
}

$('#btn-shuffle-recipe').addEventListener('click', () => {
  const offset = (parseInt(localStorage.getItem('xiaorui_recipe_offset') || '0', 10) + 1) % 100;
  localStorage.setItem('xiaorui_recipe_offset', String(offset));
  renderRecipe(calcFitness(getProfile()).intake);
});

function renderWeightChart() {
  const log = getWeightLog();
  const entries = Object.entries(log).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14);
  const chart = $('#weight-chart');
  chart.innerHTML = '';
  $('#weight-log-card').hidden = entries.length === 0;
  if (entries.length === 0) return;
  const weights = entries.map((e) => e[1]);
  const min = Math.min(...weights), max = Math.max(...weights);
  const span = max - min || 1;
  entries.forEach(([k, w]) => {
    const wrap = document.createElement('div');
    wrap.className = 'w-bar-wrap';
    const h = 20 + ((w - min) / span) * 80;
    const [, m, d] = k.split('-');
    wrap.innerHTML =
      `<span class="w-val">${w}</span>` +
      `<div class="w-bar" style="height:${h}px"></div>` +
      `<span class="w-date">${+m}/${+d}</span>`;
    chart.appendChild(wrap);
  });
}

function renderFitness() {
  const p = getProfile();
  $('#f-height').value = p.height;
  $('#f-weight').value = p.weight;
  $('#f-target').value = p.target;
  $('#f-age').value = p.age;
  document.querySelectorAll('.pill[data-gender]').forEach((b) => b.classList.toggle('active', b.dataset.gender === p.gender));
  document.querySelectorAll('.pill[data-act]').forEach((b) => b.classList.toggle('active', +b.dataset.act === +p.act));

  if (!localStorage.getItem(LS_FIT)) {
    $('#fitness-results').hidden = true;
    $('#exercise-card').hidden = true;
    $('#recipe-card').hidden = true;
    return;
  }
  const r = calcFitness(p);
  $('#f-bmr').textContent = r.bmr;
  $('#f-tdee').textContent = r.tdee;
  $('#f-intake').textContent = r.intake;
  $('#f-deficit').textContent = r.goal === 'lose' ? `-${r.deficit}` : r.goal === 'gain' ? '+300' : '0';
  if (r.goal === 'maintain') {
    $('#f-eta').textContent = '已达成 🎉';
  } else {
    const weeks = r.goal === 'lose' ? Math.abs(r.diff) / r.weekly : Math.abs(r.diff) / 0.3;
    $('#f-eta').textContent = weeks <= 4 ? `约 ${Math.ceil(weeks)} 周` : `约 ${Math.round((weeks / 4.3) * 10) / 10} 个月`;
  }
  $('#fitness-results').hidden = false;
  $('#exercise-card').hidden = false;
  $('#recipe-card').hidden = false;
  renderDaily();
  renderRecipe(r.intake);
  renderWeightChart();
}

document.querySelectorAll('.pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    const group = pill.dataset.gender !== undefined ? 'gender' : 'act';
    document.querySelectorAll(`.pill[data-${group}]`).forEach((b) => b.classList.toggle('active', b === pill));
  });
});

$('#btn-save-fitness').addEventListener('click', () => {
  const num = (sel) => parseFloat($(sel).value);
  const height = num('#f-height'), weight = num('#f-weight');
  const target = num('#f-target'), age = num('#f-age');
  if (!height || !weight || !target || !age) {
    return alert('请把身高、体重、目标体重和年龄都填完整哦～');
  }
  if (height < 100 || height > 250 || weight < 20 || weight > 300 || target < 20 || target > 300 || age < 10 || age > 100) {
    return alert('数据看起来不太对，检查一下哦～');
  }
  const gender = document.querySelector('.pill[data-gender].active').dataset.gender;
  const act = parseFloat(document.querySelector('.pill[data-act].active').dataset.act);
  saveProfile({ height, weight, target, age, gender, act });
  renderFitness();
});

/* ============ 今日记录：饮食与运动 ============ */
const LS_DAILY = 'xiaorui_daily_log';

const FOODS = [
  { n: '米饭（1碗）', e: '🍚', kcal: 232 }, { n: '馒头（1个）', e: '🥯', kcal: 221 },
  { n: '花卷（1个）', e: '🥟', kcal: 217 }, { n: '面条（1碗）', e: '🍜', kcal: 280 },
  { n: '包子（1个）', e: '🥟', kcal: 220 }, { n: '饺子（1个）', e: '🥟', kcal: 40 },
  { n: '油条（1根）', e: '🥖', kcal: 270 }, { n: '白粥（1碗）', e: '🥣', kcal: 80 },
  { n: '全麦面包（1片）', e: '🍞', kcal: 70 }, { n: '白面包（1片）', e: '🍞', kcal: 80 },
  { n: '蛋炒饭（1碗）', e: '🍚', kcal: 480 }, { n: '煎饼（1个）', e: '🫓', kcal: 350 },
  { n: '肉夹馍（1个）', e: '🌮', kcal: 450 }, { n: '螺蛳粉（1碗）', e: '🍜', kcal: 500 },
  { n: '方便面（1包）', e: '🍜', kcal: 470 }, { n: '麻辣烫（1份）', e: '🍲', kcal: 600 },
  { n: '寿司（6个）', e: '🍣', kcal: 300 }, { n: '披萨（1片）', e: '🍕', kcal: 260 },
  { n: '汉堡（1个）', e: '🍔', kcal: 520 }, { n: '薯条（中份）', e: '🍟', kcal: 320 },
  { n: '三明治（1个）', e: '🥪', kcal: 350 }, { n: '燕麦粥（1碗）', e: '🥣', kcal: 150 },
  { n: '红薯（1个）', e: '🍠', kcal: 130 }, { n: '玉米（1根）', e: '🌽', kcal: 110 },
  { n: '土豆（1个）', e: '🥔', kcal: 160 },
  { n: '鸡蛋（1个）', e: '🥚', kcal: 75 }, { n: '鸡胸肉（100g）', e: '🍗', kcal: 133 },
  { n: '鸡腿（1个）', e: '🍗', kcal: 180 }, { n: '鸡翅（1个）', e: '🍗', kcal: 90 },
  { n: '牛肉（100g）', e: '🥩', kcal: 125 }, { n: '猪瘦肉（100g）', e: '🥩', kcal: 143 },
  { n: '五花肉（100g）', e: '🥓', kcal: 400 }, { n: '鱼肉（100g）', e: '🐟', kcal: 110 },
  { n: '虾（100g）', e: '🦐', kcal: 90 }, { n: '豆腐（100g）', e: '🍲', kcal: 80 },
  { n: '豆浆（1杯）', e: '🥛', kcal: 60 }, { n: '牛奶（250ml）', e: '🥛', kcal: 135 },
  { n: '酸奶（1杯）', e: '🥛', kcal: 120 },
  { n: '苹果（1个）', e: '🍎', kcal: 90 }, { n: '香蕉（1根）', e: '🍌', kcal: 105 },
  { n: '橙子（1个）', e: '🍊', kcal: 60 }, { n: '西瓜（1块）', e: '🍉', kcal: 50 },
  { n: '葡萄（1串）', e: '🍇', kcal: 120 }, { n: '梨（1个）', e: '🍐', kcal: 100 },
  { n: '桃（1个）', e: '🍑', kcal: 70 }, { n: '草莓（10颗）', e: '🍓', kcal: 40 },
  { n: '黄瓜（1根）', e: '🥒', kcal: 30 }, { n: '番茄（1个）', e: '🍅', kcal: 25 },
  { n: '蔬菜沙拉（1份）', e: '🥗', kcal: 120 },
  { n: '奶茶（中杯）', e: '🧋', kcal: 350 }, { n: '奶茶（大杯）', e: '🧋', kcal: 460 },
  { n: '可乐（1罐）', e: '🥤', kcal: 140 }, { n: '美式咖啡（1杯）', e: '☕', kcal: 5 },
  { n: '拿铁（1杯）', e: '☕', kcal: 150 }, { n: '啤酒（1瓶）', e: '🍺', kcal: 150 },
  { n: '红酒（1杯）', e: '🍷', kcal: 120 }, { n: '果汁（1杯）', e: '🧃', kcal: 120 },
  { n: '蛋糕（1块）', e: '🍰', kcal: 350 }, { n: '饼干（1包）', e: '🍪', kcal: 220 },
  { n: '巧克力（1块）', e: '🍫', kcal: 60 }, { n: '冰淇淋（1个）', e: '🍦', kcal: 220 },
  { n: '花生（1把）', e: '🥜', kcal: 150 }, { n: '瓜子（1把）', e: '🌻', kcal: 90 },
  { n: '核桃（2个）', e: '🌰', kcal: 60 }, { n: '薯片（1包）', e: '🍟', kcal: 550 },
  { n: '汤圆（5个）', e: '🍡', kcal: 200 }, { n: '月饼（1个）', e: '🥮', kcal: 400 },
  { n: '番茄炒蛋（1份）', e: '🍅', kcal: 250 }, { n: '宫保鸡丁（1份）', e: '🥜', kcal: 480 },
  { n: '鱼香肉丝（1份）', e: '🥢', kcal: 430 }, { n: '青椒肉丝（1份）', e: '🫑', kcal: 400 },
  { n: '清蒸鱼（1份）', e: '🐟', kcal: 300 }, { n: '炒青菜（1份）', e: '🥬', kcal: 120 },
  { n: '红烧肉（1份）', e: '🥩', kcal: 500 }, { n: '麻婆豆腐（1份）', e: '🌶️', kcal: 280 },
  { n: '火锅（1顿）', e: '🍲', kcal: 800 }, { n: '烧烤（1顿）', e: '🍢', kcal: 700 },
];

const SPORTS = [
  { n: '散步', e: '🚶', met: 3 }, { n: '快走', e: '🚶', met: 4.3 },
  { n: '慢跑', e: '🏃', met: 8 }, { n: '跑步（快）', e: '🏃', met: 9.8 },
  { n: '跳绳', e: '🤸', met: 10 }, { n: '游泳', e: '🏊', met: 6 },
  { n: '骑自行车', e: '🚴', met: 6.8 }, { n: '羽毛球', e: '🏸', met: 4.5 },
  { n: '篮球', e: '🏀', met: 6.5 }, { n: '足球', e: '⚽', met: 7 },
  { n: '乒乓球', e: '🏓', met: 4 }, { n: '网球', e: '🎾', met: 7.3 },
  { n: '瑜伽', e: '🧘', met: 3 }, { n: '健身操', e: '🤸', met: 6.5 },
  { n: '爬山', e: '⛰️', met: 6.5 }, { n: '爬楼梯', e: '🪜', met: 8 },
  { n: '跳舞', e: '💃', met: 5 }, { n: '广场舞', e: '💃', met: 4.5 },
  { n: '力量训练', e: '🏋️', met: 5 }, { n: '动感单车', e: '🚴', met: 8.5 },
  { n: '椭圆机', e: '🏋️', met: 5 },
];

function getDailyLog() {
  const all = JSON.parse(localStorage.getItem(LS_DAILY) || '{}');
  return all[dateKey(new Date())] || { foods: [], exercises: [] };
}
function saveDailyLog(day) {
  const all = JSON.parse(localStorage.getItem(LS_DAILY) || '{}');
  all[dateKey(new Date())] = day;
  localStorage.setItem(LS_DAILY, JSON.stringify(all));
}

function burnKcal(met, minutes, weight) {
  return Math.round(((met * 3.5 * weight) / 200) * minutes);
}

function renderDaily() {
  const day = getDailyLog();
  const intake = day.foods.reduce((s, f) => s + f.kcal * f.qty, 0);
  const burn = day.exercises.reduce((s, x) => s + x.kcal, 0);
  $('#daily-date').textContent = fmtDate(new Date());

  const hasProfile = !!localStorage.getItem(LS_FIT);
  let summary = '';
  summary += `<div class="d-sum"><div class="v">${intake}</div><div class="k">已吃（千卡）</div></div>`;
  summary += `<div class="d-sum"><div class="v">${burn}</div><div class="k">运动消耗（千卡）</div></div>`;
  if (hasProfile) {
    const r = calcFitness(getProfile());
    const left = r.intake - intake;
    const targetBurn = r.goal === 'lose' ? Math.min(r.deficit, 500) : 250;
    const needBurn = Math.max(targetBurn - burn, 0);
    summary += `<div class="d-sum"><div class="v">${left}</div><div class="k">还可吃（千卡）</div></div>`;
    summary += `<div class="d-sum"><div class="v">${needBurn}</div><div class="k">还需运动（千卡）</div></div>`;
  }
  $('#daily-summary').innerHTML = summary;

  const fl = $('#food-list');
  fl.innerHTML = day.foods.length ? '' : '<div class="empty-hint">还没记录，搜索一个食物试试～</div>';
  day.foods.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML =
      `<span class="li-name">${f.e} ${f.n}${f.qty > 1 ? ' ×' + f.qty : ''}</span>` +
      `<span class="li-kcal">${f.kcal * f.qty} 千卡</span>` +
      `<button class="li-del" data-type="food" data-idx="${i}">×</button>`;
    fl.appendChild(item);
  });

  const sl = $('#sport-list');
  sl.innerHTML = day.exercises.length ? '' : '<div class="empty-hint">还没运动，加一条试试～</div>';
  day.exercises.forEach((x, i) => {
    const item = document.createElement('div');
    item.className = 'log-item';
    const detail = x.minutes ? `${x.minutes} 分钟` : '手动';
    item.innerHTML =
      `<span class="li-name">${x.e} ${x.n} · ${detail}</span>` +
      `<span class="li-kcal">${x.kcal} 千卡</span>` +
      `<button class="li-del" data-type="sport" data-idx="${i}">×</button>`;
    sl.appendChild(item);
  });

  const gap = $('#gap-box');
  if (!hasProfile) {
    gap.className = 'gap-box';
    gap.textContent = '💡 填写上面的身体数据并保存后，这里会显示热量目标和运动缺口～';
  } else {
    const r = calcFitness(getProfile());
    const p = getProfile();
    const targetBurn = r.goal === 'lose' ? Math.min(r.deficit, 500) : 250;
    const needBurn = targetBurn - burn;
    if (needBurn <= 0) {
      gap.className = 'gap-box done';
      gap.textContent = '🎉 今日运动目标已完成，真棒！';
    } else {
      const opts = [
        { name: '慢跑', met: 8 },
        { name: '快走', met: 4.3 },
        { name: '跳绳', met: 10 },
      ].map((a) => `${a.name} ${exMinutes(needBurn, a.met, p.weight)} 分钟`).join(' ／ ');
      gap.className = 'gap-box';
      gap.textContent = `🔥 还差 ${needBurn} 千卡运动量，试试：${opts}，任选一个就够啦～`;
    }
  }
  renderExercise();
}

function bindLogDelete(listEl, type) {
  listEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.li-del');
    if (!btn) return;
    const day = getDailyLog();
    const arr = type === 'food' ? day.foods : day.exercises;
    const idx = parseInt(btn.dataset.idx, 10);
    if (type === 'food' && arr[idx].qty > 1) arr[idx].qty--;
    else arr.splice(idx, 1);
    saveDailyLog(day);
    renderDaily();
  });
}
bindLogDelete($('#food-list'), 'food');
bindLogDelete($('#sport-list'), 'sport');

(function initSportSelect() {
  const sel = $('#sport-select');
  SPORTS.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.n;
    opt.textContent = `${s.e} ${s.n}`;
    sel.appendChild(opt);
  });
})();

$('#btn-search-food').addEventListener('click', () => {
  const q = $('#food-input').value.trim().toLowerCase();
  const box = $('#food-results');
  box.innerHTML = '';
  if (!q) return;
  const results = FOODS.filter((f) => f.n.toLowerCase().includes(q));
  if (results.length === 0) {
    box.innerHTML = '<div class="food-result">没找到这个食物，用下面手动添加吧～</div>';
    return;
  }
  results.slice(0, 8).forEach((f) => {
    const btn = document.createElement('button');
    btn.className = 'food-result';
    btn.innerHTML = `<span>${f.e} ${f.n}</span><span class="fr-kcal">${f.kcal} 千卡</span>`;
    btn.addEventListener('click', () => {
      const day = getDailyLog();
      const found = day.foods.find((x) => x.n === f.n);
      if (found) found.qty++;
      else day.foods.push({ n: f.n, e: f.e, kcal: f.kcal, qty: 1 });
      saveDailyLog(day);
      $('#food-input').value = '';
      box.innerHTML = '';
      renderDaily();
    });
    box.appendChild(btn);
  });
});
$('#food-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-search-food').click();
});

$('#btn-add-mfood').addEventListener('click', () => {
  const name = $('#mfood-name').value.trim();
  const kcal = parseFloat($('#mfood-kcal').value);
  if (!name || !kcal || kcal <= 0 || kcal > 5000) return alert('请填写食物名和合理的千卡数～');
  const day = getDailyLog();
  day.foods.push({ n: name, e: '🍴', kcal: Math.round(kcal), qty: 1 });
  saveDailyLog(day);
  $('#mfood-name').value = '';
  $('#mfood-kcal').value = '';
  renderDaily();
});

$('#btn-add-sport').addEventListener('click', () => {
  const name = $('#sport-select').value;
  const minutes = parseFloat($('#sport-minutes').value);
  if (!minutes || minutes <= 0 || minutes > 1440) return alert('请填写运动时长（分钟）～');
  const sport = SPORTS.find((s) => s.n === name);
  const day = getDailyLog();
  day.exercises.push({ n: name, e: sport.e, minutes, kcal: burnKcal(sport.met, minutes, getProfile().weight) });
  saveDailyLog(day);
  $('#sport-minutes').value = '';
  renderDaily();
});

document.querySelectorAll('.chip').forEach((c) => {
  c.addEventListener('click', () => {
    $('#sport-minutes').value = c.dataset.mins;
  });
});

$('#btn-add-msport').addEventListener('click', () => {
  const name = $('#msport-name').value.trim();
  const kcal = parseFloat($('#msport-kcal').value);
  if (!name || !kcal || kcal <= 0 || kcal > 3000) return alert('请填写运动名和合理的千卡数～');
  const day = getDailyLog();
  day.exercises.push({ n: name, e: '💪', minutes: null, kcal: Math.round(kcal) });
  saveDailyLog(day);
  $('#msport-name').value = '';
  $('#msport-kcal').value = '';
  renderDaily();
});

/* ============ 记账与预算规划 ============ */
const LS_MONEY = 'xiaorui_money';

const MONEY_CATS = [
  { id: 'food', n: '餐饮', e: '🍚' },
  { id: 'transport', n: '交通', e: '🚌' },
  { id: 'shop', n: '购物', e: '🛍️' },
  { id: 'fun', n: '娱乐', e: '🎮' },
  { id: 'daily', n: '日用', e: '🧴' },
  { id: 'medical', n: '医疗', e: '💊' },
  { id: 'study', n: '学习', e: '📚' },
  { id: 'other', n: '其他', e: '📦' },
];

const CAT_KEYWORDS = [
  ['food', ['吃', '饭', '餐', '奶茶', '咖啡', '外卖', '烧烤', '火锅', '水果', '零食', '面包', '蛋糕', '饮料', '夜宵', '面', '粉', '酒', '茶', '鸡', '鱼', '虾', '蛋', '粥', '汤', '饼', '米', '早', '午', '晚']],
  ['transport', ['打车', '滴滴', '地铁', '公交', '高铁', '火车', '飞机', '加油', '停车', '出租', '单车', '骑行', '车费']],
  ['shop', ['淘宝', '京东', '拼多多', '衣服', '鞋', '包', '化妆品', '口红', '护肤', '面膜', '首饰', '帽子', '裤子', '裙子', '袜子', '手机', '耳机', '数码', '电器']],
  ['fun', ['电影', '游戏', 'KTV', '唱歌', '门票', '游乐', '演出', '会员', '麻将', '桌游', '旅游', '酒店', '景点']],
  ['daily', ['水费', '电费', '燃气', '话费', '房租', '物业', '纸巾', '洗衣', '洗发', '牙膏', '超市', '快递', '日用']],
  ['medical', ['药', '医院', '挂号', '体检', '牙', '口罩', '看病']],
  ['study', ['书', '课程', '培训', '文具', '学习', '报名', '考试', '网课']],
];

function classifyNote(note) {
  if (!note) return null;
  for (const [cat, kws] of CAT_KEYWORDS) {
    if (kws.some((k) => note.includes(k))) return cat;
  }
  return null;
}

function monthKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function getMoney() {
  const data = JSON.parse(localStorage.getItem(LS_MONEY) || '{}');
  return {
    balance: typeof data.balance === 'number' ? data.balance : null,
    target: typeof data.target === 'number' ? data.target : null,
    targetMonth: data.targetMonth || '',
    log: Array.isArray(data.log) ? data.log : [],
  };
}
function saveMoney(m) {
  localStorage.setItem(LS_MONEY, JSON.stringify(m));
}

let selCat = 'food';

function renderMoneyCats() {
  const box = $('#m-cats');
  box.innerHTML = '';
  MONEY_CATS.forEach((c) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (c.id === selCat ? ' active' : '');
    chip.textContent = `${c.e} ${c.n}`;
    chip.addEventListener('click', () => {
      selCat = c.id;
      renderMoneyCats();
    });
    box.appendChild(chip);
  });
}

function renderMoneyLog() {
  const m = getMoney();
  const mk = monthKey(new Date());
  const monthLog = m.log.filter((x) => x.month === mk);
  const el = $('#m-log');
  el.innerHTML = monthLog.length ? '' : '<div class="empty-hint">这个月还没记过账，记一笔试试～</div>';
  [...monthLog].reverse().forEach((x) => {
    const cat = MONEY_CATS.find((c) => c.id === x.cat) || MONEY_CATS[MONEY_CATS.length - 1];
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML =
      `<span class="li-name">${cat.e} ${cat.n}${x.note ? ' · ' + x.note : ''}</span>` +
      `<span class="li-kcal">-${x.amt} 元 · ${x.date}</span>` +
      `<button class="li-del" data-idx="${m.log.indexOf(x)}">×</button>`;
    el.appendChild(item);
  });
}

function todaySpent(m) {
  const now = new Date();
  const mk = monthKey(now);
  const today = `${now.getMonth() + 1}/${now.getDate()}`;
  return m.log.filter((x) => x.month === mk && x.date === today).reduce((s, x) => s + x.amt, 0);
}

function renderMoneyPlan() {
  const m = getMoney();
  const box = $('#m-plan');
  if (m.balance === null) {
    box.className = 'plan-box';
    box.textContent = '💡 先在上面填一下你现在还剩多少钱，我就能帮你算啦～';
    return;
  }
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1;
  const mk = monthKey(now);
  if (m.target !== null && m.targetMonth === mk) {
    const canSpend = Math.round((m.balance - m.target) * 100) / 100;
    if (canSpend < 0) {
      box.className = 'plan-box over';
      box.innerHTML = `⚠️ 本月目标存 <b>${m.target}</b> 元，但现在只剩 <b>${m.balance}</b> 元，已经不够啦～<br>先保证正常生活，下个月再加油！`;
    } else {
      const daily = Math.round((canSpend / daysLeft) * 100) / 100;
      const spent = todaySpent(m);
      let extra = '';
      if (spent > daily) extra = `<br>💬 今天已经花了 ${spent} 元，超过每天预算啦，后面几天省一点～`;
      box.innerHTML =
        `本月目标存 <b>${m.target}</b> 元，剩下 <b>${daysLeft}</b> 天还能花 <b>${canSpend}</b> 元，` +
        `<br>平均每天最多花 <b>${daily}</b> 元${extra}`;
    }
  } else {
    box.className = 'plan-box';
    box.innerHTML = `这个月还剩 <b>${daysLeft}</b> 天，余额 <b>${m.balance}</b> 元，<br>在上面填一个存钱目标，我就帮你算每天最多能花多少～`;
  }
}

function renderMoneyChart() {
  const m = getMoney();
  const mk = monthKey(new Date());
  const monthLog = m.log.filter((x) => x.month === mk);
  const box = $('#m-chart');
  if (!monthLog.length) {
    box.innerHTML = '<div class="empty-hint">记几笔账，这里就会显示你的钱都花在哪儿啦～</div>';
    return;
  }
  const sums = {};
  monthLog.forEach((x) => { sums[x.cat] = (sums[x.cat] || 0) + x.amt; });
  const rows = MONEY_CATS.filter((c) => sums[c.id]).map((c) => ({ cat: c, amt: sums[c.id] }));
  rows.sort((a, b) => b.amt - a.amt);
  const max = rows[0].amt;
  box.innerHTML = '';
  const top = document.createElement('div');
  top.className = 'cat-top';
  top.textContent = `🏆 这个月你在「${rows[0].cat.n}」上花得最多`;
  box.appendChild(top);
  rows.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      `<span class="c-name">${r.cat.e} ${r.cat.n}</span>` +
      `<div class="c-bar"><div class="c-fill" style="width:${Math.max((r.amt / max) * 100, 6)}%"></div></div>` +
      `<span class="c-amt">${Math.round(r.amt)}元</span>`;
    box.appendChild(row);
  });
}

function renderMoney() {
  const m = getMoney();
  $('#m-balance').textContent = m.balance === null ? '--' : `${m.balance} 元`;
  if (document.activeElement !== $('#m-target')) {
    $('#m-target').value = m.target === null ? '' : m.target;
  }
  renderMoneyCats();
  renderMoneyLog();
  renderMoneyPlan();
  renderMoneyChart();
}

$('#m-log').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.li-del');
  if (!btn) return;
  const m = getMoney();
  const idx = parseInt(btn.dataset.idx, 10);
  const x = m.log[idx];
  if (!x) return;
  m.log.splice(idx, 1);
  if (m.balance !== null) m.balance = Math.round((m.balance + x.amt) * 100) / 100;
  saveMoney(m);
  renderMoney();
});

$('#btn-set-balance').addEventListener('click', () => {
  const v = parseFloat($('#m-balance-input').value);
  if (!v || v < 0 || v > 10000000) return alert('请输入你现在的余额（元）～');
  const m = getMoney();
  m.balance = Math.round(v * 100) / 100;
  saveMoney(m);
  $('#m-balance-input').value = '';
  renderMoney();
});

$('#btn-add-spend').addEventListener('click', () => {
  const amt = parseFloat($('#m-amt').value);
  const note = $('#m-note').value.trim();
  if (!amt || amt <= 0 || amt > 100000) return alert('请填写这笔花了多少钱～');
  const m = getMoney();
  const now = new Date();
  const cat = classifyNote(note) || selCat;
  m.log.push({
    month: monthKey(now),
    date: `${now.getMonth() + 1}/${now.getDate()}`,
    amt: Math.round(amt * 100) / 100,
    note,
    cat,
  });
  if (m.balance !== null) m.balance = Math.round((m.balance - amt) * 100) / 100;
  saveMoney(m);
  $('#m-amt').value = '';
  $('#m-note').value = '';
  renderMoney();
});
$('#m-note').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-add-spend').click();
});

$('#btn-set-target').addEventListener('click', () => {
  const v = parseFloat($('#m-target').value);
  if (!v || v < 0 || v > 10000000) return alert('请填写这个月想存下多少钱（元）～');
  const m = getMoney();
  m.target = Math.round(v * 100) / 100;
  m.targetMonth = monthKey(new Date());
  saveMoney(m);
  renderMoney();
});

/* ============ 每日发现：视频 / 美图 / 一文 / 资讯 ============ */
// 每日视频、美图与文章由 daily-content.js 和 /api/daily 提供。

const NEWS_API = 'https://60s.viki.moe/v2/60s';
const NEWS_FALLBACK = 'https://cdn.jsdmirror.com/gh/vikiboss/60s-static-host@main/static/60s/';

function fetchNews() {
  return fetch(NEWS_API)
    .then((r) => r.json())
    .then((data) => {
      const news = data && data.data && Array.isArray(data.data.news) ? data.data.news : [];
      if (!news.length) throw new Error('empty');
      return { date: data.data.date, link: data.data.link || '', news };
    })
    .catch(() => {
      const now = new Date();
      const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return fetch(NEWS_FALLBACK + key + '.json')
        .then((r) => r.json())
        .then((data) => {
          if (!data || !Array.isArray(data.news) || !data.news.length) throw new Error('empty');
          return { date: data.date || key, link: '', news: data.news };
        });
    });
}

function loadNews() {
  const dateEl = $('#news-date');
  const listEl = $('#news-list');
  listEl.innerHTML = '<div class="news-loading">📡 正在加载今日资讯…</div>';
  fetchNews()
    .then(({ date, link, news }) => {
      dateEl.textContent = `📅 ${date}`;
      listEl.innerHTML = '';
      news.forEach((n, i) => {
        const row = document.createElement('a');
        row.className = 'news-item';
        row.href = `https://www.baidu.com/s?wd=${encodeURIComponent(n)}`;
        row.target = '_blank';
        row.rel = 'noopener';
        row.textContent = `${i + 1}. ${n}`;
        const tag = document.createElement('span');
        tag.className = 'n-link';
        tag.textContent = '详情 ›';
        row.appendChild(tag);
        listEl.appendChild(row);
      });
      if (link) {
        const more = document.createElement('a');
        more.className = 'news-more';
        more.href = link;
        more.target = '_blank';
        more.rel = 'noopener';
        more.textContent = '📄 查看完整图文版 ›';
        listEl.appendChild(more);
      }
    })
    .catch(() => {
      dateEl.textContent = '';
      listEl.innerHTML = '<div class="news-loading">😢 资讯加载失败，点右上角「刷新」再试试～</div>';
    });
}

$('#btn-refresh-news').addEventListener('click', loadNews);

/* ============ 安装引导（微信内打开时提示） ============ */
function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
if ((isWeChat() && !isStandalone()) || /[?&]wxguide=1/.test(location.search)) {
  $('#install-guide').hidden = false;
}
$('#btn-close-guide').addEventListener('click', () => {
  $('#install-guide').hidden = true;
});

/* ============ 启动 ============ */
setGreeting();
switchPage('home');
loadWeather();
renderCalendar();
renderPeriodStats();
renderPeriodSummary();
renderSong();
loadQQHotSongs(() => renderSong());
renderFitness();
renderDaily();
renderMoney();
loadNews();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
