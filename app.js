/* EOM Quest: single-file app. Data comes from data/bundle.js (window.EOM). Progress lives in localStorage. */
(() => {
'use strict';
const D = window.EOM;
if (!D) { document.getElementById('app').innerHTML = '<p class="boot">data/bundle.js is missing. Run <code>python build_bundle.py</code>.</p>'; return; }
const MODS = D.curriculum.modules, LES = D.curriculum.lessons, QS = D.questions, NOTES = D.notes, SRC = D.sources;
const byL = Object.fromEntries(LES.map(l => [l.id, l]));
const byM = Object.fromEntries(MODS.map(m => [m.id, m]));
const byS = Object.fromEntries(SRC.map(s => [s.id, s]));
const byQ = Object.fromEntries(QS.map(q => [q.id, q]));
const lessonsOf = m => LES.filter(l => l.module === m);
const CORE = MODS.filter(m => !m.id.startsWith('sdl')), SDL = MODS.filter(m => m.id.startsWith('sdl'));
const PAPERS = [...new Set(QS.map(q => q.paper))].map(p => ({ id: p, date: QS.find(q => q.paper === p).date }));
const heat = {}; QS.forEach(q => q.topics.forEach(t => heat[t] = (heat[t] || 0) + 1));
const pyqFor = id => QS.filter(q => q.topics.includes(id));

/* ---------- state: one saved progress record per person (profile) ---------- */
const PKEY = 'eomQuest.profiles', pkey = n => 'eomQuest.p.' + n;
const fresh = () => ({ xp: 0, done: {}, cards: {}, seq: 0, pyq: {}, mocks: [], mockDraft: {}, badges: {}, recallAns: {} });
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
let P = lsGet(PKEY) || { active: null, list: [] };
// carry over progress saved before profiles existed
const legacy = lsGet('eomQuest.v1');
if (legacy && !P.list.length) { P = { active: 'Me', list: ['Me'] }; lsSet(pkey('Me'), legacy); lsSet(PKEY, P); try { localStorage.removeItem('eomQuest.v1'); } catch {} }
let S = fresh();
let lbTimer, LB = {}; // leaderboard state (declared early: loadProfile resets it)
function loadProfile(name) { P.active = name; if (!P.list.includes(name)) P.list.push(name); lsSet(PKEY, P); S = Object.assign(fresh(), lsGet(pkey(name)) || {}); LB = {}; if (S.lb?.joined) setTimeout(() => lbQueue(1500)); }
if (P.active) loadProfile(P.active);
const save = () => { if (P.active && !lsSet(pkey(P.active), S)) toast('Could not save: browser storage is blocked. Use Export on the Profiles page.'); };
const today = () => new Date().toISOString().slice(0, 10);

const RANKS = [[0, 'Trainee'], [150, 'Team Lead'], [400, 'Supervisor'], [800, 'Middle Manager'], [1300, 'Department Head'], [2000, 'General Manager'], [2900, 'Vice President'], [4000, 'CEO'], [5500, 'Management Legend']];
function rank(xp = S.xp) {
  let i = RANKS.findLastIndex(r => xp >= r[0]);
  const next = RANKS[i + 1];
  return { lvl: i + 1, name: RANKS[i][1], next: next ? next[0] : null, base: RANKS[i][0], pct: next ? (xp - RANKS[i][0]) / (next[0] - RANKS[i][0]) * 100 : 100 };
}
function award(n, msg) {
  const before = rank().lvl;
  S.xp += n;
  const after = rank();
  checkBadges(); save();
  toast(after.lvl > before ? `Promoted! You are now a ${after.name} 🎉` : `+${n} XP · ${msg}`);
  const x = document.querySelector('.xp'); if (x) x.textContent = S.xp + ' XP';
  lbQueue();
}

/* ---------- leaderboard (opt-in; served by api/leaderboard on the deployed site) ---------- */
const LB_API = 'api/leaderboard';
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : (h => `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`)(hex(16));
const lbPayload = () => ({ id: S.lb.id, token: S.lb.token, name: S.lb.name, xp: S.xp, lessons: Object.keys(S.done).filter(k => byL[k]).length, pyq: Object.keys(S.pyq).length, mock: S.mocks.length ? Math.max(...S.mocks.map(m => m.score)) : 0, reviews: Object.values(S.cards).reduce((a, c) => a + (c.n || 0), 0), mocks: S.mocks.length });
async function lbCall(method, body, q = '') {
  let r;
  try { r = await fetch(LB_API + q, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('The leaderboard only works on the online version of EOM Quest.'); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(j.error || 'The leaderboard only works on the online version of EOM Quest.'), { status: r.status });
  return j;
}
function lbQueue(delay = 6000) { if (!S.lb?.joined) return; clearTimeout(lbTimer); lbTimer = setTimeout(lbSync, delay); }
async function lbSync() {
  if (!S.lb?.joined) return;
  try { const j = await lbCall('POST', lbPayload()); S.lb.rank = j.rank; S.lb.error = null; }
  catch (e) { if (e.status === 429) return lbQueue(); S.lb.error = e.message; }
  save();
}
async function lbLoad() {
  LB = { loading: true };
  if (S.lb?.joined && (S.lb.error || !S.lb.rank)) await lbSync(); // retry a failed or never-sent score first
  try { LB = { data: await lbCall('GET', null, S.lb?.id ? '?id=' + encodeURIComponent(S.lb.id) : '') }; }
  catch (e) { LB = { err: e.message }; }
  if (location.hash.startsWith('#/leaderboard')) render();
}
function vLeaderboard() {
  if (!LB.loading && !LB.data && !LB.err) lbLoad();
  const joined = S.lb?.joined, d = LB.data;
  const joinCard = `<div class="card lb-join"><h2>Join the leaderboard</h2>
    <p class="muted">Joining shows your <b>display name, XP, lessons conquered, past-paper questions tried and best mock score</b> to everyone using this site. Your score updates automatically as you study. You can leave at any time.</p>
    <form class="form-inline" data-act="lbjoin" style="margin-top:14px"><input class="field" name="name" maxlength="24" minlength="2" required value="${esc(S.lb?.name || P.active)}" placeholder="Display name"><button class="btn">Join as this name</button></form></div>`;
  const youCard = joined ? `<div class="card lb-you"><div class="row between wrap"><div><span class="eyebrow">You are playing as</span><h2>${esc(S.lb.name)}</h2>
      <p class="muted">${d?.you ? `Rank <b class="lime">#${d.you.rank}</b> of ${d.total}` : 'Your first score is being sent…'} · ${S.xp} XP</p>
      ${S.lb.error ? `<p class="small" style="color:var(--red)">Last update failed: ${esc(S.lb.error)}</p>` : ''}</div>
      <div class="library-actions"><button class="btn small secondary" data-act="lbrefresh">Refresh</button><button class="btn small danger" data-act="lbleave">Leave</button></div></div></div>` : '';
  const table = d ? (d.top.length ? `<div class="card"><div class="table-scroll"><table class="lb-table"><thead><tr><th>#</th><th>Name</th><th>Rank</th><th>XP</th><th>Lessons</th><th>PYQs</th><th>Best mock</th></tr></thead><tbody>
      ${d.top.map((p, i) => `<tr class="${p.me ? 'me' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td><b>${esc(p.name)}</b>${p.me ? ' <span class="badge">You</span>' : ''}</td><td class="muted">${rank(p.xp).name}</td><td><b>${p.xp}</b></td><td>${p.lessons}/${LES.length}</td><td>${p.pyq}</td><td>${p.mock ? p.mock + '/50' : '–'}</td></tr>`).join('')}</tbody></table></div>
      <p class="note" style="margin-top:10px">${d.total} player${d.total === 1 ? '' : 's'} · top 50 shown · scores are reported by each player's browser, so treat it as a friendly board.</p></div>`
    : '<div class="card empty"><h2>No one on the board yet</h2><p>Be the first to join.</p></div>')
    : `<div class="card empty"><p>${LB.err ? esc(LB.err) : 'Loading the leaderboard…'}</p>${LB.err ? '<button class="btn small secondary" data-act="lbrefresh">Try again</button>' : ''}</div>`;
  return `<div class="page-head"><span class="eyebrow">Leaderboard</span><h1>Who's studying hardest?</h1><p>XP comes from conquering lessons, recalling cards, attempting past-paper questions and sitting mocks. Climb the board before the 18th.</p></div>
    ${joined ? youCard : joinCard}<div style="margin-top:18px">${table}</div>`;
}

/* ---------- badges ---------- */
const modDone = m => lessonsOf(m).every(l => S.done[l.id]);
const BADGES = [
  ['first', 'First Step', 'Complete your first lesson', () => Object.keys(S.done).length >= 1],
  ['m1', 'Fayol’s Apprentice', 'Finish Module 1', () => modDone('m1')],
  ['m2', 'Master Planner', 'Finish Module 2', () => modDone('m2')],
  ['m3', 'Org Architect', 'Finish Module 3', () => modDone('m3')],
  ['m4', 'Talent Scout', 'Finish Module 4', () => modDone('m4')],
  ['m5', 'Leader of Leaders', 'Finish Module 5', () => modDone('m5')],
  ['sdl', 'Quality Champion', 'Finish all four SDL units', () => SDL.every(m => modDone(m.id))],
  ['recall25', 'Memory Muscle', 'Review 25 flash cards', () => Object.values(S.cards).reduce((a, c) => a + c.n, 0) >= 25],
  ['recall100', 'Elephant Brain', 'Review 100 flash cards', () => Object.values(S.cards).reduce((a, c) => a + c.n, 0) >= 100],
  ['mock3', 'Battle-hardened', 'Finish 3 mock papers', () => S.mocks.length >= 3],
  ['pyq10', 'Paper Hunter', 'Attempt 10 past-paper questions', () => Object.keys(S.pyq).length >= 10],
  ['pyq60', 'Paper Slayer', 'Attempt 60 past-paper questions', () => Object.keys(S.pyq).length >= 60],
  ['mock', 'Exam Ready', 'Finish a full mock paper', () => S.mocks.length >= 1],
  ['all', 'Management Legend', 'Complete all lessons', () => LES.every(l => S.done[l.id])],
];
function checkBadges() {
  BADGES.forEach(([id, name, , ok]) => { if (!S.badges[id] && ok()) { S.badges[id] = today(); setTimeout(() => toast('🏆 Badge unlocked: ' + name), 1800); } });
}

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }
const modProgress = m => { const ls = lessonsOf(m); return { done: ls.filter(l => S.done[l.id]).length, total: ls.length }; };
const flames = id => heat[id] ? `<span class="badge hot" title="Asked ${heat[id]}× in past papers">🔥 PYQ ×${heat[id]}</span>` : '';
const pageImg = (doc, n) => `assets/pages/${doc}-${n}.webp`;

const I = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  map: '<path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  scroll: '<path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM9 8h6M9 12h6M9 16h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v15h-7"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  podium: '<path d="M3 21h18M5 21V13h4v8M10 21V8h4v13M15 21v-5h4v5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};
const icon = n => `<span class="icon"><svg viewBox="0 0 24 24">${I[n]}</svg></span>`;

/* ---------- visual memory diagrams (built only from the lesson content) ---------- */
const flow = (items, color = '') => `<div class="diagram ${color}">${items.map((x, i) => `${i ? '<b>→</b>' : ''}<span><em>${i + 1}</em>${esc(x)}</span>`).join('')}</div>`;
const grid2 = (cells, axes) => `<div class="matrix">${axes ? `<div class="axis-y">${axes[0]}</div>` : ''}<div class="bcg-grid">${cells.map(c => `<div style="--c:${c[2] || 'var(--lime)'}"><strong>${c[0]}</strong><small>${c[1]}</small></div>`).join('')}</div>${axes ? `<div class="axis-x">${axes[1]}</div>` : ''}</div>`;
const VIS = {
  functions: () => flow(['Plan', 'Organize', 'Staff', 'Lead', 'Control']) + '<p class="vis-cap">One business, start to finish: decide where to go → arrange the work → put people in → get them moving → check & correct.</p>',
  roles: () => `<div class="tri">${[['Interpersonal', 'Figurehead · Leader · Liaison', '#c9f36b'], ['Informational', 'Monitor · Disseminator · Spokesperson', '#9ebcff'], ['Decisional', 'Entrepreneur · Disturbance handler · Resource allocator · Negotiator', '#ffbf91']].map(r => `<div style="--c:${r[2]}"><strong>${r[0]}</strong><small>${r[1]}</small></div>`).join('')}</div>`,
  planningsteps: () => flow(['Opportunities', 'Objectives', 'Premises', 'Alternatives', 'Compare', 'Choose', 'Supporting plans', 'Budget']),
  swot: () => grid2([['Strengths', 'Internal · helpful', '#c9f36b'], ['Weaknesses', 'Internal · harmful', '#ffb6aa'], ['Opportunities', 'External · helpful', '#9ebcff'], ['Threats', 'External · harmful', '#ffbf91']], ['Inside ↑ / Outside ↓', 'Helpful ← → Harmful']),
  tows: () => grid2([['SO', 'Use strengths to exploit opportunities', '#c9f36b'], ['WO', 'Fix weaknesses using opportunities', '#9ebcff'], ['ST', 'Use strengths to counter threats', '#ffd773'], ['WT', 'Minimize both: defensive / retrenchment', '#ffb6aa']]),
  bcg: () => grid2([['★ Star', 'High share · High growth', '#ffd773'], ['? Question mark', 'Low share · High growth', '#9ebcff'], ['🐄 Cash cow', 'High share · Low growth', '#c9f36b'], ['🐕 Dog', 'Low share · Low growth', '#ffb6aa']], ['Market growth ↑', '← High    Relative market share    Low →']),
  porter: () => grid2([['Cost leadership', 'Broad market · cheapest', '#c9f36b'], ['Differentiation', 'Broad market · distinctive', '#9ebcff'], ['Cost focus', 'Narrow segment · cheapest', '#ffd773'], ['Differentiation focus', 'Narrow segment · distinctive', '#d8b5fa']], ['Scope: Broad ↑ / Narrow ↓', 'Advantage: Cost ← → Distinct']),
  maslow: () => `<div class="pyramid">${[['Self-actualization', 'becoming'], ['Esteem', 'respect'], ['Social', 'belonging'], ['Safety', 'security'], ['Physiological', 'body']].map((x, i) => `<div style="width:${44 + i * 14}%"><strong>${x[0]}</strong> <small>${x[1]}</small></div>`).join('')}</div>`,
  herzberg: () => `<div class="two-col"><div class="pane red"><strong>Hygiene (job context)</strong><small>Policy · supervision · conditions · relations · pay · security</small><p>Missing → dissatisfied. Present → just “not unhappy”.</p></div><div class="pane lime"><strong>Motivators (job content)</strong><small>Achievement · recognition · responsibility · advancement · work itself</small><p>Present → truly motivated.</p></div></div>`,
  xy: () => `<div class="two-col"><div class="pane red"><strong>Theory X</strong><small>Assumes people avoid work & responsibility → close control, direction</small></div><div class="pane lime"><strong>Theory Y</strong><small>Assumes people can self-direct & seek responsibility → autonomy, involvement</small></div></div>`,
  authoritystyles: () => `<div class="slider-vis"><span>Autocratic<small>leader decides</small></span><span>Democratic<small>group participates</small></span><span>Free-rein<small>team has freedom</small></span></div>`,
  likert: () => flow(['Exploitative-authoritative', 'Benevolent-authoritative', 'Consultative', 'Participative']) + '<p class="vis-cap">Trust & participation rise left → right.</p>',
  grid: () => `<div class="mgrid">${[['1,9', 'Country club', 'left:0;top:0'], ['9,9', 'Team', 'right:0;top:0'], ['5,5', 'Middle of the road', 'left:50%;top:50%;transform:translate(-50%,-50%)'], ['1,1', 'Impoverished', 'left:0;bottom:0'], ['9,1', 'Task', 'right:0;bottom:0']].map(x => `<div style="${x[2]}"><strong>${x[0]}</strong><small>${x[1]}</small></div>`).join('')}<i class="ylab">Concern for people ↑</i><i class="xlab">Concern for production →</i></div>`,
  groups: () => flow(['Forming · meet', 'Storming · clash', 'Norming · agree', 'Performing · do']),
  communication: () => flow(['Sender: thought', 'Encode', 'Transmit', 'Receive', 'Decode', 'Understand', 'Feedback ↺']) + '<p class="vis-cap">⚡ Noise can disrupt any arrow.</p>',
  controlprocess: () => flow(['Set standards', 'Actual performance', 'Measure', 'Compare', 'Identify deviations', 'Analyze causes', 'Program correction', 'Implement']) + '<p class="vis-cap">Then loop back to standards ↺</p>',
  controltypes: () => flow(['Feedforward · before (inputs)', 'Concurrent · during (process)', 'Feedback · after (outputs)']),
  recruitment: () => flow(['Hiring need', 'Job analysis', 'Sourcing', 'Screening', 'Interviews', 'Assessments', 'Background check', 'Decision', 'Offer', 'Onboarding']),
  selection: () => flow(['Preliminary interview', 'Application form', 'Reference checks', 'Employment tests', 'Interview', 'Selection decision']),
  staffing: () => flow(['Enterprise plans', 'Organization plans', 'Managers required', 'vs. Manager inventory', 'Sources (int/ext)', 'Recruit · Select · Place · Promote · Separate', 'Appraise · Train · Develop', 'Leading & Controlling']) + '<p class="vis-cap">Draw it inside an “External environment” box, with feedback arrows back to the start.</p>',
  deming: () => `<div class="cycle">${['Plan', 'Do', 'Check', 'Act'].map(x => `<span>${x}</span>`).join('')}</div>`,
  juran: () => flow(['Quality planning', 'Quality control', 'Quality improvement']),
  crosby: () => grid2([['Definition', 'Conformance to requirements'], ['System', 'Prevention'], ['Standard', 'Zero defects'], ['Measurement', 'Price of non-conformance']]),
  tqmhouse: () => `<div class="house"><div class="roof">Recognition</div><div class="bricks"><span>Training</span><span>Teamwork</span><span>Leadership</span></div><div class="mortar">Communication (mortar)</div><div class="found">Ethics · Integrity · Trust</div></div>`,
  basictools: () => flow(['Fishbone · causes', 'Flowchart · steps', 'Pareto · priorities', 'Run chart · time', 'Control chart · limits', 'Correlation · relationship', 'Histogram · distribution']),
  span: () => `<div class="two-col"><div class="pane"><strong>Narrow span → tall</strong><small>More levels · closer supervision · higher cost</small></div><div class="pane"><strong>Wide span → flat</strong><small>Fewer levels · less bureaucracy · manager overload risk</small></div></div>`,
};

/* ---------- shell ---------- */
const NAV = [['', 'home', 'Dashboard'], ['path', 'map', 'Quest map'], ['recall', 'cards', 'Recall arena'], ['analysis', 'chart', 'Paper analysis'], ['pyq', 'scroll', 'Past papers'], ['mock', 'clock', 'Mock exam'], ['cram', 'flame', 'Cram sheet'], ['plan', 'cal', 'Battle plan'], ['library', 'book', 'PDF library'], ['leaderboard', 'podium', 'Leaderboard'], ['trophies', 'trophy', 'Trophies']];
function shell(route, body) {
  const r = rank();
  return `<aside class="sidebar" id="sidebar">
    <a class="brand" href="#/"><span class="brand-icon">◆</span><span>EOM Quest<small>HUM 3022 · MASTER IT</small></span></a>
    <nav>${NAV.map(([h, ic, t]) => `<a class="nav-link ${route === h ? 'active' : ''}" href="#/${h}">${icon(ic)}${t}</a>`).join('')}</nav>
    <div class="sidebar-bottom"><div class="mini-exam"><span class="eyebrow">End-sem pattern</span><strong>50 marks</strong><p>15 questions · 1 SDL question (3 marks)</p></div>
    <a class="profile" href="#/profiles" title="Switch person, export or import progress"><span class="avatar">${esc(P.active[0].toUpperCase())}</span><div><span><b>${esc(P.active)}</b></span><span class="muted">L${r.lvl} ${r.name} · ${S.xp} XP</span><span class="muted small">Switch / back up ›</span></div></a></div>
  </aside>
  <div class="main-wrap">
    <header class="topbar"><button class="mobile-toggle" data-act="menu" aria-label="Menu">${icon('menu')}</button>
      <form class="search" data-act="search">${icon('search')}<input id="q" placeholder="Search lessons, slides & past papers…" autocomplete="off"><span class="kbd">/</span></form>
      <div class="top-right"><a class="date" href="#/profiles">${esc(P.active)}</a><span class="xp">${S.xp} XP</span></div></header>
    <main class="page" id="main">${body}</main>
  </div>`;
}

/* ---------- views ---------- */
function nextLesson() { return LES.find(l => !S.done[l.id]); }
const MASTERED = 2; // a card is mastered after two "Nailed it" ratings in a row
const isMastered = id => (S.cards[id]?.box || 0) >= MASTERED;
function dueCards() { return LES.filter(l => !isMastered(l.id)); }

function vDash() {
  const total = LES.length, done = Object.keys(S.done).filter(k => byL[k]).length, nl = nextLesson();
  const reviewed = Object.values(S.cards).reduce((a, c) => a + c.n, 0);
  const best = S.mocks.length ? Math.max(...S.mocks.map(m => m.score)) : null;
  const hot = Object.entries(heat).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = hot[0][1];
  return `<section class="hero"><div><span class="eyebrow">Welcome, ${esc(P.active)}</span>
    <h1>Master Essentials of Management, one quest at a time.</h1>
    <p>${LES.length} bite-sized lessons in syllabus order, built only from your 5 module PDFs + 4 SDL units, and checked against all 8 past papers (120 questions).</p>
    ${nl ? `<a class="btn" href="#/lesson/${nl.id}">${done ? 'Continue' : 'Start'}: ${esc(nl.title)} →</a>` : `<a class="btn" href="#/mock">All lessons done. Take a mock →</a>`}</div>
    <div class="hero-art"><svg viewBox="0 0 300 240"><g fill="none" stroke="#182114" stroke-width="3">${[0, 1, 2, 3, 4].map(i => `<circle cx="${40 + i * 55}" cy="${190 - i * 35}" r="18" fill="${(i + 1) * 20 <= pct(done, total) ? '#182114' : '#e8ffc0'}"/>`).join('')}<path d="M40 190 Q70 180 95 155 T150 120 T205 85 T260 50" stroke-dasharray="6 6"/></g><g font-size="11" font-weight="700" fill="#182114" text-anchor="middle">${['Plan', 'Organize', 'Staff', 'Lead', 'Control'].map((t, i) => `<text x="${40 + i * 55}" y="${225 - i * 35}">${t}</text>`).join('')}</g></svg>
    <span class="hero-tag">${pct(done, total)}% conquered</span><span class="hero-tag bottom">Rank: ${rank().name}</span></div></section>
  <div class="stats">
    <div class="stat"><span class="bubble">${icon('map')}</span><div><strong>${done}/${total}</strong><span>lessons conquered</span></div></div>
    <div class="stat"><span class="bubble">${icon('cards')}</span><div><strong>${reviewed}</strong><span>cards recalled · ${LES.length - dueCards().length} mastered</span></div></div>
    <div class="stat"><span class="bubble">${icon('clock')}</span><div><strong>${best == null ? '–' : best + '/50'}</strong><span>best mock score · ${S.mocks.length} sat</span></div></div>
    <div class="stat"><span class="bubble">${icon('scroll')}</span><div><strong>${Object.keys(S.pyq).length}/120</strong><span>past questions tried</span></div></div>
  </div>
  <div class="dashboard-grid"><div>
    <div class="section-head"><h2>The quest map</h2><a class="text-link" href="#/path">Open full map →</a></div>
    <div class="module-grid">${MODS.map(modCard).join('')}</div>
  </div>
  <div class="side-stack">
    <div class="card sdl-card"><span class="badge yellow">SDL · 3 MARKS GUARANTEED</span><h3>Quality Management</h3><p>Exactly one 3-mark question comes from the NPTEL/SWAYAM Quality Management material. All 4 units are covered here: easy marks if you prep.</p>
      <a class="btn" href="#/module/sdl1">Enter the quality wing →</a></div>
    <div class="card"><h3>🔥 Most-asked topics</h3><p class="tagline">Times each lesson was tested across 8 papers</p>
      ${hot.map(([id, n]) => `<a class="frequency-row" href="#/lesson/${id}"><span class="name">${esc(byL[id].title)}</span><span class="progress"><span style="width:${n / max * 100}%"></span></span><strong>${n}</strong></a>`).join('')}</div>
    <div class="card"><h3>Next quests</h3>
      ${[[`#/lesson/${nl ? nl.id : ''}`, 'Learn the next lesson', '+50 XP'], ['#/recall', `Recall cards: ${dueCards().length} left to master`, '+10 XP each'], ['#/analysis', 'Check the paper weightage', 'Know where marks come from'], ['#/pyq', 'Attempt a past-paper question', '+20 XP']].map((q, i) => `<a class="quest-item" href="${q[0]}"><span class="quest-dot">${i + 1}</span><span>${q[1]}<small>${q[2]}</small></span></a>`).join('')}</div>
  </div></div>`;
}
function modCard(m) {
  const p = modProgress(m.id);
  return `<a class="module-card" href="#/module/${m.id}" style="--accent:${m.color}"><span class="arrow">›</span><span class="module-num">${m.number}</span>
    <h3>${esc(m.title)}</h3><p>${esc(m.subtitle)}: ${esc(m.description)}</p>
    <div class="module-meta"><span>${p.done}/${p.total} lessons</span><span>${pct(p.done, p.total)}%</span></div><div class="progress"><span style="width:${pct(p.done, p.total)}%"></span></div></a>`;
}

function vPath() {
  return `<div class="page-head"><span class="eyebrow">Quest map</span><h1>The whole syllabus, in learning order</h1>
    <p>Follow the path top to bottom: each module builds on the one before (Plan → Organize → Staff → Lead → Control), then the SDL Quality wing. 🔥 marks how often a lesson was tested in past papers, so prioritise those.</p></div>
    ${MODS.map(m => `<section class="path-mod" style="--accent:${m.color}"><div class="section-head"><h2><span class="module-num">${m.number}</span> ${esc(m.title)} <small class="muted">· ${esc(m.subtitle)}</small></h2><a class="text-link" href="#/module/${m.id}">Open →</a></div>
      <div class="path-nodes">${lessonsOf(m.id).map(l => `<a href="#/lesson/${l.id}" class="node ${S.done[l.id] ? 'done' : ''} ${heat[l.id] >= 3 ? 'hot' : ''}" title="${esc(l.title)}"><span>${S.done[l.id] ? '✓' : heat[l.id] ? '🔥' : '•'}</span><small>${esc(l.title)}</small></a>`).join('')}</div></section>`).join('')}`;
}

function vModule(id) {
  const m = byM[id]; if (!m) return notFound();
  const ls = lessonsOf(id), p = modProgress(id);
  const qs = QS.filter(q => q.module === id);
  return `<div class="breadcrumbs"><a href="#/path">Quest map</a> / <span>${esc(m.title)}</span></div>
  <div class="page-head" style="--accent:${m.color}"><span class="eyebrow">Module ${m.number} · ${esc(m.subtitle)}</span><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p>
    <div class="progress" style="max-width:420px"><span style="width:${pct(p.done, p.total)}%"></span></div><p class="small">${p.done}/${p.total} lessons · ${qs.length} past-paper questions map here</p></div>
  <div class="lesson-list">${ls.map((l, i) => `<a class="lesson-row" href="#/lesson/${l.id}"><span class="index">${String(i + 1).padStart(2, '0')}</span><div class="grow"><h3>${esc(l.title)} ${flames(l.id)}</h3><p>${esc(l.idea)}</p></div><span class="status ${S.done[l.id] ? 'done' : ''}">${S.done[l.id] ? '✓ Conquered' : 'Start ›'}</span></a>`).join('')}</div>
  <div class="bottom-nav"><a class="btn secondary" href="#/recall/${id}">Recall this module →</a>${qs.length ? `<a class="btn secondary" href="#/pyq?m=${id}">Boss battle: ${qs.length} PYQs →</a>` : ''}</div>`;
}

function vLesson(id) {
  const l = byL[id]; if (!l) return notFound();
  const m = byM[l.module], ls = lessonsOf(l.module), i = ls.indexOf(l), gi = LES.indexOf(l);
  const prev = LES[gi - 1], next = LES[gi + 1];
  const pq = pyqFor(id);
  const pages = []; for (let n = l.start; n <= l.end; n++) pages.push(n);
  const ans = S.recallAns[id] || '';
  return `<div class="breadcrumbs"><a href="#/path">Quest map</a> / <a href="#/module/${m.id}">${esc(m.title)}</a> / <span>Lesson ${i + 1}</span></div>
  <div class="lesson-layout"><article>
    <span class="eyebrow" style="color:${m.color}">Module ${m.number} · Lesson ${i + 1} of ${ls.length}</span>
    <h1>${esc(l.title)}</h1><div class="pill-row">${flames(id)}${S.done[id] ? '<span class="badge">✓ Conquered</span>' : ''}<span class="badge grey">Slides ${l.start}–${l.end}</span></div>
    <p class="lesson-intro">💡 ${esc(l.idea)}</p>
    <div class="lesson-steps"><span class="on">1 · Learn</span><span>2 · See</span><span>3 · Remember</span><span>4 · Recall</span><span>5 · Apply to PYQs</span></div>
    <section class="notes">${NOTES[id] || ''}</section>
    ${VIS[id] ? `<h3 class="reading-head">See it at a glance</h3>${VIS[id]()}` : ''}
    <details class="recap"><summary>⚡ 30-second recap</summary><ul class="point-list">${l.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>
    <div class="memory-box"><h3>🧠 Memory hook</h3><p>${esc(l.memory)}</p></div>
    ${l.trap ? `<div class="subtle-box warning"><b>⚠️ Exam trap:</b> ${esc(l.trap)}</div>` : ''}
    <div class="recall-box"><span class="eyebrow">Active recall: answer before peeking</span><p><b>${esc(l.question)}</b></p>
      <textarea id="recall-ans" placeholder="Type your answer from memory…">${esc(ans)}</textarea>
      <div class="row wrap" style="margin-top:12px"><button class="btn secondary small" data-act="reveal">Reveal model answer</button></div>
      <div id="reveal" hidden><div class="answer"><h4>Model answer</h4><p>${esc(l.answer)}</p></div>
        <p class="small muted">How did you do?</p><div class="ratings"><button class="btn danger small" data-act="rate" data-id="${id}" data-r="0">Missed it</button><button class="btn secondary small" data-act="rate" data-id="${id}" data-r="1">Partly</button><button class="btn small" data-act="rate" data-id="${id}" data-r="2">Nailed it</button></div></div>
    </div>
    ${pq.length ? `<h3 class="reading-head">Asked in past papers (${pq.length})</h3><div class="question-list">${pq.map(qCard).join('')}</div>` : ''}
    <details class="slides"><summary>📖 Check against the original slides (${pages.length} pages)</summary><div>
      ${pages.map(n => `<figure><img class="source-img" loading="lazy" src="${pageImg(l.module, n)}" alt="${esc(m.title)} slide ${n}" data-zoom="${pageImg(l.module, n)}"><figcaption class="source-caption">Slide ${n} · <a class="text-link" href="#/source/${l.module}/${n}">open in viewer</a></figcaption></figure>`).join('')}</div></details>
    <div class="bottom-nav">${prev ? `<a class="btn ghost" href="#/lesson/${prev.id}">← ${esc(prev.title)}</a>` : '<span></span>'}
      ${S.done[id] ? (next ? `<a class="btn" href="#/lesson/${next.id}">Next: ${esc(next.title)} →</a>` : `<a class="btn" href="#/mock">Take a mock →</a>`) : `<button class="btn" data-act="complete" data-id="${id}">Mark conquered (+50 XP) ${next ? '& continue →' : ''}</button>`}</div>
  </article>
  <aside class="sticky"><div class="card"><span class="eyebrow">${esc(m.title)}</span>
    <div class="lesson-mini">${ls.map((x, k) => `<a href="#/lesson/${x.id}" class="${x.id === id ? 'active' : ''} ${S.done[x.id] ? 'done' : ''}"><span>${S.done[x.id] ? '✓' : k + 1}</span>${esc(x.title)}</a>`).join('')}</div></div>
    <div class="card" style="margin-top:14px"><h4>How to write it in the exam</h4><ol class="small muted howto"><li>Name the concept / theory.</li><li>Quote the case line that proves it.</li><li>Explain why it fits.</li><li>Give the action / diagram / example asked.</li></ol></div></aside></div>`;
}

function qCard(q, open) {
  const tried = S.pyq[q.id];
  return `<details class="question-card" ${open ? 'open' : ''}><summary><div class="meta"><span class="badge blue">${esc(q.date)}</span><span class="badge grey">Q${q.label} · ${q.marks} marks</span>${q.topics.map(t => `<span class="topic-chip">${esc(byL[t]?.title || t)}</span>`).join(' · ')}${tried ? '<span class="badge">✓ attempted</span>' : ''}</div><h3>${esc(q.text.slice(0, 260))}${q.text.length > 260 ? '…' : ''}</h3></summary>
    <div><div class="original-wrap">${q.images.map(s => `<img class="question-original" loading="lazy" src="${s}" alt="Original question ${q.label}" data-zoom="${s}">`).join('')}</div>
    <h4 class="reading-head">How to attack it</h4><p>${esc(q.tip)}</p>
    <h4 class="reading-head">Points to draw on</h4><ul class="point-list">${q.guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
    <p class="note">${esc(q.caution)} Lessons: ${q.topics.map(t => `<a class="text-link" href="#/lesson/${t}">${esc(byL[t]?.title || t)}</a>`).join(', ')}</p>
    <button class="btn small ${tried ? 'secondary' : ''}" data-act="tried" data-id="${q.id}">${tried ? '✓ Attempted' : 'I attempted this (+20 XP)'}</button></div></details>`;
}

function vPyq(params) {
  const fp = params.get('p') || '', fm = params.get('m') || '', ft = params.get('t') || '';
  let qs = QS.filter(q => (!fp || q.paper === fp) && (!fm || q.module === fm) && (!ft || q.topics.includes(ft)));
  return `<div class="page-head"><span class="eyebrow">Past papers · 8 papers · 120 questions</span><h1>The boss battles</h1>
    <p>Every question from Nov 2024 to Jun 2026, with the original question image (tables & cases included), the lesson it maps to, and how to attack it. Try writing an answer first, then open the guidance.</p></div>
  <div class="alert"><b>Exam pattern:</b> 50 marks · 3 hours · answer all · 15 sub-questions (mostly 3–4 marks). Most are short business cases: <b>identify the concept → quote the line → justify → apply</b>. Diagrams are often explicitly asked.</div>
  <form class="filters" data-act="pyqfilter">
    <select name="p"><option value="">All papers</option>${PAPERS.map(p => `<option value="${p.id}" ${fp === p.id ? 'selected' : ''}>${esc(p.date)}</option>`).join('')}</select>
    <select name="m"><option value="">All modules</option>${CORE.map(m => `<option value="${m.id}" ${fm === m.id ? 'selected' : ''}>${m.number} · ${esc(m.subtitle)}</option>`).join('')}</select>
    <select name="t"><option value="">All topics</option>${LES.filter(l => heat[l.id]).map(l => `<option value="${l.id}" ${ft === l.id ? 'selected' : ''}>${esc(l.title)} (${heat[l.id]})</option>`).join('')}</select>
    <span class="tagline">${qs.length} questions</span></form>
  <div class="question-list">${qs.map(q => qCard(q)).join('') || '<p class="empty">No questions match.</p>'}</div>`;
}

/* recall arena: a deck of every lesson's recall question. Cards leave the deck once mastered; missed cards come back after a few others. */
let RQ = null;
function vRecall(mod) {
  const pool = (mod ? LES.filter(l => l.module === mod) : LES);
  const due = pool.filter(l => !isMastered(l.id)).sort((a, b) => ((S.cards[a.id]?.box || 0) - (S.cards[b.id]?.box || 0)) || ((S.cards[a.id]?.seq || 0) - (S.cards[b.id]?.seq || 0)));
  if (!RQ || RQ.mod !== mod) RQ = { mod, i: 0, flipped: false };
  const card = due[0];
  return `<div class="recall-stage"><div class="page-head"><span class="eyebrow">Recall arena</span><h1>Retrieve it, don’t re-read it.</h1>
    <p>Say the answer out loud (or in your head), then flip. Rate honestly: “Missed” and “Partly” put the card back in the deck; “Nailed” twice in a row masters it.</p></div>
    <div class="pill-row"><a class="pill ${!mod ? 'active' : ''}" href="#/recall">All</a>${MODS.map(m => `<a class="pill ${mod === m.id ? 'active' : ''}" href="#/recall/${m.id}">${m.number}</a>`).join('')}</div>
    <div class="row between wrap"><p class="tagline">${due.length} left · ${pool.length - due.length} mastered</p>${pool.length - due.length ? `<button class="text-link" data-act="resetdeck" data-mod="${mod || ''}">Reset this deck</button>` : ''}</div>
    ${card ? `<div class="flash-card ${RQ.flipped ? 'flipped' : ''}"><span class="eyebrow">${esc(byM[card.module].title)} · ${esc(card.title)}</span><h2>${esc(card.question)}</h2>
      ${RQ.flipped ? `<div class="answer" style="text-align:left"><h4>Answer</h4><p>${esc(card.answer)}</p></div><p class="small muted">🧠 ${esc(card.memory)}</p>` : '<button class="btn" data-act="flip">Flip card (space)</button>'}</div>
      ${RQ.flipped ? `<div class="ratings"><button class="btn danger" data-act="rate" data-id="${card.id}" data-r="0">Missed (1)</button><button class="btn secondary" data-act="rate" data-id="${card.id}" data-r="1">Partly (2)</button><button class="btn" data-act="rate" data-id="${card.id}" data-r="2">Nailed (3)</button></div>` : ''}`
      : `<div class="flash-card"><h2>🎉 All clear!</h2><p>Every card here is mastered. Try a <a class="text-link" href="#/pyq">past-paper question</a> or another module.</p></div>`}</div>`;
}
function rateCard(id, r) {
  const c = S.cards[id] || { box: 0, n: 0 };
  c.n++; c.box = r === 2 ? c.box + 1 : 0; c.seq = ++S.seq;
  delete c.due;
  S.cards[id] = c; RQ && (RQ.flipped = false);
  award(r === 2 ? 10 : r === 1 ? 5 : 2, r === 2 ? (isMastered(id) ? 'Card mastered' : 'Nailed it') : r === 1 ? 'Keep going' : 'It will come back soon');
}

/* past-paper analysis: weightage by module, question slot, topic and command word (all computed from the 8 papers) */
function vAnalysis() {
  const core = CORE.map(m => m.id), N = PAPERS.length;
  const total = QS.reduce((a, q) => a + q.marks, 0);
  const sum = f => QS.filter(f).reduce((a, q) => a + q.marks, 0);
  const modMarks = Object.fromEntries(core.map(m => [m, sum(q => q.module === m)]));
  const maxMod = Math.max(...Object.values(modMarks));
  const slots = ['1', '2', '3', '4', '5'];
  const slotMod = s => Object.fromEntries(core.map(m => [m, sum(q => q.label[0] === s && q.module === m)]));
  const paperMod = p => Object.fromEntries(core.map(m => [m, sum(q => q.paper === p && q.module === m)]));
  const topic = {};
  QS.forEach(q => q.topics.forEach(t => { const o = topic[t] || (topic[t] = { n: 0, marks: 0, papers: new Set() }); o.n++; o.marks += q.marks / q.topics.length; o.papers.add(q.paper); }));
  const topics = Object.entries(topic).sort((a, b) => b[1].marks - a[1].marks);
  const words = [
    ['Explain', /explain/], ['Identify', /identif/], ['Analyse', /analy/], ['Discuss', /discuss/], ['With examples', /example/],
    ['Diagram / draw', /diagram|draw|chart/], ['Justify', /justif/], ['Illustrate', /illustrat/], ['Suggest / propose', /suggest|propose|recommend/],
    ['Apply', /appl(y|ied|ication)/], ['Evaluate', /evaluat/], ['Quote lines from the case', /lines? from|quote/], ['Compare / differentiate', /compar|differentiat|distinguish|contrast/]];
  const wc = words.map(([label, re]) => [label, QS.filter(q => re.test(q.text.toLowerCase())).length]).sort((a, b) => b[1] - a[1]);
  const four = QS.filter(q => q.marks === 4).length, three = QS.filter(q => q.marks === 3).length;
  const never = LES.filter(l => !heat[l.id] && !l.module.startsWith('sdl'));
  const cell = (v, max) => `<td class="heat" style="--h:${max ? Math.min(1, v / max) : 0}">${v || ''}</td>`;
  const slotMax = Math.max(...slots.flatMap(s => Object.values(slotMod(s))));
  const lastAsked = set => PAPERS.filter(p => set.has(p.id)).map(p => p.date.split(' · ')[0]).pop();
  const head = core.map(m => `<th>${byM[m].number}</th>`).join('');
  return `<div class="page-head"><span class="eyebrow">Paper analysis · ${N} papers · ${QS.length} questions · ${total} marks</span><h1>Where the 50 marks come from</h1>
    <p>Every past question (Nov 2024 to Jun 2026) mapped to its module and lesson, so you can see the weightage, the fixed question pattern, and the skills the examiners reward.</p></div>
  <div class="alert"><b>This exam:</b> 50 marks · 3 hours · answer all · 15 sub-questions (on average ${Math.round(four / N)} worth 4 marks and ${Math.round(three / N)} worth 3 marks per paper). <b>New this time:</b> one 3-mark question from the SDL topic <a class="text-link" href="#/module/sdl1">Quality Management</a>, which the past papers didn't have.</div>

  <div class="analysis-grid">
    <div class="card"><h2>Module weightage</h2><p class="tagline">Average marks per 50-mark paper</p>
      ${core.map(m => `<a class="frequency-row" href="#/module/${m}" style="--accent:${byM[m].color}"><span class="name">${byM[m].number} · ${esc(byM[m].subtitle)}</span><span class="progress"><span style="width:${modMarks[m] / maxMod * 100}%"></span></span><strong>${(modMarks[m] / N).toFixed(1)}</strong><span class="pct">${Math.round(modMarks[m] / total * 100)}%</span></a>`).join('')}
      <p class="small muted" style="margin-top:12px">Leadership, motivation &amp; control (M5) alone is about a third of the paper. M4 + M5 together are about ${Math.round((modMarks.m4 + modMarks.m5) / total * 100)}%.</p></div>
    <div class="card"><h2>The question map</h2><p class="tagline">Total marks per question number, across all ${N} papers</p>
      <div class="table-scroll"><table class="heat-table"><thead><tr><th>Q</th>${head}</tr></thead><tbody>
      ${slots.map(s => { const r = slotMod(s); return `<tr><th>Q${s}</th>${core.map(m => cell(r[m], slotMax)).join('')}</tr>`; }).join('')}</tbody></table></div>
      <p class="small muted" style="margin-top:12px">The paper follows the syllabus order: <b>Q1</b> is mostly M1 (+M2), <b>Q2</b> M2/M3, <b>Q3</b> M3/M4/M5, <b>Q4</b> M4/M5, <b>Q5</b> mostly M5.</p></div>
  </div>

  <div class="card" style="margin-top:20px"><h2>Marks by paper</h2><div class="table-scroll"><table class="heat-table"><thead><tr><th>Paper</th>${head}</tr></thead><tbody>
    ${PAPERS.map(p => { const r = paperMod(p.id); return `<tr><th><a class="text-link" href="#/pyq?p=${p.id}">${esc(p.date)}</a></th>${core.map(m => cell(r[m], 22)).join('')}</tr>`; }).join('')}</tbody></table></div>
    <p class="small muted" style="margin-top:10px">The split is almost identical every time: about 7 · 7 · 9 · 12 · 15 marks for M1 to M5. Every module appears in every paper, so none can be skipped.</p></div>

  <div class="card" style="margin-top:20px"><h2>Topic weightage</h2><p class="tagline">Lessons ranked by total marks across all papers (a question shared by two lessons is split evenly)</p>
    <div class="table-scroll"><table><thead><tr><th>#</th><th>Lesson</th><th>Module</th><th>Times asked</th><th>Papers</th><th>Marks</th><th>Last seen</th></tr></thead><tbody>
    ${topics.map(([id, o], i) => `<tr><td>${i + 1}</td><td><a class="text-link" href="#/lesson/${id}">${esc(byL[id].title)}</a></td><td>${byM[byL[id].module].number}</td><td>${o.n}</td><td>${o.papers.size}/${N}</td><td><b>${Math.round(o.marks)}</b></td><td>${lastAsked(o.papers)}</td></tr>`).join('')}</tbody></table></div></div>

  <div class="analysis-grid" style="margin-top:20px">
    <div class="card"><h2>What examiners ask you to do</h2><p class="tagline">Questions containing each command word</p>
      ${wc.map(([w, n]) => `<div class="frequency-row"><span class="name">${w}</span><span class="progress"><span style="width:${n / wc[0][1] * 100}%"></span></span><strong>${n}</strong></div>`).join('')}</div>
    <div class="card"><h2>What this means for you</h2><ul class="point-list">
      <li><b>It's an application paper.</b> Most questions give a short company case and ask you to identify a concept and explain or justify it. Learn each concept with one example.</li>
      <li><b>Use the 4-step answer:</b> name the concept, quote the case line, explain why it fits, then give the action, diagram or example asked for.</li>
      <li><b>Diagrams earn marks.</b> Practise the staffing systems model, control loop, BCG, SWOT/TOWS, line and line-and-staff charts, matrix structure and the communication process.</li>
      <li><b>Spend time where the marks are:</b> M5 and M4 first, then Urwick's principles and departmentation (M3), then the planning tools (M2) and M1.</li>
      <li><b>Bank the SDL 3 marks:</b> a definition plus 3 or 4 labelled points (TQM house, PDCA, Juran's trilogy, Crosby's absolutes) is enough.</li></ul></div>
  </div>

  <div class="card" style="margin-top:20px"><h2>Not asked yet (${never.length})</h2><p class="tagline">Core lessons with no past-paper question so far. Lower priority, but still in the syllabus.</p>
    <div class="plan-lessons" style="margin-top:12px">${never.map(l => `<a href="#/lesson/${l.id}">${esc(l.title)}</a>`).join('')}</div></div>
  <p class="note" style="margin-top:16px">The question-to-lesson mapping is a study aid built from the question wording, not an official marking scheme.</p>`;
}

/* mock exam */
let MK = null;
function vMock(paper) {
  if (!paper) {
    return `<div class="page-head"><span class="eyebrow">Mock exam</span><h1>Sit a real past paper</h1><p>Pick a paper and write your answers (outline-level is fine) at your own pace. Your draft answers are saved as you type, so you can leave and come back. Then reveal the guidance and self-mark.</p></div>
    <div class="library-grid">${PAPERS.map(p => { const best = S.mocks.filter(m => m.paper === p.id).map(m => m.score); const draft = S.mockDraft?.[p.id]; return `<div class="card library-card"><span class="badge blue">${esc(p.date)}</span><h3>15 questions · 50 marks</h3><p>${best.length ? 'Best: ' + Math.max(...best) + '/50' : 'Not attempted yet'}${draft ? ' · draft in progress' : ''}</p><div class="library-actions"><a class="btn small" href="#/mock/${p.id}">${draft ? 'Continue paper' : 'Start paper'}</a></div></div>`; }).join('')}</div>`;
  }
  const qs = QS.filter(q => q.paper === paper); if (!qs.length) return notFound();
  S.mockDraft = S.mockDraft || {};
  if (!MK || MK.paper !== paper) MK = S.mockDraft[paper] || (S.mockDraft[paper] = { paper, ans: {}, marks: {}, submitted: false });
  const total = Object.values(MK.marks).reduce((a, b) => a + (+b || 0), 0);
  return `<div class="status-bar"><span>${esc(PAPERS.find(p => p.id === paper).date)}</span>${MK.submitted ? `<span>Score <b class="lime">${total}/50</b></span><button class="btn small" data-act="mocksave">Save score</button>` : '<button class="btn small" data-act="mocksubmit">Submit & reveal</button>'}</div>
    ${qs.map(q => `<div class="card mock-card"><div class="meta row between"><span class="badge grey">Q${q.label} · ${q.marks} marks</span></div>
      <div class="original-wrap">${q.images.map(s => `<img class="question-original" src="${s}" loading="lazy" alt="Question ${q.label}" data-zoom="${s}">`).join('')}</div>
      <textarea data-mock="${q.id}" placeholder="Your answer / outline…" ${MK.submitted ? 'readonly' : ''}>${esc(MK.ans[q.id] || '')}</textarea>
      ${MK.submitted ? `<div class="answer"><h4>Guidance</h4><p>${esc(q.tip)}</p><ul class="point-list">${q.guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>
        <label class="field-label">Self-mark: <select data-mark="${q.id}">${Array.from({ length: q.marks + 1 }, (_, k) => `<option ${+MK.marks[q.id] === k ? 'selected' : ''}>${k}</option>`).join('')}</select> / ${q.marks}</label>` : ''}</div>`).join('')}`;
}

function vCram() {
  return `<div class="page-head"><span class="eyebrow">Cram sheet · last-hour revision</span><h1>Every memory hook on one page</h1><p>Read top to bottom the night before and the morning of the exam. Print it (Ctrl+P) if you like. Tap any title to jump into the full lesson.</p></div>
    <div class="alert">🎯 <b>Answer formula for any case question:</b> Concept → Evidence (quote the line) → Why it fits → Action / diagram / example. For comparisons use a table with a “basis of comparison” column.</div>
    ${MODS.map(m => `<section class="cram-mod" style="--accent:${m.color}"><h2><span class="module-num">${m.number}</span> ${esc(m.subtitle)}</h2>
      <div class="cram-grid">${lessonsOf(m.id).map(l => `<div class="cram"><a href="#/lesson/${l.id}"><b>${esc(l.title)}</b></a> ${flames(l.id)}<p>🧠 ${esc(l.memory)}</p>${l.trap ? `<p class="trap">⚠️ ${esc(l.trap)}</p>` : ''}</div>`).join('')}</div></section>`).join('')}`;
}

function vPlan() {
  const tier = l => (heat[l.id] || 0) >= 2 ? 1 : heat[l.id] ? 2 : l.module.startsWith('sdl') ? 2 : 3;
  const t = [1, 2, 3].map(k => LES.filter(l => tier(l) === k));
  const list = a => `<div class="plan-lessons">${a.map(l => `<a href="#/lesson/${l.id}" class="${S.done[l.id] ? 'done' : ''}">${S.done[l.id] ? '✓ ' : ''}${esc(l.title)}${heat[l.id] ? ` <small>🔥${heat[l.id]}</small>` : ''}</a>`).join('')}</div>`;
  const blocks = [
    ['Step 1', 'Module 1–2 core', 'Do the 🔥 lessons from Modules 1–2 first (Fayol, Mintzberg roles, ethics, plans, SWOT/TOWS, BCG, Porter). End with one recall round.', t[0].filter(l => ['m1', 'm2'].includes(l.module))],
    ['Step 2', 'Modules 3–4 core (heavily tested)', 'Urwick’s principles is the single most-asked lesson. Then departmentation, organizing, job analysis, recruitment sources, training, staffing diagram.', t[0].filter(l => ['m3', 'm4'].includes(l.module))],
    ['Step 3', 'Module 5 core', 'Herzberg, Maslow, X/Y, leadership styles, Likert, grid, groups, communication, control process & types. Practise drawing the control loop.', t[0].filter(l => l.module === 'm5')],
    ['Step 4', 'SDL Quality (3 guaranteed marks) + second-tier topics', 'Quality foundations, TQM house, Deming/PDCA, Juran, Crosby, 7 tools, ISO/OSHA. Then skim the 1× PYQ lessons.', t[1]],
    ['Step 5', 'Mock paper + recall', 'Sit one past paper, self-mark, then work through the recall deck. Skim the never-asked lessons via the cram sheet.', t[2]],
    ['Step 6', 'Final revision', 'Read the cram sheet once, do one recall round, glance at the diagrams (staffing, control loop, BCG, Maslow). No new material.', []],
  ];
  return `<div class="page-head"><span class="eyebrow">Battle plan</span><h1>Study in order of what gets asked</h1>
    <p>Go step by step at your own pace: first the lessons tested 2+ times (${t[0].length} lessons), then SDL & once-tested topics (${t[1].length}), then the rest (${t[2].length}) through the cram sheet.</p></div>
    ${blocks.map(b => `<div class="plan-block"><span class="plan-time">${b[0]}</span><div class="grow"><h3>${b[1]}</h3><p>${b[2]}</p>${b[3].length ? list(b[3]) : ''}</div></div>`).join('')}
    <div class="subtle-box">This is a revision priority built from past-paper frequency, not a prediction. Every lesson can still appear.</div>`;
}

function vLibrary() {
  const group = (title, ids) => `<h2 style="margin:26px 0 14px">${title}</h2><div class="library-grid">${ids.map(id => { const s = byS[id], m = byM[id]; return `<div class="card library-card"><span class="badge ${id.startsWith('sdl') ? 'yellow' : id.startsWith('pyq') ? 'blue' : ''}">${s.pages.length} pages</span><h3>${esc(m ? m.subtitle : PAPERS.find(p => p.id === id)?.date || id)}</h3><p>${esc(s.file)}</p><a class="btn small secondary" href="#/source/${id}/1">Open viewer →</a></div>`; }).join('')}</div>`;
  return `<div class="page-head"><span class="eyebrow">PDF library</span><h1>Every page of every PDF</h1><p>All ${SRC.reduce((a, s) => a + s.pages.length, 0)} pages, rendered as images with searchable text. Use this to check a diagram or a table exactly as your faculty wrote it.</p></div>
    ${group('Modules', CORE.map(m => m.id))}${group('SDL · Quality Management', SDL.map(m => m.id))}${group('Past papers', PAPERS.map(p => p.id))}`;
}
function vSource(doc, n) {
  const s = byS[doc]; if (!s) return notFound(); n = Math.max(1, Math.min(s.pages.length, +n || 1));
  const p = s.pages[n - 1], l = LES.find(x => x.module === doc && n >= x.start && n <= x.end);
  return `<div class="breadcrumbs"><a href="#/library">Library</a> / <span>${esc(s.file)}</span></div>
    <div class="viewer-tools"><div class="row"><a class="btn small ghost" href="#/source/${doc}/${n - 1}" ${n === 1 ? 'aria-disabled="true"' : ''}>← Prev</a><span class="tagline">Page ${n} / ${s.pages.length}</span><a class="btn small ghost" href="#/source/${doc}/${n + 1}">Next →</a></div>
    ${l ? `<a class="text-link" href="#/lesson/${l.id}">Lesson: ${esc(l.title)} →</a>` : ''}</div>
    <img class="source-img" src="${p.image}" alt="Page ${n}" data-zoom="${p.image}">
    <details><summary>Page text</summary><div class="source-text">${esc(p.text) || '<i>No extractable text (image-only page).</i>'}</div></details>`;
}

function vSearch(q) {
  const t = q.toLowerCase().trim(); if (!t) return '<p class="empty">Type something to search.</p>';
  const lh = LES.filter(l => [l.title, l.idea, l.memory, l.answer, ...l.points].join(' ').toLowerCase().includes(t));
  const qh = QS.filter(x => x.text.toLowerCase().includes(t));
  const sh = []; SRC.forEach(s => s.pages.forEach(p => { const k = p.text.toLowerCase().indexOf(t); if (k >= 0 && sh.length < 40) sh.push([s, p, k]); }));
  const snip = (txt, k) => esc(txt.slice(Math.max(0, k - 70), k)) + '<mark>' + esc(txt.slice(k, k + t.length)) + '</mark>' + esc(txt.slice(k + t.length, k + t.length + 90));
  return `<div class="page-head"><span class="eyebrow">Search</span><h1>“${esc(q)}”</h1></div>
    <h3>Lessons (${lh.length})</h3>${lh.map(l => `<a class="search-hit" href="#/lesson/${l.id}"><b>${esc(l.title)}</b><p>${esc(l.idea)}</p></a>`).join('') || '<p class="muted">None</p>'}
    <h3 style="margin-top:20px">Past-paper questions (${qh.length})</h3>${qh.map(x => `<a class="search-hit" href="#/pyq?t=${x.topics[0]}"><b>${esc(x.date)} · Q${x.label}</b><p>${esc(x.text.slice(0, 200))}</p></a>`).join('') || '<p class="muted">None</p>'}
    <h3 style="margin-top:20px">Slides (${sh.length}${sh.length >= 40 ? '+' : ''})</h3>${sh.map(([s, p, k]) => `<a class="search-hit" href="#/source/${s.id}/${p.n}"><b>${esc(byM[s.id]?.subtitle || s.id)} · page ${p.n}</b><p>…${snip(p.text, k)}…</p></a>`).join('') || '<p class="muted">None</p>'}`;
}

function vTrophies() {
  const r = rank();
  return `<div class="page-head"><span class="eyebrow">Career ladder</span><h1>Level ${r.lvl}: ${r.name}</h1><p>${S.xp} XP${r.next ? ` · ${r.next - S.xp} XP to ${RANKS[r.lvl][1]}` : ' · top of the ladder!'}</p><div class="progress" style="max-width:480px"><span style="width:${r.pct}%"></span></div></div>
    <div class="ladder">${RANKS.map((x, i) => `<span class="${i < r.lvl ? 'on' : ''}">${x[1]}<small>${x[0]} XP</small></span>`).join('')}</div>
    <h2 style="margin:28px 0 8px">Badges</h2><div class="badge-grid">${BADGES.map(([id, n, d]) => `<div class="achievement ${S.badges[id] ? 'earned' : ''}"><b>${S.badges[id] ? '🏆' : '🔒'} ${n}</b><br><small>${d}</small></div>`).join('')}</div>
    <div class="divider"></div><a class="btn secondary small" href="#/profiles">Profiles & backup</a>`;
}

/* profiles: each person keeps their own progress; export/import moves it between devices or browsers */
function vWelcome() {
  return `<div class="welcome"><span class="brand-icon">◆</span><h1>Who’s studying?</h1>
    <p class="muted">Your XP, lessons, recall cards and mock answers are saved under your name in this browser. Friends sharing this computer can each have their own.</p>
    ${P.list.length ? `<div class="profile-pick">${P.list.map(n => `<button class="btn secondary" data-act="useprofile" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div><p class="tagline">or start a new one</p>` : ''}
    <form class="form-inline" data-act="newprofile"><input class="field" name="name" maxlength="24" placeholder="Your name" required autofocus><button class="btn">Start →</button></form>
    <p class="tagline" style="margin-top:18px">Have a backup file? <label class="text-link" style="cursor:pointer">Import progress<input type="file" accept=".eomq" data-act="import" hidden></label></p></div>`;
}
function vProfiles() {
  return `<div class="page-head"><span class="eyebrow">Profiles & backup</span><h1>Your progress, saved per person</h1>
    <p>Progress is stored in this browser under each person’s name. To move it to another device or browser (or keep a safe copy), export a backup file and import it there.</p></div>
    <div class="lesson-list">${P.list.map(n => { const d = n === P.active ? S : Object.assign(fresh(), lsGet(pkey(n)) || {}); return `<div class="lesson-row"><span class="avatar">${esc(n[0].toUpperCase())}</span><div class="grow"><h3>${esc(n)} ${n === P.active ? '<span class="badge">Active</span>' : ''}</h3><p>${d.xp} XP · ${Object.keys(d.done).length}/${LES.length} lessons · ${Object.keys(d.pyq).length} PYQs tried</p></div>
      <div class="library-actions">${n === P.active ? '' : `<button class="btn small" data-act="useprofile" data-name="${esc(n)}">Switch</button>`}<button class="btn small secondary" data-act="export" data-name="${esc(n)}">Export</button><button class="btn small danger" data-act="delprofile" data-name="${esc(n)}">Delete</button></div></div>`; }).join('')}</div>
    <div class="card" style="margin-top:20px"><h3>Add a person</h3><form class="form-inline" data-act="newprofile" style="margin-top:12px"><input class="field" name="name" maxlength="24" placeholder="Name" required><button class="btn small">Create & switch</button></form></div>
    <div class="card" style="margin-top:14px"><h3>Import a backup</h3><p class="small muted">Restores progress from an exported, encrypted .eomq backup. Edited or damaged files are rejected.</p><label class="btn small secondary" style="margin-top:12px">Choose file<input type="file" accept=".eomq" data-act="import" hidden></label></div>`;
}
/* Encrypted backups (.eomq): AES-GCM with a key derived (PBKDF2) from an app passphrase plus a random salt.
   GCM's authentication tag means any edit to the file makes decryption fail, so altered backups are rejected.
   File layout: "EOMQ" | version byte | 16-byte salt | 12-byte IV | ciphertext+tag. */
const BK_MAGIC = [69, 79, 77, 81], BK_VER = 1, BK_PASS = 'eom-quest/hum3022/backup/v1';
async function bkKey(salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(BK_PASS), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function exportProfile(name) {
  if (!window.crypto?.subtle) { toast('This browser cannot create encrypted backups. Open the app over https or localhost.'); return; }
  const data = name === P.active ? S : lsGet(pkey(name));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ app: 'eom-quest', name, data, at: Date.now() }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await bkKey(salt), plain));
  const blob = new Blob([new Uint8Array([...BK_MAGIC, BK_VER]), salt, iv, ct], { type: 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `eom-quest-${name.replace(/[^\w-]+/g, '_')}.eomq`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Encrypted backup saved for ${name}`);
}
const validState = d => d && typeof d === 'object' && Number.isFinite(d.xp) && d.xp >= 0 && ['done', 'cards', 'pyq', 'badges'].every(k => d[k] && typeof d[k] === 'object') && Array.isArray(d.mocks);
async function importFile(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length < 34 || !BK_MAGIC.every((b, i) => buf[i] === b)) throw new Error('format');
    if (buf[4] !== BK_VER) throw new Error('version');
    if (!window.crypto?.subtle) throw new Error('crypto');
    const salt = buf.slice(5, 21), iv = buf.slice(21, 33);
    let plain;
    try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await bkKey(salt), buf.slice(33)); } catch { throw new Error('tampered'); }
    const j = JSON.parse(new TextDecoder().decode(plain));
    if (j.app !== 'eom-quest' || !validState(j.data)) throw new Error('format');
    const name = String(j.name || 'Imported').slice(0, 24);
    if (P.list.includes(name) && !confirm(`Replace ${name}’s current progress with this backup?`)) return;
    lsSet(pkey(name), j.data); loadProfile(name); save(); toast(`Imported ${name}’s progress`); location.hash = '#/'; render();
  } catch (e) {
    toast({ tampered: 'This backup has been modified or is damaged, so it was rejected.', version: 'This backup is from a newer version of EOM Quest.', crypto: 'This browser cannot read encrypted backups. Open the app over https or localhost.' }[e.message] || 'That file is not an EOM Quest backup (.eomq).');
  }
}
const notFound = () => '<div class="empty"><h2>Lost in the org chart?</h2><p><a class="text-link" href="#/">Back to dashboard</a></p></div>';

/* ---------- router ---------- */
function render() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').map(decodeURIComponent), params = new URLSearchParams(qs || '');
  const r = parts[0] || '';
  if (!P.active) { $('#app').innerHTML = `<main class="page" id="main">${vWelcome()}</main>`; document.title = 'EOM Quest'; return; }
  let body;
  switch (r) {
    case 'profiles': body = vProfiles(); break;
    case '': body = vDash(); break;
    case 'path': body = vPath(); break;
    case 'module': body = vModule(parts[1]); break;
    case 'lesson': body = vLesson(parts[1]); break;
    case 'recall': body = vRecall(parts[1]); break;
    case 'analysis': case 'quiz': body = vAnalysis(); break;
    case 'pyq': body = vPyq(params); break;
    case 'mock': body = vMock(parts[1]); break;
    case 'cram': body = vCram(); break;
    case 'plan': body = vPlan(); break;
    case 'library': body = vLibrary(); break;
    case 'source': body = vSource(parts[1], parts[2]); break;
    case 'search': body = vSearch(parts.slice(1).join('/')); break;
    case 'trophies': body = vTrophies(); break;
    case 'leaderboard': body = vLeaderboard(); break;
    default: body = notFound();
  }
  const navKey = { module: 'path', lesson: 'path', source: 'library', search: '', profiles: 'trophies' }[r] ?? r;
  $('#app').innerHTML = shell(navKey, body);
  document.title = 'EOM Quest' + (r === 'lesson' && byL[parts[1]] ? ' · ' + byL[parts[1]].title : '');
}
let lastRoute = '';
window.addEventListener('hashchange', () => { const cur = location.hash.split('?')[0]; if (cur.startsWith('#/leaderboard') && cur !== lastRoute) LB = {}; render(); if (cur !== lastRoute) window.scrollTo(0, 0); lastRoute = cur; });

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const z = e.target.closest('[data-zoom]');
  if (z) { const d = document.createElement('dialog'); d.className = 'zoom-dialog'; d.innerHTML = `<button class="btn small secondary" data-close>Close (Esc)</button><img src="${z.dataset.zoom}" alt="">`; document.body.append(d); d.showModal(); d.addEventListener('close', () => d.remove()); d.addEventListener('click', ev => { if (ev.target === d || ev.target.hasAttribute('data-close')) d.close(); }); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'menu') $('#sidebar').classList.toggle('open');
  if (a === 'reveal') { const r = $('#reveal'); r.hidden = false; b.remove(); }
  if (a === 'rate') { rateCard(id, +b.dataset.r); if (location.hash.startsWith('#/recall')) render(); else { b.parentElement.innerHTML = '<p class="small lime">Saved to your recall deck ✓</p>'; } }
  if (a === 'flip') { RQ.flipped = true; render(); }
  if (a === 'complete') { if (!S.done[id]) { S.done[id] = today(); award(50, 'Lesson conquered'); } const n = LES[LES.indexOf(byL[id]) + 1]; location.hash = n ? '#/lesson/' + n.id : '#/trophies'; }
  if (a === 'tried') { if (!S.pyq[id]) { S.pyq[id] = today(); award(20, 'Past question attempted'); } b.textContent = '✓ Attempted'; b.classList.add('secondary'); }
  if (a === 'mocksubmit') { if (confirm('Submit and reveal the guidance?')) { MK.submitted = true; save(); render(); window.scrollTo(0, 0); } }
  if (a === 'mocksave') { const total = Object.values(MK.marks).reduce((x, y) => x + (+y || 0), 0); S.mocks.push({ paper: MK.paper, score: total, date: today() }); delete S.mockDraft[MK.paper]; award(100 + total * 2, `Mock saved: ${total}/50`); MK = null; location.hash = '#/mock'; }
  if (a === 'resetdeck') { LES.filter(l => !b.dataset.mod || l.module === b.dataset.mod).forEach(l => delete S.cards[l.id]); save(); render(); }
  if (a === 'useprofile') { loadProfile(b.dataset.name); MK = null; RQ = null; toast(`Welcome back, ${b.dataset.name}`); location.hash = '#/'; render(); }
  if (a === 'export') exportProfile(b.dataset.name);
  if (a === 'lbrefresh') { LB = {}; render(); }
  if (a === 'lbleave') { if (confirm('Remove your entry from the leaderboard?')) { lbCall('DELETE', { id: S.lb.id, token: S.lb.token }).then(() => { S.lb.joined = false; S.lb.rank = null; save(); LB = {}; render(); toast('You left the leaderboard'); }).catch(e => toast(e.message)); } }
  if (a === 'delprofile') { const n = b.dataset.name; if (confirm(`Delete ${n}’s profile and all their progress? Export it first if you want a backup.`)) { try { localStorage.removeItem(pkey(n)); } catch {} P.list = P.list.filter(x => x !== n); if (P.active === n) { P.active = null; S = fresh(); MK = null; } lsSet(PKEY, P); render(); } }
});
document.addEventListener('input', e => {
  if (e.target.id === 'recall-ans') { const id = location.hash.split('/')[2]; S.recallAns[id] = e.target.value; save(); }
  if (e.target.dataset.mock && MK) { MK.ans[e.target.dataset.mock] = e.target.value; save(); }
});
document.addEventListener('change', e => {
  if (e.target.dataset.act === 'import' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.dataset.mark && MK) { MK.marks[e.target.dataset.mark] = e.target.value; save(); render(); }
  const f = e.target.closest('form[data-act="pyqfilter"]'); if (f) { const p = new URLSearchParams(); new FormData(f).forEach((v, k) => v && p.set(k, v)); location.hash = '#/pyq' + (p.toString() ? '?' + p : ''); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form'); if (!f) return; e.preventDefault();
  if (f.dataset.act === 'search') location.hash = '#/search/' + encodeURIComponent($('#q').value);
  if (f.dataset.act === 'lbjoin') {
    const name = f.name.value.trim().slice(0, 24); if (name.length < 2) return;
    S.lb = { ...(S.lb || {}), id: S.lb?.id || uuid(), token: S.lb?.token || hex(32), name, joined: true }; save();
    toast('Joining the leaderboard…'); lbSync().then(() => { LB = {}; render(); if (S.lb.error) toast(S.lb.error); });
    return;
  }
  if (f.dataset.act === 'newprofile') {
    const n = f.name.value.trim().slice(0, 24); if (!n) return;
    if (P.list.includes(n)) { toast(`${n} already exists, switched to it`); }
    loadProfile(n); save(); MK = null; RQ = null; location.hash = '#/'; render();
  }
});
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === '/' && !typing) { e.preventDefault(); $('#q')?.focus(); return; }
  if (typing) return;
  const h = location.hash;
  if (h.startsWith('#/recall')) { if (e.key === ' ' && RQ && !RQ.flipped) { e.preventDefault(); $('[data-act="flip"]')?.click(); } if ('123'.includes(e.key) && RQ?.flipped) $(`[data-act="rate"][data-r="${+e.key - 1}"]`)?.click(); }
  if (h.startsWith('#/source')) { const [, , d, n] = h.split('/'); if (e.key === 'ArrowRight') location.hash = `#/source/${d}/${+n + 1}`; if (e.key === 'ArrowLeft' && +n > 1) location.hash = `#/source/${d}/${+n - 1}`; }
});

if (P.active) checkBadges();
render(); lastRoute = location.hash.split('?')[0];
})();
