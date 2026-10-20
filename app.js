/* Ханьцзы — офлайн-тренажёр иероглифов HSK 3.0.
   Всё хранится на устройстве (localStorage). Никаких внешних запросов, кроме
   скрипта Telegram, если приложение открыто внутри Telegram. */
'use strict';

/* ================= утилиты ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHan = c => /[一-鿿〇]/.test(c);
const DAY = 864e5, MIN = 6e4;
const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const lvName = l => l === 0 ? 'Мои слова' : l === 7 ? 'HSK 7–9' : l < 0 ? 'словарь' : 'HSK ' + l;
function dayKey(t = Date.now()) {
  const d = new Date(t - 4 * 3600e3); // новый день начинается в 4 утра
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
function fmtIv(ms) {
  if (ms < 60 * MIN) return Math.max(1, Math.round(ms / MIN)) + ' мин';
  if (ms < DAY) return Math.round(ms / 3600e3) + ' ч';
  const d = ms / DAY;
  if (d < 30) return Math.round(d) + ' д';
  if (d < 365) return Math.round(d / 30) + ' мес';
  return (d / 365).toFixed(1).replace('.0', '') + ' г';
}
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (action ? ` <button>${esc(action.label)}</button>` : '');
  t.hidden = false;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.fn(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 8000 : 2600);
}

/* ================= хранилище ================= */
const KEY = 'hanzi.v1';
const DEFAULTS = {
  v: 1,
  cards: {},          // слово -> {s: 0 новая/1 учу/2 повтор, d: due, i: интервал(мс), e: лёгкость, k: шаг, r: повторов, f: ошибок, l: уровень}
  queue: [],          // слова, добавленные вручную «Учить первым»
  custom: [],         // мои слова: {w, p, t, m, ex, exp, exm}
  settings: { levels: [1], perDay: 10, dir: 'zh', rate: 0.8, voice: '', pyFront: false, theme: 'auto', autoplay: true },
  days: {},           // 'YYYY-MM-DD' -> {n: новых, r: повторений}
};
let S;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    S = raw ? JSON.parse(raw) : {};
  } catch (e) { S = {}; }
  S = Object.assign(structuredClone(DEFAULTS), S);
  S.settings = Object.assign(structuredClone(DEFAULTS.settings), S.settings);
}
let saveTimer;
function save(now) {
  clearTimeout(saveTimer);
  const f = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Не удалось сохранить прогресс: память браузера недоступна'); } };
  if (now) f(); else saveTimer = setTimeout(f, 300);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => document.hidden && save(true));
function today() { const k = dayKey(); return (S.days[k] ||= { n: 0, r: 0 }); }

/* ================= данные ================= */
const DATA = { levels: {}, byWord: new Map(), chars: null, strokes: {}, strokeEx: null, extra: {}, dict: null, dictP: null, dictMap: null };
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
async function loadLevel(l) {
  if (l === 0) { registerCustom(); return DATA.levels[0]; }
  if (DATA.levels[l]) return DATA.levels[l];
  const arr = await getJSON(`data/hsk${l}.json`);
  const items = arr.map(a => ({ w: a[0], p: a[1], m: a[2], pos: a[3], en: !!a[4], t: a[5], ex: a[6] || '', exp: a[7] || '', exm: a[8] || '', l }));
  items.forEach(it => { if (!DATA.byWord.has(it.w) || DATA.byWord.get(it.w).own) DATA.byWord.set(it.w, it); });
  return (DATA.levels[l] = items);
}
const loadAll = () => Promise.all([...LEVELS, 0].map(loadLevel));
async function loadChars() { return DATA.chars ||= await getJSON('data/chars.json'); }
/* иероглифы вне HSK лежат в 24 файлах data/extra/N.json, N = код % 24 */
function loadExtra(c) {
  const n = c.codePointAt(0) % 24;
  return (DATA.extra[n] ||= getJSON(`data/extra/${n}.json`).catch(e => { delete DATA.extra[n]; throw e; }));
}
async function charInfo(c) {
  const chars = await loadChars();
  if (chars[c]) return chars[c];
  try { return (await loadExtra(c))[c]?.i || null; }
  catch (e) { throw new Error('нужен интернет, чтобы один раз скачать данные этого иероглифа'); }
}
async function strokeData(c) {
  const chars = await loadChars();
  const info = chars[c];
  if (!info) {
    const ex = (await loadExtra(c))[c];
    if (!ex) throw new Error('нет черт для ' + c);
    return ex.s;
  }
  const l = info.l;
  DATA.strokes[l] ||= getJSON(`data/strokes/${l}.json`);
  const d = (await DATA.strokes[l])[c];
  if (!d) throw new Error('нет черт для ' + c);
  return d;
}
/* большой словарь CC-CEDICT: ~120 000 слов, грузится при первом поиске */
function loadDict() {
  return (DATA.dictP ||= getJSON('data/dict.json').then(arr => {
    const items = arr.map(a => ({ w: a[0], tr: a[1], p: a[2], t: a[3], m: a[4], en: true, l: -1, pp: '' }));
    DATA.dict = items;
    DATA.dictMap = new Map();
    items.forEach(x => { if (!DATA.dictMap.has(x.w)) DATA.dictMap.set(x.w, x); });
    return items;
  }).catch(e => { DATA.dictP = null; throw e; }));
}
/* слово из HSK, из «Моих слов» или из большого словаря */
async function findItem(w) {
  await loadAll();
  if (DATA.byWord.has(w)) return DATA.byWord.get(w);
  try { await loadDict(); } catch (e) { return null; }
  return DATA.dictMap.get(w) || null;
}

/* ================= мои слова ================= */
function customItems() {
  return S.custom.map(c => ({ ...c, l: 0, en: false, own: true }));
}
function registerCustom() {
  const items = customItems();
  DATA.levels[0] = items;
  for (const [w, it] of DATA.byWord) if (it.own) DATA.byWord.delete(w);
  items.forEach(it => { if (!DATA.byWord.has(it.w)) DATA.byWord.set(it.w, it); });
}
/* «ni3 hao3» → «nǐ hǎo»; уже размеченный пиньинь не трогаем */
function numToMarks(s) {
  return s.trim().replace(/u:/gi, 'ü').replace(/v/g, 'ü').split(/\s+/).map(syl => {
    const m = syl.match(/^([a-zü]+)([1-5])$/i);
    if (!m) return syl;
    let [, b, t] = m;
    if (t === '5') return b;
    const low = b.toLowerCase();
    let i = low.indexOf('a');
    if (i < 0) i = low.indexOf('e');
    if (i < 0 && low.includes('ou')) i = low.indexOf('o');
    if (i < 0) i = Math.max(...['i', 'o', 'u', 'ü'].map(v => low.lastIndexOf(v)));
    if (i < 0) return b;
    const key = low[i] === 'ü' ? 'v' : low[i];
    return b.slice(0, i) + TONE_RE[key][+t - 1] + b.slice(i + 1);
  }).join(' ');
}

/* ================= тоны и пиньинь ================= */
function hanSpans(it, cls = '') {
  const tones = it.t || '';
  let k = 0;
  return [...it.w].map(c => {
    if (!isHan(c)) return esc(c);
    const t = tones[k++] || '5';
    return `<span class="t${t} ${cls}">${esc(c)}</span>`;
  }).join('');
}
function pySpans(it) {
  const syl = (it.p || '').split(' ');
  const tones = it.t || '';
  if (syl.length !== tones.length) return esc(it.p);
  return syl.map((s, i) => `<span class="t${tones[i]}">${esc(s)}</span>`).join('');
}
const TONE_RE = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', v: 'ǖǘǚǜ' };
function plainPy(s) {
  s = s.toLowerCase();
  for (const [b, m] of Object.entries(TONE_RE)) for (const ch of m) s = s.split(ch).join(b === 'v' ? 'u' : b);
  return s.replace(/ü/g, 'u').replace(/[^a-z]/g, '');
}
function toneOfSyl(s) {
  for (const m of Object.values(TONE_RE)) for (let i = 0; i < 4; i++) if (s.includes(m[i])) return i + 1;
  return 5;
}

/* ================= озвучка ================= */
const TTS = {
  voices: [],
  init() {
    if (!('speechSynthesis' in window)) return;
    const upd = () => { this.voices = speechSynthesis.getVoices().filter(v => /^zh|cmn/i.test(v.lang)); };
    upd();
    speechSynthesis.onvoiceschanged = upd;
  },
  pick() {
    const v = this.voices;
    return v.find(x => x.voiceURI === S.settings.voice) || v.find(x => /zh[-_]CN/i.test(x.lang)) || v[0];
  },
  speak(text) {
    if (!('speechSynthesis' in window)) { toast('Озвучка недоступна в этом браузере'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = S.settings.rate;
    const v = this.pick();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  },
};
const SPEAK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 010 7M18 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const speakBtn = (text, sm) => `<button class="speak${sm ? ' sm' : ''}" data-say="${esc(text)}" aria-label="Послушать">${SPEAK_ICON}</button>`;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-say]');
  if (b) { e.stopPropagation(); TTS.speak(b.dataset.say); }
});

/* ================= интервальные повторения (SM-2 + шаги обучения) ================= */
const STEPS = [1 * MIN, 10 * MIN];
function preview(c, g) { return schedule(structuredClone(c || newCard()), g, Date.now()).i0; }
function newCard(l) { return { s: 0, d: 0, i: 0, e: 2.5, k: 0, r: 0, f: 0, l }; }
/* g: 0 снова, 1 трудно, 2 хорошо, 3 легко */
function schedule(c, g, now) {
  let next;
  if (c.s !== 2) {                         // новая или в обучении
    if (g === 0) { c.k = 0; next = STEPS[0]; c.s = 1; }
    else if (g === 1) { next = STEPS[Math.min(c.k, STEPS.length - 1)] * 1.5; c.s = 1; }
    else if (g === 2) {
      c.k++;
      if (c.k >= STEPS.length) { c.s = 2; c.i = c.f ? Math.max(DAY, c.i) : DAY; next = c.i; }
      else { c.s = 1; next = STEPS[c.k]; }
    } else { c.s = 2; c.i = 4 * DAY; next = c.i; }
  } else {                                  // повторение
    if (g === 0) { c.f++; c.e = Math.max(1.3, c.e - 0.2); c.i = Math.max(DAY, c.i * 0.3); c.s = 1; c.k = 1; next = STEPS[1]; }
    else if (g === 1) { c.e = Math.max(1.3, c.e - 0.15); c.i = Math.max(DAY, c.i * 1.2); next = c.i; }
    else if (g === 2) { c.i = Math.max(DAY, c.i * c.e); next = c.i; }
    else { c.e += 0.15; c.i = Math.max(2 * DAY, c.i * c.e * 1.3); next = c.i; }
  }
  c.r++;
  c.d = now + next;
  c.i0 = next;
  return c;
}
function cardStatus(c) {
  if (!c) return 0;
  if (c.s === 2 && c.i >= 21 * DAY) return 3;   // выучено
  return c.s === 2 ? 2 : 1;
}

/* ================= навигация ================= */
const ROUTES = {};
const stacks = { learn: [], dict: [], strokes: [], me: [] };
let tab = 'learn';
let current = null;   // {name, params, cleanup}
function render(entry) {
  if (current?.cleanup) current.cleanup();
  const view = $('#view');
  view.innerHTML = '';
  const r = ROUTES[entry.name];
  const bar = $('#bar');
  const isSub = stacks[tab].length > 1;
  bar.classList.toggle('sub', isSub);
  $('#back').hidden = !isSub;
  $('#barRight').innerHTML = '';
  document.body.classList.toggle('session', entry.name === 'session');
  current = { ...entry, cleanup: null };
  const ctx = {
    title: t => ($('#title').textContent = t),
    right: html => ($('#barRight').innerHTML = html),
    onCleanup: f => (current.cleanup = f),
  };
  Promise.resolve(r(view, entry.params || {}, ctx)).catch(err => {
    console.error(err);
    view.innerHTML = `<div class="panel">Не удалось открыть экран: ${esc(err.message)}. Обнови страницу; если ошибка повторяется — данные приложения повреждены, открой его с интернетом, чтобы скачать заново.</div>`;
  });
  window.scrollTo(0, entry.scroll || 0);
  if (tg) tg.BackButton[isSub ? 'show' : 'hide']();
}
function go(name, params) {
  const st = stacks[tab];
  if (st.length) st[st.length - 1].scroll = window.scrollY;
  st.push({ name, params });
  render(st[st.length - 1]);
}
function back() {
  const st = stacks[tab];
  if (st.length > 1) { st.pop(); render(st[st.length - 1]); }
}
function switchTab(t) {
  if (t === tab && stacks[t].length > 1) { stacks[t].length = 1; render(stacks[t][0]); return; }
  const st = stacks[tab];
  if (st.length) st[st.length - 1].scroll = window.scrollY;
  tab = t;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  if (!stacks[t].length) stacks[t].push({ name: t });
  render(stacks[t][stacks[t].length - 1]);
}
$('#back').onclick = back;
$$('#tabs button').forEach(b => (b.onclick = () => switchTab(b.dataset.tab)));
function openSheet(html, onMount) {
  const sh = $('#sheet');
  $('#sheetBody').innerHTML = html;
  sh.hidden = false;
  sh.onclick = e => { if (e.target === sh) closeSheet(); };
  onMount && onMount($('#sheetBody'));
}
function closeSheet() { $('#sheet').hidden = true; }

/* ================= очередь на сегодня ================= */
async function buildQueue() {
  await loadAll();
  const now = Date.now();
  const due = [], learning = [];
  for (const [w, c] of Object.entries(S.cards)) {
    if (c.s === 0 || !DATA.byWord.has(w)) continue;
    if (c.d <= now + (c.s === 1 ? 20 * MIN : 0)) (c.s === 1 ? learning : due).push(w);
  }
  due.sort((a, b) => S.cards[a].d - S.cards[b].d);
  const left = Math.max(0, S.settings.perDay - today().n);
  const fresh = [];
  const pushNew = w => { if (fresh.length < left && !fresh.includes(w) && (!S.cards[w] || S.cards[w].s === 0)) fresh.push(w); };
  S.queue = S.queue.filter(w => !S.cards[w] || S.cards[w].s === 0);
  S.queue.forEach(pushNew);
  for (const it of DATA.levels[0]) pushNew(it.w);      // свои слова — в первую очередь
  for (const l of [...S.settings.levels].sort()) for (const it of DATA.levels[l]) { if (fresh.length >= left) break; pushNew(it.w); }
  return { learning, due, fresh };
}

/* ================= экран: Учить ================= */
ROUTES.learn = async (v, p, ctx) => {
  ctx.title('Учить');
  v.innerHTML = '<div class="panel muted">Загружаю слова…</div>';
  const q = await buildQueue();
  const total = q.learning.length + q.due.length + q.fresh.length;
  const t = today();
  const sample = DATA.levels[S.settings.levels[0]]?.[0];
  const glyph = (q.fresh[0] || q.due[0] || q.learning[0] || sample?.w || '学')[0];
  const known = Object.values(S.cards).filter(c => cardStatus(c) === 3).length;
  const studied = Object.values(S.cards).filter(c => c.s > 0).length;
  const streak = calcStreak();
  // неделя
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const k = dayKey(Date.now() - i * DAY);
    const d = S.days[k] || { n: 0, r: 0 };
    week.push({ k, n: d.n + d.r, wd: new Date(Date.now() - i * DAY - 4 * 3600e3).getDay() });
  }
  const maxW = Math.max(10, ...week.map(x => x.n));
  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  v.innerHTML = `
    <div class="panel today">
      <div class="grid"><span class="han">${esc(glyph)}</span></div>
      <div>
        <div class="today-n">${total}<small>${plural(total, 'карточка', 'карточки', 'карточек')}</small></div>
        <div class="today-sub">${q.fresh.length} ${plural(q.fresh.length, 'новое слово', 'новых слова', 'новых слов')}, ${q.due.length + q.learning.length} на повторение</div>
      </div>
    </div>
    <div style="margin-top:12px">
      ${total ? `<button class="btn primary block" id="start">Начать занятие</button>`
      : `<div class="panel"><b>На сегодня всё.</b> <span class="muted">Новые слова появятся завтра. Можно добавить ещё сегодня.</span></div>
         <button class="btn block" id="extra" style="margin-top:10px">Ещё ${S.settings.perDay} новых слов</button>`}
    </div>
    <div class="section">Курс</div>
    <div class="panel">
      <div class="chips" id="lvChips">${LEVELS.map(l => `<button class="chip${S.settings.levels.includes(l) ? ' on' : ''}" data-l="${l}">${lvName(l)}</button>`).join('')}</div>
      <div class="lvl-meta">Новые слова берутся из выбранных уровней, по частоте — сначала самые нужные.</div>
    </div>
    <div class="section">Неделя</div>
    <div class="panel">
      <div class="split">
        <div class="stat"><b>${streak}</b><span>${plural(streak, 'день', 'дня', 'дней')} подряд</span></div>
        <div class="stat"><b>${t.n + t.r}</b><span>карточек сегодня</span></div>
        <div class="stat"><b>${studied}</b><span>слов в изучении</span></div>
        <div class="stat"><b>${known}</b><span>выучено надолго</span></div>
      </div>
      <div class="week">${week.map(x => `<i class="${x.n ? 'on' : ''}" style="height:${Math.max(8, x.n / maxW * 100)}%" title="${x.k}: ${x.n}"></i>`).join('')}</div>
      <div class="week-l">${week.map(x => `<span>${WD[x.wd]}</span>`).join('')}</div>
    </div>
    <p class="credit">Ханьцзы · сделал Ризо</p>`;
  $('#start', v)?.addEventListener('click', () => go('session'));
  $('#extra', v)?.addEventListener('click', () => { today().n -= S.settings.perDay; save(); go('session'); });
  $$('#lvChips .chip', v).forEach(b => b.onclick = () => {
    const l = +b.dataset.l;
    const set = new Set(S.settings.levels);
    set.has(l) ? set.delete(l) : set.add(l);
    if (!set.size) { toast('Нужен хотя бы один уровень'); return; }
    S.settings.levels = [...set].sort();
    save();
    render(stacks[tab][stacks[tab].length - 1]);
  });
};
function calcStreak() {
  let n = 0;
  for (let i = 0; i < 3650; i++) {
    const d = S.days[dayKey(Date.now() - i * DAY)];
    if (d && d.n + d.r > 0) n++;
    else if (i > 0) break;
  }
  return n;
}

/* ================= экран: занятие ================= */
ROUTES.session = async (v, p, ctx) => {
  ctx.title('Занятие');
  const q = await buildQueue();
  // порядок: сначала то, что «горит», новые вперемешку с повторениями
  let list = [...q.learning, ...q.due];
  q.fresh.forEach((w, i) => list.splice(Math.min(list.length, i * 3 + 1), 0, w));
  let doneCount = 0;
  let revealed = false;
  let item, card, dir;
  let writers = [], mistakes = 0, written = false;
  const dirFor = w => {
    const d = S.settings.dir;
    if (d !== 'mix') return d;
    return ['zh', 'ru', 'audio', 'write'][Math.abs([...w].reduce((a, c) => a + c.charCodeAt(0), 0) + (S.cards[w]?.r || 0)) % 4];
  };
  const counts = () => `осталось ${list.length + (revealed ? 0 : 1)}`;
  function cleanupWriters() { writers.forEach(w => { try { w.cancelQuiz(); } catch (e) { } }); writers = []; }
  function next() {
    cleanupWriters();
    const now = Date.now();
    // карточку из обучения, у которой ещё не подошло время, отодвигаем
    let idx = list.findIndex(w => { const c = S.cards[w]; return !c || c.s !== 1 || c.d <= now + 60e3; });
    if (idx < 0 && list.length) idx = 0;
    if (idx < 0) return finish();
    const w = list.splice(idx, 1)[0];
    item = DATA.byWord.get(w);
    if (!item) return next();
    card = S.cards[w] || (S.cards[w] = newCard(item.l));
    revealed = false; mistakes = 0; written = false;
    dir = dirFor(item.w);
    draw();
  }
  function suggested() {
    if (dir !== 'write') return -1;
    if (!written) return 0;
    return mistakes === 0 ? 2 : mistakes <= 2 ? 1 : 0;
  }
  function draw() {
    const long = [...item.w].length > 2;
    const hans = [...item.w].filter(isHan);
    const meaning = `${esc(item.m)}${item.en ? '<span class="en-note">англ.</span>' : ''}`;
    const front = dir === 'ru'
      ? `<div class="card-q"><div class="meaning">${meaning}</div><div class="card-hint">Вспомни слово и как оно пишется</div></div>`
      : dir === 'audio'
        ? `<div class="card-q">${speakBtn(item.w)}<div class="card-hint">Послушай и вспомни слово</div></div>`
        : dir === 'write'
          ? `<div class="card-q" style="justify-content:flex-start">
               <div class="meaning">${meaning}</div>
               <div class="row" style="justify-content:center;margin-top:6px"><div class="py">${pySpans(item)}</div>${speakBtn(item.w, true)}</div>
               <div class="write-row">${hans.map((c, i) => `<div class="grid write-cell" data-wi="${i}"></div>`).join('')}</div>
               <div class="writer-msg" id="wmsg">Напиши ${hans.length > 1 ? 'иероглифы по порядку' : 'иероглиф'} пальцем — черта за чертой</div>
             </div>`
          : `<div class="card-q"><div class="card-word${long ? ' long' : ''}">${esc(item.w)}</div>${S.settings.pyFront ? `<div class="py">${pySpans(item)}</div>` : ''}<div class="card-hint">Вспомни чтение и значение</div></div>`;
    const answer = `
      <div class="card-a">
        ${dir === 'write' && written ? `<div class="write-result ${mistakes ? 'bad' : 'ok'}">${mistakes ? `Ошибок в чертах: ${mistakes}` : 'Написано без ошибок'}</div>` : ''}
        <div class="card-word${long ? ' long' : ''}" style="margin:0 0 6px">${hanSpans(item)}</div>
        <div class="row" style="justify-content:center"><div class="py">${pySpans(item)}</div>${speakBtn(item.w, true)}</div>
        <div class="meaning-a" style="text-align:center">${meaning}</div>
        ${exampleHTML(item)}
        <div class="char-links">${[...new Set(hans)].map(c => `<button class="char-link" data-char="${esc(c)}"><span class="han">${esc(c)}</span>Порядок черт</button>`).join('')}</div>
      </div>`;
    const sg = suggested();
    v.innerHTML = `
      <div class="session-top"><div class="progress"><i style="width:${doneCount / Math.max(1, doneCount + list.length + 1) * 100}%"></i></div><div class="counts">${counts()}</div></div>
      <div class="card">
        ${revealed && dir !== 'ru' && dir !== 'audio' ? '' : front}
        ${revealed ? answer : ''}
      </div>
      ${revealed
        ? `<div class="grades">${['Снова', 'Трудно', 'Хорошо', 'Легко'].map((t, g) => `<button class="grade g${g}${g === sg ? ' suggest' : ''}" data-g="${g}">${t}<small>${fmtIv(preview(card, g))}</small></button>`).join('')}</div>`
        : `<button class="btn ${dir === 'write' ? '' : 'primary '}block flip" id="flip">${dir === 'write' ? 'Не помню — показать' : 'Показать ответ'}</button>`}`;
    $('#flip', v)?.addEventListener('click', reveal);
    $$('.grade', v).forEach(b => b.onclick = () => grade(+b.dataset.g));
    $$('[data-char]', v).forEach(b => b.onclick = () => go('char', { c: b.dataset.char }));
    if (!revealed && dir === 'audio') TTS.speak(item.w);
    if (!revealed && dir === 'write') startWriting(hans);
  }
  async function startWriting(hans) {
    const cells = $$('.write-cell', v);
    const size = Math.round(cells[0].getBoundingClientRect().width);
    const msg = $('#wmsg', v);
    for (let i = 0; i < hans.length; i++) {
      let ok = true;
      try { await strokeData(hans[i]); } catch (e) { ok = false; }
      if (!ok) { cells[i].innerHTML = `<span class="han" style="position:absolute;inset:0;display:grid;place-items:center;font-size:${size * 0.7}px">${esc(hans[i])}</span>`; continue; }
      const wr = makeWriter(cells[i], hans[i], size, { showOutline: false, padding: Math.round(size * 0.08) });
      writers.push(wr);
      cells.forEach((c, j) => c.classList.toggle('on', j === i));
      await new Promise(res => wr.quiz({
        showHintAfterMisses: 3,
        markStrokeCorrectAfterMisses: 6,
        onMistake: d => { mistakes++; msg.textContent = d.mistakesOnStroke >= 3 ? 'Подсказка: черта подсвечена' : 'Не та черта или не то направление'; },
        onCorrectStroke: () => { msg.textContent = ''; },
        onComplete: () => res(),
      }));
      if (revealed) return;   // нажали «Не помню»
    }
    if (revealed) return;
    written = true;
    reveal();
  }
  function reveal() {
    revealed = true;
    cleanupWriters();
    draw();
    if (S.settings.autoplay && dir !== 'audio') TTS.speak(item.w);
  }
  function grade(g) {
    const wasNew = card.s === 0;
    schedule(card, g, Date.now());
    delete card.i0;
    const t = today();
    wasNew ? t.n++ : t.r++;
    doneCount++;
    if (card.s === 1) list.push(item.w);   // ещё раз сегодня
    save();
    next();
  }
  function finish() {
    document.body.classList.remove('session');
    v.innerHTML = `<div class="done"><div class="grid" style="width:140px;margin:0 auto 18px"><span class="han" style="position:absolute;inset:0;display:grid;place-items:center">好</span></div>
      <h2 style="margin:0 0 6px">Занятие закончено</h2>
      <p class="muted">Карточек: ${doneCount}. Следующие повторения появятся сами — заходи завтра.</p>
      <button class="btn primary" id="fin">Готово</button></div>`;
    $('#fin', v).onclick = back;
  }
  const onKey = e => {
    if (e.target.matches('input,textarea')) return;
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (revealed && '1234'.includes(e.key)) grade(+e.key - 1);
  };
  document.addEventListener('keydown', onKey);
  ctx.onCleanup(() => { document.removeEventListener('keydown', onKey); cleanupWriters(); });
  next();
};
function exampleHTML(it) {
  if (!it.ex) return '';
  const zh = esc(it.ex).split(esc(it.w)).join(`<mark>${esc(it.w)}</mark>`);
  return `<div class="example"><div class="row"><div class="grow"><div class="zh">${zh}</div><div class="pyl">${esc(it.exp)}</div></div>${speakBtn(it.ex, true)}</div><div class="ru">${esc(it.exm)}</div></div>`;
}

/* ================= экран: Слова ================= */
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
ROUTES.dict = async (v, p, ctx) => {
  ctx.title('Слова');
  const st = stacks.dict[0];
  st.lv ??= S.settings.levels[0] ?? 1;
  st.q ||= '';
  ctx.right(`<button class="icon-btn" id="addWord" aria-label="Добавить своё слово">+ Слово</button>`);
  $('#addWord').onclick = () => editCustom();
  v.innerHTML = `
    <label class="search">${SEARCH_ICON}<input id="q" type="search" placeholder="Иероглиф, пиньинь или перевод" value="${esc(st.q)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <div class="scroll-x" id="lv">${[0, ...LEVELS].map(l => `<button class="chip${l === st.lv ? ' on' : ''}" data-l="${l}">${lvName(l)}</button>`).join('')}</div>
    <div class="lvl-meta" id="meta"></div>
    <div id="top"></div>
    <div class="list" id="list"></div>
    <div id="big"></div>`;
  const listEl = $('#list', v), meta = $('#meta', v), top = $('#top', v), big = $('#big', v);
  let rows = [], shown = 0, io, seq = 0;
  function rowHTML(it) {
    const s = cardStatus(S.cards[it.w]);
    const tag = it.l < 0 ? '' : `<span class="dot s${s}" title="${['не начато', 'учу', 'повторяю', 'выучено'][s]}"></span>`;
    return `<button class="item" data-w="${esc(it.w)}"><span class="w">${hanSpans(it)}</span><span class="m"><div class="p">${pySpans(it)}</div><div class="d">${esc(it.m)}</div></span>${tag}</button>`;
  }
  function more() {
    const chunk = rows.slice(shown, shown + 120);
    shown += chunk.length;
    listEl.querySelector('.more')?.remove();
    listEl.insertAdjacentHTML('beforeend', chunk.map(rowHTML).join('') + (shown < rows.length ? `<button class="more">Показать ещё (${rows.length - shown})</button>` : ''));
    const m = listEl.querySelector('.more');
    if (m) { m.onclick = more; io?.disconnect(); io = new IntersectionObserver(es => es[0].isIntersecting && more(), { rootMargin: '400px' }); io.observe(m); }
    listEl.hidden = !rows.length;
  }
  const match = (it, q, qp, hasHan, latin) => hasHan ? (it.w.includes(q) || (it.tr && it.tr.includes(q)))
    : (qp && (it.pp ||= plainPy(it.p)).startsWith(qp)) || (!latin || q.length >= 3) && it.m.toLowerCase().includes(q);
  async function update() {
    const my = ++seq;
    const q = st.q.trim().toLowerCase();
    listEl.innerHTML = ''; big.innerHTML = ''; top.innerHTML = '';
    shown = 0;
    if (q) {
      meta.textContent = 'Ищу…';
      await loadAll();
      const qp = plainPy(q);
      const hasHan = [...q].some(isHan);
      const latin = /^[a-z\s']+$/.test(q);
      rows = [];
      for (const l of [0, ...LEVELS]) for (const it of DATA.levels[l]) if (match(it, q, qp, hasHan, latin)) rows.push(it);
      const rank = it => it.w === q ? 0 : plainPy(it.p) === qp ? 1 : 2;
      rows.sort((a, b) => rank(a) - rank(b) || a.w.length - b.w.length);
      // один иероглиф — сразу ссылка на его страницу (даже если его нет в HSK)
      const single = [...q].filter(isHan);
      if (single.length === 1) top.innerHTML = `<button class="char-open" data-char="${esc(single[0])}"><span class="han">${esc(single[0])}</span><span>Как пишется иероглиф ${esc(single[0])}<small>порядок черт, ключ, тренировка</small></span></button>`;
      meta.textContent = rows.length ? `В HSK и моих словах: ${rows.length}` : 'В HSK не нашлось — ищу в большом словаре';
      more();
      // большой словарь
      big.innerHTML = '<div class="lvl-meta">Ищу в большом словаре…</div>';
      try { await loadDict(); } catch (e) { if (my === seq) big.innerHTML = '<div class="lvl-meta">Большой словарь не скачан: нужен интернет, один раз.</div>'; return; }
      if (my !== seq) return;
      const have = new Set(rows.map(r => r.w));
      const res = [];
      for (const it of DATA.dict) {
        if (res.length >= 150) break;
        if (!have.has(it.w) && match(it, q, qp, hasHan, latin)) res.push(it);
      }
      if (hasHan) res.sort((a, b) => (a.w === q ? -1 : 0) - (b.w === q ? -1 : 0));
      big.innerHTML = res.length
        ? `<div class="section">Большой словарь</div><div class="list">${res.map(rowHTML).join('')}</div><div class="lvl-meta">Переводы на английском (CC-CEDICT). Слово можно добавить в свои карточки.</div>`
        : (rows.length ? '' : '<div class="lvl-meta">Ничего не нашлось. Пиньинь пиши без тонов, например «xuexi», или нарисуй иероглиф рукописной клавиатурой iPhone.</div>');
    } else {
      rows = await loadLevel(st.lv);
      if (st.lv === 0) {
        meta.textContent = rows.length ? `${rows.length} ${plural(rows.length, 'слово', 'слова', 'слов')}. Новые свои слова идут в занятия первыми.` : '';
        if (!rows.length) top.innerHTML = `<div class="panel empty"><b>Здесь будут твои слова</b><p class="muted small">Добавь слово из учебника или с вывески — оно попадёт в карточки. Можно искать в словаре и добавлять оттуда.</p><button class="btn primary" id="add0">Добавить слово</button></div>`;
        $('#add0', v)?.addEventListener('click', () => editCustom());
      } else {
        const k = rows.filter(it => cardStatus(S.cards[it.w]) >= 2).length;
        meta.textContent = `${rows.length} ${plural(rows.length, 'слово', 'слова', 'слов')} · знаю ${k}${rows.some(r => r.en) ? ' · переводы на английском' : ''}`;
      }
      more();
    }
  }
  let t;
  $('#q', v).oninput = e => { st.q = e.target.value; clearTimeout(t); t = setTimeout(update, 250); };
  $$('#lv .chip', v).forEach(b => b.onclick = () => { st.lv = +b.dataset.l; st.q = ''; $('#q', v).value = ''; $$('#lv .chip', v).forEach(x => x.classList.toggle('on', x === b)); update(); });
  v.onclick = e => {
    const c = e.target.closest('[data-char]'); if (c) return go('char', { c: c.dataset.char });
    const b = e.target.closest('[data-w]'); if (b) go('word', { w: b.dataset.w });
  };
  ctx.onCleanup(() => io?.disconnect());
  await update();
};

/* ================= свои слова: добавить / изменить ================= */
function editCustom(init = {}) {
  const old = init.w && S.custom.find(x => x.w === init.w);
  const d = old || init;
  openSheet(`
    <h2>${old ? 'Изменить слово' : 'Новое слово'}</h2>
    <form id="cf" class="form">
      <label>Иероглифы<input name="w" required value="${esc(d.w || '')}" placeholder="例如 学习" class="han-input" autocomplete="off"></label>
      <label>Пиньинь<input name="p" value="${esc(d.p || '')}" placeholder="xué xí или xue2 xi2" autocomplete="off" autocapitalize="off"></label>
      <label>Перевод<input name="m" required value="${esc(d.m || '')}" placeholder="учиться" autocomplete="off"></label>
      <label>Пример <small>необязательно</small><input name="ex" value="${esc(d.ex || '')}" class="han-input" autocomplete="off"></label>
      <label>Перевод примера<input name="exm" value="${esc(d.exm || '')}" autocomplete="off"></label>
      <div class="lvl-meta" id="cfHint">Пиньинь и перевод подставятся из словаря, если слово там есть.</div>
      <div class="row" style="margin-top:12px">${old ? '<button type="button" class="btn" id="cfDel" style="color:var(--again)">Удалить</button>' : ''}<button type="button" class="btn grow" id="cfCancel">Отмена</button><button class="btn primary grow">Сохранить</button></div>
    </form>`, body => {
    const f = $('#cf', body);
    const fill = async () => {
      const w = f.w.value.trim();
      if (!w || (f.p.value && f.m.value)) return;
      const it = await findItem(w);
      if (!it) { $('#cfHint', body).textContent = 'В словаре такого слова нет — заполни сам.'; return; }
      if (!f.p.value) f.p.value = it.p;
      if (!f.m.value) f.m.value = it.m.split(' | ')[0];
      $('#cfHint', body).textContent = it.en ? 'Перевод взят из англо-китайского словаря — можешь заменить на русский.' : 'Подставлено из словаря HSK.';
    };
    f.w.addEventListener('change', fill);
    f.w.addEventListener('blur', fill);
    $('#cfCancel', body).onclick = closeSheet;
    $('#cfDel', body)?.addEventListener('click', () => {
      if (!confirm('Удалить слово «' + old.w + '» из своих?')) return;
      S.custom = S.custom.filter(x => x.w !== old.w);
      if (!DATA.levels[1]?.some(x => x.w === old.w)) delete S.cards[old.w];
      registerCustom(); save(); closeSheet(); toast('Слово удалено');
      stacks[tab].length > 1 && stacks[tab].at(-1).name === 'word' ? back() : render(stacks[tab].at(-1));
    });
    f.onsubmit = async e => {
      e.preventDefault();
      const w = f.w.value.trim().replace(/\s+/g, '');
      if (![...w].some(isHan)) { toast('В поле «Иероглифы» нужен хотя бы один иероглиф'); return; }
      const p = numToMarks(f.p.value || '');
      const dictIt = await findItem(w);
      let t = '';
      const syl = p.split(/\s+/).filter(Boolean);
      if (dictIt && !dictIt.own && plainPy(dictIt.p) === plainPy(p)) t = dictIt.t;
      else if (syl.length === [...w].filter(isHan).length) t = syl.map(toneOfSyl).join('');
      const ex = f.ex.value.trim();
      const item = { w, p: t ? (dictIt && dictIt.t === t ? dictIt.p : syl.join(' ')) : p, t, m: f.m.value.trim(), ex, exp: '', exm: f.exm.value.trim() };
      if (old) S.custom = S.custom.map(x => x.w === old.w ? item : x);
      else if (S.custom.some(x => x.w === w)) { toast('Это слово уже есть в твоих'); return; }
      else S.custom.unshift(item);
      registerCustom(); save(); closeSheet();
      toast(old ? 'Сохранено' : 'Добавлено в «Мои слова» — появится в следующем занятии');
      render(stacks[tab].at(-1));
    };
    if (!old) setTimeout(() => f.w.focus(), 50);
    if (!old && d.w) fill();
  });
}

/* ================= экран: слово ================= */
ROUTES.word = async (v, { w }, ctx) => {
  ctx.title(w);
  v.innerHTML = '<div class="panel muted">Загружаю…</div>';
  const it = await findItem(w);
  if (!it) { v.innerHTML = '<div class="panel">Слово не найдено. Если ты без интернета, большой словарь ещё не скачан.</div>'; return; }
  const c = S.cards[w];
  const st = cardStatus(c);
  const learnable = it.l >= 0;
  const uniq = [...new Set([...w].filter(isHan))];
  const infos = await Promise.all(uniq.map(ch => charInfo(ch).catch(() => null)));
  const related = [];
  for (const l of LEVELS) for (const x of DATA.levels[l]) if (x.w !== w && uniq.some(ch => x.w.includes(ch)) && related.length < 12) related.push(x);
  const tags = it.l < 0 ? '<span class="tag">большой словарь</span>' : `<span class="tag">${lvName(it.l)}</span>`;
  v.innerHTML = `
    <div class="panel">
      <div class="word-head"><div class="w">${hanSpans(it)}</div><div class="grow"><div class="py">${pySpans(it)}</div><div class="tags">${tags}${it.pos ? `<span class="tag">${esc(posRu(it.pos))}</span>` : ''}${it.tr ? `<span class="tag">трад. ${esc(it.tr)}</span>` : ''}</div></div>${speakBtn(w)}</div>
      <div class="meaning-a" style="margin-top:10px">${esc(it.m).replace(/ \| /g, '<br>')}${it.en ? '<span class="en-note">англ.</span>' : ''}</div>
      ${exampleHTML(it)}
    </div>
    <div style="margin-top:10px" class="row">
      ${!learnable ? `<button class="btn primary grow" id="toMine">Добавить в мои слова</button>`
      : st === 0 ? `<button class="btn primary grow" id="learn">Учить первым</button>`
      : `<div class="grow muted small">${['', 'Учу сейчас', 'Повторяю', 'Выучено'][st]} · следующее повторение ${c.d > Date.now() ? 'через ' + fmtIv(c.d - Date.now()) : 'сегодня'}</div><button class="btn small" id="reset">Сбросить</button>`}
      ${it.own ? `<button class="btn small" id="edit">Изменить</button>` : ''}
    </div>
    <div class="section">Иероглифы</div>
    <div class="list">${uniq.map((ch, k) => { const i = infos[k] || {}; return `<button class="item" data-char="${esc(ch)}"><span class="w">${esc(ch)}</span><span class="m"><div class="p">${esc((i.p || []).join(', '))}</div><div class="d">${esc(i.d || '')}</div></span><span class="small muted">${(i.o || '').length ? (i.o.length + ' черт') : 'черты'}</span></button>`; }).join('')}</div>
    ${related.length ? `<div class="section">Слова HSK с этими иероглифами</div><div class="list">${related.map(x => `<button class="item" data-w="${esc(x.w)}"><span class="w">${hanSpans(x)}</span><span class="m"><div class="p">${pySpans(x)}</div><div class="d">${esc(x.m)}</div></span></button>`).join('')}</div>` : ''}`;
  $('#learn', v)?.addEventListener('click', () => { S.queue = [w, ...S.queue.filter(x => x !== w)]; save(); toast('Слово будет первым в следующем занятии'); render(stacks[tab].at(-1)); });
  $('#toMine', v)?.addEventListener('click', () => editCustom({ w: it.w, p: it.p, m: it.m.split(' | ')[0] }));
  $('#edit', v)?.addEventListener('click', () => editCustom({ w: it.w }));
  $('#reset', v)?.addEventListener('click', () => { if (confirm('Сбросить прогресс по этому слову?')) { delete S.cards[w]; save(); render(stacks[tab].at(-1)); } });
  $$('[data-char]', v).forEach(b => b.onclick = () => go('char', { c: b.dataset.char }));
  $$('[data-w]', v).forEach(b => b.onclick = () => go('word', { w: b.dataset.w }));
};
const POS = { N: 'сущ.', V: 'глагол', Adj: 'прил.', Adv: 'наречие', Pr: 'местоим.', Num: 'числит.', M: 'счётное', Prep: 'предлог', Conj: 'союз', Aux: 'частица', Int: 'междом.', Ono: 'звукоподр.', Pref: 'приставка', Suf: 'суффикс', Phr: 'выражение', IE: 'выражение' };
const posRu = p => p.split('/').map(x => POS[x] || x).join(', ');

/* ================= черты ================= */
const STROKES = {
  j: { zh: '横', py: 'héng', ru: 'Горизонтальная', how: 'Слева направо' },
  f: { zh: '竖', py: 'shù', ru: 'Вертикальная', how: 'Сверху вниз' },
  s: { zh: '撇', py: 'piě', ru: 'Откидная влево', how: 'Сверху вниз-влево' },
  l: { zh: '捺', py: 'nà', ru: 'Откидная вправо', how: 'Сверху вниз-вправо, с нажимом в конце' },
  k: { zh: '点', py: 'diǎn', ru: 'Точка', how: 'Короткий штрих вниз-вправо' },
  d: { zh: '点', py: 'diǎn', ru: 'Точка (левая)', how: 'Короткий штрих вниз-влево или вверх' },
  i: { zh: '提', py: 'tí', ru: 'Восходящая', how: 'Снизу-слева вверх-вправо' },
  c: { zh: '横折', py: 'héngzhé', ru: 'Горизонтальная с изломом', how: 'Вправо, затем вниз' },
  r: { zh: '横折钩', py: 'héngzhégōu', ru: 'Горизонтальная с изломом и крюком', how: 'Вправо, вниз, крюк влево' },
  e: { zh: '横撇', py: 'héngpiě', ru: 'Горизонтальная с откидной', how: 'Вправо, затем длинно вниз-влево (又, 了)' },
  E: { zh: '横钩', py: 'hénggōu', ru: 'Горизонтальная с крюком', how: 'Вправо, в конце короткий крюк вниз (冖, 买)' },
  g: { zh: '竖钩', py: 'shùgōu', ru: 'Вертикальная с крюком', how: 'Вниз, в конце крюк влево' },
  n: { zh: '撇折', py: 'piězhé', ru: 'Откидная с изломом', how: 'Вниз-влево, затем вправо-вверх' },
  u: { zh: '竖弯钩', py: 'shùwāngōu', ru: 'Вертикальная с изгибом и крюком', how: 'Вниз, плавно вправо, крюк вверх' },
  h: { zh: '竖提', py: 'shùtí', ru: 'Вертикальная с восходящей', how: 'Вниз, затем вверх-вправо' },
  b: { zh: '竖折 / 竖弯', py: 'shùzhé / shùwān', ru: 'Вертикальная с изломом (изгибом)', how: 'Вниз, затем вправо' },
  y: { zh: '斜钩', py: 'xiégōu', ru: 'Наклонный крюк', how: 'Длинно вниз-вправо, крюк вверх (我, 戈)' },
  Y: { zh: '卧钩', py: 'wògōu', ru: 'Лежачий крюк', how: 'Пологой дугой вправо, крюк вверх (心)' },
  a: { zh: '横折折撇', py: 'héngzhézhépiě', ru: 'Горизонтальная, два излома и откидная', how: 'Как в 这, 边' },
  z: { zh: '竖折折钩', py: 'shùzhézhégōu', ru: 'Вертикальная, два излома и крюк', how: 'Как в 马, 号' },
  m: { zh: '撇点', py: 'piědiǎn', ru: 'Откидная с точкой', how: 'Вниз-влево, затем вниз-вправо (как в 女)' },
  w: { zh: '横折折折钩 / 横撇弯钩', py: 'héngzhézhézhégōu / héngpiěwāngōu', ru: 'Сложный крюк (乃, 阝)', how: 'Несколько изломов и крюк' },
  p: { zh: '横折提', py: 'héngzhétí', ru: 'Горизонтальная с изломом и восходящей', how: 'Как в 讠' },
  o: { zh: '横斜钩', py: 'héngxiégōu', ru: 'Горизонтальная с наклонным крюком', how: 'Как в 九, 风' },
  t: { zh: '弯钩', py: 'wāngōu', ru: 'Изогнутый крюк', how: 'Как в 豕, 狗' },
  v: { zh: '横折折 / 横折弯', py: 'héngzhézhé / héngzhéwān', ru: 'Горизонтальная с двумя изломами', how: 'Как в 没, 船' },
  x: { zh: '竖折撇 / 竖折折', py: 'shùzhépiě / shùzhézhé', ru: 'Вертикальная с изломом и откидной', how: 'Как в 专' },
  q: { zh: '横折折折', py: 'héngzhézhézhé', ru: 'Горизонтальная с тремя изломами', how: 'Как в 凸' },
};
const STROKE_ORDER = ['j', 'f', 's', 'l', 'k', 'd', 'i', 'c', 'r', 'e', 'E', 'g', 'n', 'u', 'h', 'b', 'y', 'Y', 'm', 'z', 'a', 'p', 'o', 'w', 't', 'v', 'x', 'q'];
const RULES = [
  { c: '十', ru: 'Сначала горизонтальная, потом вертикальная', zh: '先横后竖' },
  { c: '八', ru: 'Сначала откидная влево, потом вправо', zh: '先撇后捺' },
  { c: '三', ru: 'Сверху вниз', zh: '从上到下' },
  { c: '川', ru: 'Слева направо', zh: '从左到右' },
  { c: '月', ru: 'Сначала внешнее, потом внутреннее', zh: '从外到内' },
  { c: '日', ru: 'Сначала внутреннее, потом закрыть рамку', zh: '先里头后封口' },
  { c: '小', ru: 'Сначала середина, потом стороны', zh: '先中间后两边' },
];

/* мини-сетка со стрелкой: штрих i выделен, предыдущие — тушью */
function strokeSVG(data, upto, opts = {}) {
  const paths = data.strokes.map((d, i) => {
    const col = i < upto ? 'var(--ink)' : i === upto ? 'var(--jade)' : 'color-mix(in srgb, var(--ink) 14%, transparent)';
    return `<path d="${d}" fill="${col}"/>`;
  }).join('');
  return `<svg viewBox="0 0 1024 1024" aria-hidden="true"><g transform="translate(0,900) scale(1,-1)">${paths}</g></svg>`;
}

ROUTES.strokes = async (v, p, ctx) => {
  ctx.title('Черты');
  DATA.strokeEx ||= await getJSON('data/stroke_examples.json');
  v.innerHTML = `
    <p class="muted" style="margin:0 0 4px">Любой иероглиф собирается из небольшого набора черт. Нажми на черту, чтобы увидеть её в иероглифах.</p>
    <div class="section">Правила порядка черт</div>
    <div class="panel" id="rules">${RULES.map((r, i) => `<div class="rule"><button class="grid" data-rule="${i}" aria-label="Показать ${r.c}"></button><div><b>${esc(r.ru)}</b><span class="zh">${esc(r.zh)}</span></div></div>`).join('')}</div>
    <div class="section">Все черты</div>
    <div class="list">${STROKE_ORDER.filter(k => DATA.strokeEx[k]).map(k => { const s = STROKES[k]; return `<button class="stroke-card" data-k="${k}"><span class="shape" data-shape="${k}"></span><span class="grow"><b class="han" style="font-size:18px">${esc(s.zh)}</b> <span class="muted small">${esc(s.py)}</span><div>${esc(s.ru)}</div><div class="ex">${DATA.strokeEx[k].map(esc).join('')}</div></span></button>`; }).join('')}</div>`;
  // правила — анимации по очереди, по нажатию повтор
  const writers = [];
  for (const [i, r] of RULES.entries()) {
    const el = $(`[data-rule="${i}"]`, v);
    const wr = makeWriter(el, r.c, 92, { showOutline: true, strokeAnimationSpeed: 1.2, delayBetweenStrokes: 220 });
    writers.push(wr);
    el.onclick = () => wr.animateCharacter();
  }
  let alive = true;
  (async () => { for (const wr of writers) { if (!alive) return; await wr.animateCharacter(); } })();
  ctx.onCleanup(() => { alive = false; });
  // образцы черт — первый пример с выделенной чертой
  for (const k of STROKE_ORDER) {
    const el = $(`[data-shape="${k}"]`, v);
    if (!el || !DATA.strokeEx[k]) continue;
    const c = DATA.strokeEx[k][0];
    const info = (await loadChars())[c];
    const idx = info.o.indexOf(k);
    strokeData(c).then(d => { el.innerHTML = `<svg viewBox="0 0 1024 1024" width="44" height="44" aria-hidden="true"><g transform="translate(0,900) scale(1,-1)"><path d="${d.strokes[idx]}" fill="var(--ink)"/></g></svg>`; });
  }
  $$('[data-k]', v).forEach(b => b.onclick = () => go('stroke', { k: b.dataset.k }));
};
ROUTES.stroke = async (v, { k }, ctx) => {
  const s = STROKES[k];
  ctx.title(s.zh);
  DATA.strokeEx ||= await getJSON('data/stroke_examples.json');
  const chars = await loadChars();
  v.innerHTML = `<div class="panel"><div class="row"><span class="han" style="font-size:44px">${esc(s.zh)}</span><div class="grow"><div class="py">${esc(s.py)}</div><div>${esc(s.ru)}</div><div class="muted small">${esc(s.how)}</div></div>${speakBtn(s.zh.split(' / ')[0])}</div></div>
    <div class="section">В иероглифах</div><div class="seq" id="ex"></div>`;
  const box = $('#ex', v);
  for (const c of DATA.strokeEx[k]) {
    const idx = chars[c].o.indexOf(k);
    const d = await strokeData(c);
    const paths = d.strokes.map((p, i) => `<path d="${p}" fill="${i === idx ? 'var(--jade)' : 'color-mix(in srgb, var(--ink) 22%, transparent)'}"/>`).join('');
    box.insertAdjacentHTML('beforeend', `<button class="seq-i" data-char="${esc(c)}"><div class="grid"><svg viewBox="0 0 1024 1024" aria-hidden="true"><g transform="translate(0,900) scale(1,-1)">${paths}</g></svg></div><b>${idx + 1}-я черта</b><span>${esc(c)}</span></button>`);
  }
  $$('[data-char]', v).forEach(b => b.onclick = () => go('char', { c: b.dataset.char }));
};

/* ================= экран: иероглиф ================= */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}
function makeWriter(el, c, size, extra = {}) {
  return HanziWriter.create(el, c, Object.assign({
    width: size, height: size, padding: Math.round(size * 0.06),
    showOutline: true, showCharacter: false,
    strokeColor: cssVar('--ink'), outlineColor: mixHex(cssVar('--ink'), cssVar('--raised'), 0.14),
    radicalColor: null, highlightColor: cssVar('--jade'), drawingColor: cssVar('--jade'), drawingWidth: Math.max(14, size / 14),
    strokeAnimationSpeed: 1, delayBetweenStrokes: 280,
    charDataLoader: (ch, onLoad, onErr) => { strokeData(ch).then(onLoad, onErr); },
  }, extra));
}
ROUTES.char = async (v, { c }, ctx) => {
  ctx.title(c);
  v.innerHTML = '<div class="panel muted">Загружаю…</div>';
  let info;
  try { info = await charInfo(c); }
  catch (e) { v.innerHTML = `<div class="panel">Не получилось загрузить «${esc(c)}»: ${esc(e.message)}.</div>`; return; }
  if (!info) { v.innerHTML = `<div class="panel">Для «${esc(c)}» нет данных о порядке черт. Есть данные для 9500 самых употребительных иероглифов.</div>`; return; }
  await loadAll();
  const data = await strokeData(c);
  const n = data.strokes.length;
  const size = Math.min(300, Math.round(window.innerWidth * 0.78));
  const words = [];
  for (const l of [0, ...LEVELS]) for (const x of DATA.levels[l]) if (x.w.includes(c) && words.length < 16) words.push(x);
  if (words.length < 8) {
    try {
      await loadDict();
      for (const x of DATA.dict) { if (words.length >= 12) break; if (x.w.includes(c) && !words.some(y => y.w === x.w)) words.push(x); }
    } catch (e) { /* без интернета — только слова HSK */ }
  }
  const self = DATA.byWord.get(c) || DATA.dictMap?.get(c);
  v.innerHTML = `
    <div class="writer-wrap">
      <div class="grid writer" id="wr" style="width:${size}px"></div>
      <div class="writer-msg" id="msg">${n} ${plural(n, 'черта', 'черты', 'черт')}</div>
      <div class="writer-ctrl">
        <button class="btn small" id="anim">Анимация</button>
        <button class="btn small" id="quiz">Написать самому</button>
        <button class="btn small" id="outline">Контур</button>
        ${speakBtn(c, true)}
      </div>
    </div>
    <div class="section">Последовательность черт</div>
    <div class="seq" id="seq">${data.strokes.map((_, i) => `<button class="seq-i" data-i="${i}"><div class="grid">${strokeSVG(data, i)}</div><b>${i + 1}</b><span>${esc(STROKES[info.o[i]]?.zh.split(' / ')[0] || '')}</span></button>`).join('')}</div>
    ${info.o ? `<div class="section">Названия черт по порядку</div>
    <div class="panel" style="padding:4px 16px">${[...info.o].map((k, i) => { const s = STROKES[k] || {}; return `<div class="stroke-row"><span class="n">${i + 1}</span><span class="nm"><b>${esc(s.zh || '?')}</b><i>${esc(s.py || '')}</i><div>${esc(s.ru || '')}</div></span></div>`; }).join('')}</div>` : ''}
    <div class="section">Об иероглифе</div>
    <div class="panel"><dl class="kv">
      <dt>Чтение</dt><dd>${(info.p || []).map(p => `<span class="t${toneOfSyl(p)}" style="font-weight:600">${esc(p)}</span>`).join(', ')}</dd>
      <dt>Значение</dt><dd>${esc(self ? self.m : info.d)}${!self && info.dl === 'en' ? '<span class="en-note">англ.</span>' : ''}</dd>
      ${info.r ? `<dt>Ключ</dt><dd><span class="han">${esc(info.r)}</span></dd>` : ''}
      ${info.c && !/^？/.test(info.c) ? `<dt>Состав</dt><dd><span class="han">${esc(info.c)}</span></dd>` : ''}
      <dt>Уровень</dt><dd>${info.l ? lvName(info.l) : 'вне HSK'}${info.w ? ` · писать нужно с HSK ${info.w}` : ''}</dd>
      ${info.h ? `<dt>Подсказка</dt><dd class="hint-en">${esc(info.h)}</dd>` : ''}
    </dl></div>
    ${words.length ? `<div class="section">Слова с этим иероглифом</div><div class="list">${words.map(x => `<button class="item" data-w="${esc(x.w)}"><span class="w">${hanSpans(x)}</span><span class="m"><div class="p">${pySpans(x)}</div><div class="d">${esc(x.m)}</div></span><span class="small muted">${x.l < 0 ? '' : lvName(x.l)}</span></button>`).join('')}</div>` : ''}`;
  const wr = makeWriter($('#wr', v), c, size, { showCharacter: false });
  const msg = $('#msg', v);
  let outline = true, quizzing = false;
  const seqBtns = $$('.seq-i', v);
  const mark = i => seqBtns.forEach((b, j) => b.classList.toggle('on', j === i));
  wr.animateCharacter();
  $('#anim', v).onclick = () => { quizzing = false; mark(-1); msg.textContent = `${n} ${plural(n, 'черта', 'черты', 'черт')}`; wr.hideCharacter(); wr.animateCharacter(); };
  $('#outline', v).onclick = () => { outline = !outline; outline ? wr.showOutline() : wr.hideOutline(); };
  $('#quiz', v).onclick = () => {
    quizzing = true;
    wr.hideCharacter();
    msg.textContent = 'Пиши пальцем по сетке, черта за чертой';
    wr.quiz({
      showHintAfterMisses: 2,
      onCorrectStroke: d => { mark(d.strokeNum); msg.textContent = d.strokesRemaining ? `Верно. Осталось ${d.strokesRemaining}` : ''; },
      onMistake: d => { msg.textContent = d.mistakesOnStroke >= 2 ? 'Подсказка: смотри, где начинается черта' : 'Не та черта или не то направление'; },
      onComplete: d => { msg.textContent = d.totalMistakes ? `Готово, ошибок: ${d.totalMistakes}` : 'Отлично, без ошибок!'; },
    });
  };
  seqBtns.forEach(b => b.onclick = () => { if (quizzing) return; const i = +b.dataset.i; mark(i); msg.textContent = `${i + 1}. ${STROKES[info.o[i]]?.ru || ''}`; wr.animateStroke(i); });
  $$('[data-w]', v).forEach(b => b.onclick = () => go('word', { w: b.dataset.w }));
  ctx.onCleanup(() => { try { wr.cancelQuiz(); wr.pauseAnimation(); } catch (e) { } });
};

/* ================= экран: Прогресс и настройки ================= */
ROUTES.me = async (v, p, ctx) => {
  ctx.title('Прогресс');
  await loadAll();
  const rows = LEVELS.map(l => {
    const items = DATA.levels[l];
    let k = 0, s = 0;
    for (const it of items) { const st = cardStatus(S.cards[it.w]); if (st === 3) k++; else if (st) s++; }
    return { l, total: items.length, k, s };
  });
  const voices = TTS.voices;
  const sv = S.settings;
  const cached = await offlineState();
  v.innerHTML = `
    <div class="panel">${rows.map(r => `<div class="lv-row"><b>${lvName(r.l)}</b><div class="bar3"><i class="k" style="width:${r.k / r.total * 100}%"></i><i class="s" style="width:${r.s / r.total * 100}%"></i></div><span>${r.k + r.s}/${r.total}</span></div>`).join('')}
      <div class="small muted" style="margin-top:6px"><span class="dot s3" style="display:inline-block"></span> выучено надолго &nbsp; <span class="dot s1" style="display:inline-block"></span> в процессе</div></div>

    <div class="section">Занятия</div>
    <div class="panel" style="padding:2px 16px">
      <div class="setting"><label>Новых слов в день</label><div class="stepper"><button data-step="-5" aria-label="Меньше">−</button><output id="perDay">${sv.perDay}</output><button data-step="5" aria-label="Больше">+</button></div></div>
      <div class="setting"><label for="dir">Лицевая сторона карточки</label><select id="dir">
        <option value="zh">Иероглиф</option><option value="ru">Перевод</option><option value="audio">Только звук</option><option value="write">Написать иероглиф</option><option value="mix">Вперемешку</option></select></div>
      <div class="setting"><label for="pyf">Пиньинь на лицевой стороне<small>Удобно в самом начале</small></label><input type="checkbox" class="switch" id="pyf" ${sv.pyFront ? 'checked' : ''}></div>
      <div class="setting"><label for="ap">Произносить слово при ответе</label><input type="checkbox" class="switch" id="ap" ${sv.autoplay ? 'checked' : ''}></div>
    </div>

    <div class="section">Озвучка</div>
    <div class="panel" style="padding:2px 16px">
      <div class="setting"><label for="voice">Голос${voices.length ? '' : '<small>Китайский голос не найден. На iPhone: Настройки → Универсальный доступ → Устная речь → Голоса → Китайский (материковый Китай).</small>'}</label>
        ${voices.length ? `<select id="voice">${voices.map(x => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === sv.voice ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}</div>
      <div class="setting"><label for="rate">Скорость<small>${sv.rate.toFixed(1)}×</small></label><input id="rate" type="range" min="0.5" max="1.2" step="0.1" value="${sv.rate}"></div>
      <div class="setting"><label>Проверить</label><button class="btn small" data-say="你好，我在学习汉语。">你好</button></div>
    </div>

    <div class="section">Оформление</div>
    <div class="panel"><div class="chips" id="theme">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, t]) => `<button class="chip${sv.theme === k ? ' on' : ''}" data-t="${k}">${t}</button>`).join('')}</div></div>

    <div class="section">Без интернета</div>
    <div class="panel"><div class="offline"><span class="dot ${cached.ok ? 's2' : 's1'}"></span><div class="grow">${esc(cached.text)}</div></div>
      ${cached.ok ? '' : '<button class="btn small" id="recache" style="margin-top:10px">Скачать для офлайна</button>'}
      <div class="offline" style="margin-top:12px"><span class="dot ${cached.big ? 's2' : ''}"></span><div class="grow">${cached.big ? 'Большой словарь (120 000 слов, 9500 иероглифов) скачан.' : 'Большой словарь скачивается по частям, когда ищешь. Можно скачать целиком — около 13 МБ.'}</div></div>
      ${cached.big ? '' : '<button class="btn small" id="bigdl" style="margin-top:10px">Скачать большой словарь</button>'}
      <div class="lvl-meta" id="bigmsg"></div></div>

    <div class="section">Сохранение прогресса</div>
    <div class="panel">
      <p class="small muted" style="margin:0 0 10px">Прогресс хранится только на этом устройстве. Сохраняй копию раз в неделю — в «Файлы» или себе в чат.</p>
      <div class="row"><button class="btn small grow" id="exp">Сохранить копию</button><button class="btn small grow" id="imp">Загрузить копию</button></div>
      <input type="file" id="file" accept=".json,application/json,text/plain" hidden>
    </div>

    <div class="section">О приложении</div>
    <div class="panel author">
      <div class="author-mark grid"><span class="han">字</span></div>
      <div><b>Ханьцзы</b><div class="muted small">Автор и разработчик — Ризо<br>Telegram: <a href="https://t.me/rllzo" target="_blank" rel="noopener">@rllzo</a></div></div>
    </div>
    <div class="panel small muted">
      Слова — официальный список HSK 3.0 (11 000 слов). Переводы на русский и примеры — для HSK 1–2, на остальных уровнях пока английский.
      Большой словарь — CC-CEDICT (CC BY-SA 4.0). Порядок черт — Make Me a Hanzi и Hanzi Writer (Arphic PL, MIT), названия черт — cnchar, шрифт — LXGW WenKai.
      <div style="margin-top:8px">Версия ${esc(APP_VERSION || 'dev')}</div>
      <button class="btn small" id="wipe" style="margin-top:10px;color:var(--again)">Стереть весь прогресс</button>
    </div>`;
  $('#dir', v).value = sv.dir;
  $$('[data-step]', v).forEach(b => b.onclick = () => { sv.perDay = Math.max(0, Math.min(100, sv.perDay + +b.dataset.step)); $('#perDay', v).textContent = sv.perDay; save(); });
  $('#dir', v).onchange = e => { sv.dir = e.target.value; save(); };
  $('#pyf', v).onchange = e => { sv.pyFront = e.target.checked; save(); };
  $('#ap', v).onchange = e => { sv.autoplay = e.target.checked; save(); };
  $('#voice', v)?.addEventListener('change', e => { sv.voice = e.target.value; save(); TTS.speak('你好'); });
  $('#rate', v).oninput = e => { sv.rate = +e.target.value; e.target.previousElementSibling.querySelector('small').textContent = sv.rate.toFixed(1) + '×'; save(); };
  $$('#theme .chip', v).forEach(b => b.onclick = () => { sv.theme = b.dataset.t; applyTheme(); save(); $$('#theme .chip', v).forEach(x => x.classList.toggle('on', x === b)); });
  $('#recache', v)?.addEventListener('click', () => { registerSW(true); toast('Скачиваю… это займёт минуту'); });
  $('#bigdl', v)?.addEventListener('click', async e => {
    const b = e.target; b.disabled = true;
    const m = $('#bigmsg', v);
    try {
      await downloadBig((d, n) => { m.textContent = `Скачано ${d} из ${n}`; });
      m.textContent = 'Готово: словарь работает без интернета';
      b.remove();
    } catch (err) { m.textContent = 'Не удалось скачать: ' + err.message + '. Проверь интернет и попробуй ещё раз.'; b.disabled = false; }
  });
  $('#exp', v).onclick = exportData;
  $('#imp', v).onclick = () => $('#file', v).click();
  $('#file', v).onchange = e => { const f = e.target.files[0]; if (f) f.text().then(importData); };
  $('#wipe', v).onclick = () => { if (confirm('Стереть весь прогресс? Это нельзя отменить. Сначала лучше сохранить копию.')) { const st = S.settings; S = structuredClone(DEFAULTS); S.settings = st; save(true); toast('Прогресс стёрт'); render(stacks[tab].at(-1)); } };
};
async function exportData() {
  save(true);
  const json = JSON.stringify(S);
  const name = `hanzi-progress-${dayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Прогресс Ханьцзы' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Файл сохранён: ' + name);
}
function importData(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { toast('Это не файл прогресса: не удалось прочитать JSON'); return; }
  if (!d || typeof d.cards !== 'object') { toast('В файле нет карточек — выбери файл hanzi-progress-….json'); return; }
  const n = Object.keys(d.cards).length;
  if (!confirm(`Загрузить копию? В ней ${n} слов. Текущий прогресс на этом устройстве будет заменён.`)) return;
  S = Object.assign(structuredClone(DEFAULTS), d);
  S.settings = Object.assign(structuredClone(DEFAULTS.settings), d.settings);
  save(true);
  applyTheme();
  toast('Прогресс загружен: ' + n + ' слов');
  render(stacks[tab].at(-1));
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

/* ================= офлайн (service worker) ================= */
let APP_VERSION = '';
let PRECACHE = null;
async function downloadBig(onProgress) {
  const j = PRECACHE || await (await fetch('precache.json', { cache: 'no-store' })).json();
  const cache = await caches.open('hzlazy-' + j.lazyVersion);
  let done = 0;
  for (const f of j.lazy) {
    if (!(await cache.match(f))) {
      const r = await fetch(f, { cache: 'reload' });
      if (!r.ok) throw new Error(f + ': ' + r.status);
      await cache.put(f, r);
    }
    onProgress(++done, j.lazy.length);
  }
}
async function offlineState() {
  if (!('serviceWorker' in navigator) || !('caches' in window)) return { ok: false, text: 'Этот браузер не умеет работать офлайн.' };
  try {
    const keys = await caches.keys();
    const k = keys.find(x => x.startsWith('hanzi-') && !x.endsWith('-tmp'));
    if (!k) return { ok: false, text: 'Ещё не скачано. Открой приложение с интернетом и подожди минуту.' };
    APP_VERSION ||= k.slice(6);
    let big = false;
    const lk = keys.find(x => x.startsWith('hzlazy-'));
    if (lk) { const n = (await (await caches.open(lk)).keys()).length; big = n >= 25; }
    return { ok: true, big, text: 'Приложение скачано — работает без интернета и без VPN.' };
  } catch (e) { return { ok: false, text: 'Не удалось проверить офлайн-кэш.' }; }
}
async function registerSW(force) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let ver = '', lv = '';
  try {
    const r = await fetch('precache.json', { cache: 'no-store' });
    const j = await r.json();
    ver = j.version; lv = j.lazyVersion || '';
    PRECACHE = j;
  } catch (e) { /* офлайн — оставляем текущий service worker */ }
  try {
    if (ver) {
      const reg = await navigator.serviceWorker.register('sw.js?v=' + ver + '&lv=' + lv);
      if (force) reg.update();
    } else {
      await navigator.serviceWorker.getRegistration();
    }
  } catch (e) { console.warn('SW', e); }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'progress') { if (d.done === d.total) toast('Готово: приложение работает без интернета'); }
    if (d.type === 'installed' && d.update) toast('Вышло обновление', { label: 'Обновить', fn: () => location.reload() });
    if (d.type === 'error') toast('Не всё скачалось для офлайна: ' + d.message);
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { /* новая версия активна; перезагрузим по кнопке */ });
}

/* ================= Telegram Mini App ================= */
let tg = null;
function initTelegram() {
  const inTg = /tgWebApp/.test(location.hash) || /tgWebApp/.test(location.search);
  if (!inTg) return;
  const s = document.createElement('script');
  s.src = 'https://telegram.org/js/telegram-web-app.js';
  s.onload = () => {
    tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.ready();
    tg.expand();
    tg.BackButton.onClick(back);
    if (stacks[tab].length > 1) tg.BackButton.show();
  };
  document.head.appendChild(s);
}

/* ================= старт ================= */
load();
applyTheme();
TTS.init();
initTelegram();
switchTab('learn');
if (navigator.storage?.persist) navigator.storage.persist().catch(() => { });
window.addEventListener('load', () => registerSW());
caches?.keys?.().then(keys => { const k = keys.find(x => x.startsWith('hanzi-') && !x.endsWith('-tmp')); if (k) APP_VERSION = k.slice(6); }).catch(() => { });
