// Stack — static single-page app. No build step.
// Data lives in Supabase (auth + Postgres). Each user only sees their own
// rows: Row Level Security is on for every table (supabase/schema.sql).
// No sample data anywhere: a fresh user sees empty states until they add
// their own spending, income, or daily gains.

let supabase = null;
let session = null;
let cfg = null;

const state = { expenses: [], incomes: [], gains: [], goals: [], reports: [], settings: null };
let benchCache = {};
try { benchCache = JSON.parse(localStorage.getItem('stack_benchmarks') || '{}'); } catch (e) { benchCache = {}; }

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n)).slice(1);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => (d || '').slice(0, 7);
const monthLabel = (k) => { const [y, m] = k.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showError(msg) { const el = $('global-error'); el.hidden = !msg; el.textContent = msg || ''; }
function showNotice(msg) { const el = $('global-notice'); el.hidden = !msg; el.textContent = msg || ''; }

// ---------- Config ----------
function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('stack_supabase_config') || 'null');
    if (saved && saved.url && saved.key) return { url: saved.url, key: saved.key };
  } catch (e) {}
  const w = (window.STACK_CONFIG || {});
  if (w.SUPABASE_URL && w.SUPABASE_URL !== 'YOUR_SUPABASE_URL' && w.SUPABASE_ANON_KEY && w.SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
    return { url: w.SUPABASE_URL, key: w.SUPABASE_ANON_KEY };
  }
  return null;
}

async function initSupabase() {
  cfg = loadConfig();
  if (!cfg) { renderAuth(); renderAll(); return; }
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = mod.createClient(cfg.url, cfg.key);
    const { data } = await supabase.auth.getSession();
    session = data && data.session ? data.session : null;
    supabase.auth.onAuthStateChange((_ev, s) => { session = s; renderAuth(); loadAll(); });
    $('setup-status').textContent = 'Connected to ' + cfg.url;
  } catch (e) {
    showError('Could not load Supabase (check your connection and the Supabase URL/key in Setup). The page still loads, but sign-in and saving are unavailable until it connects. Error: ' + (e && e.message ? e.message : e));
  }
  renderAuth();
  await loadAll();
}

// ---------- Auth ----------
function renderAuth() {
  const bar = $('authbar');
  if (!supabase) { bar.innerHTML = '<span>Not connected — open the Setup tab and add your Supabase URL and anon key.</span>'; return; }
  if (session && session.user) {
    bar.innerHTML = '<span>Signed in as ' + esc(session.user.email || '') + '</span> <button id="logout-btn" class="secondary" style="padding:6px 10px">Log out</button>';
    $('logout-btn').onclick = async () => { await supabase.auth.signOut(); session = null; Object.assign(state, { expenses: [], incomes: [], gains: [], goals: [], reports: [], settings: null }); renderAuth(); renderAll(); };
  } else {
    bar.innerHTML = '<input id="auth-email" type="email" placeholder="Email" style="max-width:200px;padding:6px 8px">' +
      '<input id="auth-password" type="password" placeholder="Password" style="max-width:160px;padding:6px 8px">' +
      '<button id="login-btn" style="padding:6px 10px">Log in</button>' +
      '<button id="signup-btn" class="secondary" style="padding:6px 10px">Sign up</button>' +
      '<span>Each person makes their own account — you only ever see your own data.</span>';
    $('login-btn').onclick = doAuth.bind(null, 'login');
    $('signup-btn').onclick = doAuth.bind(null, 'signup');
  }
}
async function doAuth(mode) {
  showError('');
  const email = ($('auth-email').value || '').trim();
  const password = $('auth-password').value || '';
  if (!email || !password) { showError('Enter an email and password first.'); return; }
  const fn = mode === 'signup' ? supabase.auth.signUp : supabase.auth.signInWithPassword;
  const { data, error } = await fn({ email, password });
  if (error) { showError(error.message); return; }
  if (mode === 'signup' && data && data.user && !data.session) {
    showNotice('Account created — check your email to confirm it, then log in. (If email confirmation is off in Supabase Auth settings, you can log in right away.)');
  }
  session = data.session || session;
  renderAuth(); await loadAll();
}

// ---------- Data ----------
async function loadAll() {
  if (!supabase || !session) { renderAll(); return; }
  const uid = session.user.id;
  const [ex, inc, gn, gl, rp, st] = await Promise.all([
    supabase.from('expenses').select('*').eq('user_id', uid).order('date', { ascending: false }),
    supabase.from('incomes').select('*').eq('user_id', uid).order('date', { ascending: false }),
    supabase.from('daily_gains').select('*').eq('user_id', uid).order('date', { ascending: false }),
    supabase.from('goals').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
    supabase.from('reports').select('*').eq('user_id', uid).order('generated_at', { ascending: false }),
    supabase.from('settings').select('*').eq('user_id', uid).maybeSingle(),
  ]);
  const firstErr = [ex, inc, gn, gl, rp, st].find((r) => r.error);
  if (firstErr) { showError('Could not load your data: ' + firstErr.error.message + ' — did you run supabase/schema.sql in your Supabase project?'); }
  state.expenses = ex.data || []; state.incomes = inc.data || []; state.gains = gn.data || [];
  state.goals = gl.data || []; state.reports = rp.data || []; state.settings = st.data || null;
  renderAll();
}
function needLogin() { if (!supabase) { showError('Connect Supabase first — see the Setup tab.'); return true; } if (!session) { showError('Log in (or sign up) first — your data is yours only.'); return true; } return false; }
async function insertRow(table, row) {
  if (needLogin()) return null;
  const { data, error } = await supabase.from(table).insert({ ...row, user_id: session.user.id }).select().single();
  if (error) { showError(error.message); return null; }
  return data;
}
async function deleteRow(table, id) {
  if (needLogin()) return;
  const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', session.user.id);
  if (error) showError(error.message); else await loadAll();
}

// ---------- Calculations ----------
function inMonth(rows, k) { return rows.filter((r) => monthKey(r.date) === k); }
function inYear(rows, y) { return rows.filter((r) => (r.date || '').slice(0, 4) === String(y)); }
function sum(rows) { return rows.reduce((a, r) => a + (Number(r.amount) || 0), 0); }
function expenseTotals(rows) {
  const inv = rows.filter((r) => r.kind === 'investment');
  const ex = rows.filter((r) => r.kind !== 'investment');
  return { total: sum(rows), ex: sum(ex), invested: sum(inv), gas: sum(ex.filter((r) => (r.category || '').toLowerCase() === 'gas')) };
}
// Monthly income: undated income (date_known=false) dated in this month
// must NOT produce a monthly figure — show a dash instead.
function monthlyIncome(k) {
  const rows = inMonth(state.incomes, k);
  const undated = rows.filter((r) => r.date_known === false);
  if (undated.length) return { value: null, undated: true, total: sum(rows) };
  return { value: sum(rows), undated: false, total: sum(rows) };
}
function keptForMonth(k) {
  const inc = monthlyIncome(k);
  const ex = expenseTotals(inMonth(state.expenses, k));
  if (inc.value === null) return { kept: null, income: null, spent: ex.ex, invested: ex.invested, undated: true };
  return { kept: inc.value - ex.ex, income: inc.value, spent: ex.ex, invested: ex.invested, undated: false };
}
function ytdTotals() {
  const y = new Date().getFullYear();
  const ex = expenseTotals(inYear(state.expenses, y));
  const inc = sum(inYear(state.incomes, y)); // YTD includes undated income, as recorded
  const gains = sum(inYear(state.gains, y));
  return { income: inc, spent: ex.ex, invested: ex.invested, gas: ex.gas, kept: inc - ex.ex, gains };
}
function allTimeTotals() {
  const ex = expenseTotals(state.expenses);
  const inc = sum(state.incomes);
  return { income: inc, spent: ex.ex, invested: ex.invested, kept: inc - ex.ex };
}
function monthKeys() {
  const keys = new Set();
  [...state.expenses, ...state.incomes, ...state.gains].forEach((r) => { if (r.date) keys.add(monthKey(r.date)); });
  return [...keys].sort().reverse();
}

// ---------- Rendering ----------
function renderAll() {
  renderOverview(); renderSpending(); renderPortfolio(); renderIncome(); renderGoals(); renderReportsList();
}
function renderOverview() {
  const monthInput = $('overview-month');
  if (!monthInput.value) monthInput.value = new Date().toISOString().slice(0, 7);
  const k = monthInput.value;
  $('overview-period').textContent = monthLabel(k);
  const m = keptForMonth(k);
  $('ov-kept').textContent = m.kept === null ? '— / income dates not tracked' : money(m.kept);
  $('ov-income').textContent = m.income === null ? '— / income dates not tracked' : money(m.income);
  $('ov-spent').textContent = money(m.spent);
  $('ov-invested').textContent = money(m.invested);
  $('ov-gas').textContent = money(expenseTotals(inMonth(state.expenses, k)).gas);
  $('ov-portfolio').textContent = (sum(inMonth(state.gains, k)) >= 0 ? '+' : '−') + money(Math.abs(sum(inMonth(state.gains, k)))).slice(1);
  const y = ytdTotals();
  $('ytd-income').textContent = money(y.income); $('ytd-spent').textContent = money(y.spent);
  $('ytd-invested').textContent = money(y.invested); $('ytd-kept').textContent = money(y.kept);
  $('ytd-portfolio').textContent = signed(y.gains); $('ytd-gas').textContent = money(y.gas);
  const a = allTimeTotals();
  $('alltime-pl').textContent = signed(a.kept); $('alltime-invested').textContent = money(a.invested);
  const keys = monthKeys();
  if (!keys.length) { $('month-table').innerHTML = '<p class="empty">No months yet — add spending, income, or daily gains and months will appear here.</p>'; return; }
  let html = '<table><thead><tr><th>Month</th><th class="num">Total</th><th class="num">Ex-investments</th><th class="num">Invested</th><th class="num">Gas</th><th class="num">Income</th><th class="num">Kept</th></tr></thead><tbody>';
  for (const key of keys) {
    const t = expenseTotals(inMonth(state.expenses, key));
    const mm = keptForMonth(key);
    html += '<tr><td>' + monthLabel(key) + '</td><td class="num">' + money(t.total) + '</td><td class="num">' + money(t.ex) + '</td><td class="num">' + money(t.invested) + '</td><td class="num">' + money(t.gas) + '</td><td class="num">' + (mm.income === null ? '—' : money(mm.income)) + '</td><td class="num">' + (mm.kept === null ? '—' : money(mm.kept)) + '</td></tr>';
  }
  $('month-table').innerHTML = html + '</tbody></table><p class="muted">A “—” for Income/Kept means that month has income whose earning date was not tracked, so no monthly figure is invented.</p>';
}
function periodRows(rows, period) {
  const now = new Date(); const y = now.getFullYear();
  if (period === 'ytd') return inYear(rows, y);
  const days = { week: 7, month: 31, quarter: 92, '6mo': 183, year: 365 }[period] || 31;
  const cut = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cut);
}
function renderSpending() {
  const period = $('spend-period').value || 'month';
  const rows = periodRows(state.expenses, period);
  const t = expenseTotals(rows);
  $('sp-total').textContent = money(t.total); $('sp-ex').textContent = money(t.ex);
  $('sp-inv').textContent = money(t.invested); $('sp-gas').textContent = money(t.gas);
  const byCat = {};
  rows.filter((r) => r.kind !== 'investment').forEach((r) => { byCat[r.category || 'Other'] = (byCat[r.category || 'Other'] || 0) + Number(r.amount || 0); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  $('sp-categories').innerHTML = cats.length ? '<ul class="clean">' + cats.map(([c, v]) => '<li><span>' + esc(c) + '</span><span>' + money(v) + '</span></li>').join('') + '</ul>' : '<p class="empty">No spending yet.</p>';
  const list = [...state.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50);
  $('expense-list').innerHTML = list.length ? '<ul class="clean">' + list.map((r) => '<li><span>' + esc(r.date) + ' — ' + esc(r.label) + ' (' + esc(r.category || '') + (r.kind === 'investment' ? ', investment' : '') + ')</span><span>' + money(r.amount) + ' <button class="danger" data-del-exp="' + r.id + '" style="padding:2px 8px">Delete</button></span></li>').join('') + '</ul>' : '<p class="empty">No expenses yet — add your first one above.</p>';
  document.querySelectorAll('[data-del-exp]').forEach((b) => { b.onclick = () => { if (confirm('Delete this expense?')) deleteRow('expenses', b.getAttribute('data-del-exp')); }; });
}
function renderPortfolio() {
  const keys = monthKeys();
  $('gain-months').innerHTML = keys.length ? '<ul class="clean">' + keys.map((k) => {
    const rows = inMonth(state.gains, k); const total = sum(rows);
    const ms = state.settings && state.settings.month_start_date && monthKey(state.settings.month_start_date) === k ? Number(state.settings.month_start_value || 0) : null;
    const pct = ms ? ' (' + (total / ms * 100).toFixed(2) + '% of month-start value)' : '';
    return '<li><span>' + monthLabel(k) + ' — ' + rows.length + ' day' + (rows.length === 1 ? '' : 's') + '</span><span class="' + (total >= 0 ? 'pos' : 'neg') + '">' + signed(total) + pct + '</span></li>';
  }).join('') + '</ul>' : '<p class="empty">No daily gains logged yet.</p>';
  const list = [...state.gains].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60);
  $('gain-list').innerHTML = list.length ? '<ul class="clean">' + list.map((r) => '<li><span>' + esc(r.date) + ' ' + (r.is_estimate ? '(estimate) ' : '') + esc(r.note || '') + '</span><span class="' + (Number(r.amount) >= 0 ? 'pos' : 'neg') + '">' + signed(Number(r.amount)) + ' <button class="danger" data-del-gain="' + r.id + '" style="padding:2px 8px">Delete</button></span></li>').join('') + '</ul>' : '<p class="empty">No daily gains yet.</p>';
  document.querySelectorAll('[data-del-gain]').forEach((b) => { b.onclick = () => { if (confirm('Delete this day?')) deleteRow('daily_gains', b.getAttribute('data-del-gain')); }; });
  const k = ($('overview-month').value || new Date().toISOString().slice(0, 7));
  const cached = benchCache[k];
  $('benchmarks').innerHTML = cached ? '<ul class="clean">' + Object.entries(cached.values).map(([s, v]) => '<li><span>' + esc(s) + '</span><span>' + (v === null ? 'unavailable' : v.toFixed(2) + '%') + '</span></li>').join('') + '</ul><p class="muted">Fetched ' + esc(cached.fetchedAt || '') + ' (this month, cached in this browser).</p>' : '<p class="empty">No benchmarks fetched yet for this month.</p>';
}
function renderIncome() {
  const y = ytdTotals(); const a = allTimeTotals();
  $('inc-ytd').textContent = money(y.income); $('inc-spent-ytd').textContent = money(y.spent);
  $('inc-kept-ytd').textContent = money(y.kept); $('inc-pl').textContent = signed(a.kept);
  const bySrc = {};
  state.incomes.forEach((r) => { bySrc[r.source || 'Not tracked'] = (bySrc[r.source || 'Not tracked'] || 0) + Number(r.amount || 0); });
  const srcs = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
  $('inc-sources').innerHTML = srcs.length ? '<ul class="clean">' + srcs.map(([s, v]) => '<li><span>' + esc(s) + '</span><span>' + money(v) + '</span></li>').join('') + '</ul>' : '<p class="empty">No income yet.</p>';
  const list = [...state.incomes].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 60);
  $('income-list').innerHTML = list.length ? '<ul class="clean">' + list.map((r) => '<li><span>' + esc(r.date) + (r.date_known === false ? ' (date not tracked)' : '') + ' — ' + esc(r.source || '') + '</span><span>' + money(r.amount) + ' <button class="danger" data-del-inc="' + r.id + '" style="padding:2px 8px">Delete</button></span></li>').join('') + '</ul>' : '<p class="empty">No income yet — add your first inflow above.</p>';
  document.querySelectorAll('[data-del-inc]').forEach((b) => { b.onclick = () => { if (confirm('Delete this income?')) deleteRow('incomes', b.getAttribute('data-del-inc')); }; });
}
function renderGoals() {
  $('goal-list').innerHTML = state.goals.length ? '<ul class="clean">' + state.goals.map((g) => {
    let progress = '';
    if (g.type === 'spend_cap') { const m = expenseTotals(inMonth(state.expenses, new Date().toISOString().slice(0, 7))); progress = 'Spent this month (ex-investments): ' + money(m.ex) + ' / cap ' + money(g.target_amount); }
    if (g.type === 'save_for') { progress = 'Kept YTD: ' + money(ytdTotals().kept) + ' / target ' + money(g.target_amount); }
    if (g.type === 'invest_by') { progress = 'Invested all time: ' + money(allTimeTotals().invested) + ' / target ' + money(g.target_amount) + (g.target_date ? ' by ' + esc(g.target_date) : ''); }
    return '<li><span><strong>' + esc(g.title || g.type) + '</strong><br><span class="muted">' + esc(progress) + '</span></span><span><button class="danger" data-del-goal="' + g.id + '" style="padding:2px 8px">Delete</button></span></li>';
  }).join('') + '</ul>' : '<p class="empty">No goals yet — add your first one above.</p>';
  document.querySelectorAll('[data-del-goal]').forEach((b) => { b.onclick = () => { if (confirm('Delete this goal?')) deleteRow('goals', b.getAttribute('data-del-goal')); }; });
}
function coachSuggestions() {
  const y = ytdTotals();
  const months = monthKeys().filter((k) => k.startsWith(String(new Date().getFullYear())));
  const avgs = months.map((k) => expenseTotals(inMonth(state.expenses, k)).ex);
  const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
  const recent = avgs.slice(0, 3);
  const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const out = [];
  if (avg > 0) out.push({ type: 'spend_cap', title: 'Spend less than $' + Math.max(0, Math.floor(recentAvg / 50) * 50) + ' / month', why: 'Your average ex-investment spending is ' + money(avg) + '/month' + (recent.length ? ', and ' + money(recentAvg) + '/month over the last ' + recent.length + ' month(s)' : '') + '. This cap is the recent average rounded down to the nearest $50.' });
  if (y.kept > 0) out.push({ type: 'save_for', title: 'Save $' + Math.max(0, Math.floor(y.kept / 100) * 100) + ' for your next goal', why: 'You kept ' + money(y.kept) + ' so far this year (income − spending ex-investments). Saving that much again is the same pace you already kept.' });
  if (y.invested > 0 || allTimeTotals().invested > 0) out.push({ type: 'invest_by', title: 'Have $' + Math.max(0, Math.floor((allTimeTotals().invested + y.invested) / 100) * 100) + ' invested', why: 'You have invested ' + money(allTimeTotals().invested) + ' all time and ' + money(y.invested) + ' this year. This target is roughly where you land if you keep this year\'s pace.' });
  return out;
}
function renderCoach() {
  const s = coachSuggestions();
  $('coach').innerHTML = s.length ? '<ul class="clean">' + s.map((x, i) => '<li><span><strong>' + esc(x.title) + '</strong><br><span class="muted">' + esc(x.why) + '</span></span><span><button data-coach-add="' + i + '">Add goal</button></span></li>').join('') + '</ul>' : '<p class="empty">Add some spending and income first — the coach needs your numbers before it can suggest anything.</p>';
  document.querySelectorAll('[data-coach-add]').forEach((b) => { b.onclick = async () => { const x = coachSuggestions()[Number(b.getAttribute('data-coach-add'))]; const amt = Number((x.title.match(/\$([\d,]+)/) || [0, 0])[1].replace(/,/g, '')) || 0; const row = await insertRow('goals', { type: x.type, title: x.title, target_amount: amt, target_date: null }); if (row) await loadAll(); }; });
}
function renderReportsList() {
  $('report-list').innerHTML = state.reports.length ? '<ul class="clean">' + state.reports.map((r) => '<li><span>' + esc(r.period_label || r.period) + ' — ' + esc((r.generated_at || '').slice(0, 10)) + '</span><span><button class="secondary" data-open-report="' + r.id + '" style="padding:2px 8px">Open</button> <button class="danger" data-del-report="' + r.id + '" style="padding:2px 8px">Delete</button></span></li>').join('') + '</ul>' : '<p class="empty">No reports saved yet.</p>';
  document.querySelectorAll('[data-open-report]').forEach((b) => { b.onclick = () => { const r = state.reports.find((x) => x.id === b.getAttribute('data-open-report')); if (r) showReport(r.period_label || r.period, r.summary || {}); }; });
  document.querySelectorAll('[data-del-report]').forEach((b) => { b.onclick = () => { if (confirm('Delete this report?')) deleteRow('reports', b.getAttribute('data-del-report')); }; });
}
function showReport(title, s) {
  $('report-view-card').hidden = false;
  $('report-view-title').textContent = title;
  $('report-view').innerHTML = '<div class="grid">' +
    '<div class="stat"><div class="label">Total spent</div><div class="value">' + money(s.total || 0) + '</div></div>' +
    '<div class="stat"><div class="label">Ex-investments</div><div class="value">' + money(s.ex || 0) + '</div></div>' +
    '<div class="stat"><div class="label">Invested</div><div class="value">' + money(s.invested || 0) + '</div></div>' +
    '<div class="stat"><div class="label">Income</div><div class="value">' + (s.income === null || s.income === undefined ? '— / dates not tracked' : money(s.income)) + '</div></div>' +
    '<div class="stat"><div class="label">Kept</div><div class="value">' + (s.kept === null || s.kept === undefined ? '— / dates not tracked' : money(s.kept)) + '</div></div>' +
    '<div class="stat"><div class="label">Portfolio gain/loss</div><div class="value">' + signed(s.gains || 0) + '</div></div></div>' +
    '<h3>Patterns</h3><p>' + esc(s.patterns || 'No patterns yet — add more entries and the next report will have more to say.') + '</p>';
  $('report-view-card').scrollIntoView({ behavior: 'smooth' });
}

// ---------- Benchmarks (honest: may be blocked by CORS) ----------
async function fetchBenchmarks() {
  const k = ($('overview-month').value || new Date().toISOString().slice(0, 7));
  const btn = $('fetch-benchmarks'); btn.disabled = true; btn.textContent = 'Fetching…';
  const symbols = { VOO: 'VOO', Dow: 'DIA', Nasdaq: '^IXIC', QQQ: 'QQQ' };
  const values = {}; let anyOk = false; const failures = [];
  for (const [label, sym] of Object.entries(symbols)) {
    try {
      const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1mo&interval=1d');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      const closes = (json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].indicators && json.chart.result[0].indicators.quote && json.chart.result[0].indicators.quote[0].close || []).filter((v) => typeof v === 'number');
      if (closes.length < 2) throw new Error('not enough data');
      values[label] = (closes[closes.length - 1] / closes[0] - 1) * 100; anyOk = true;
    } catch (e) { values[label] = null; failures.push(label); }
  }
  btn.disabled = false; btn.textContent = 'Fetch benchmarks for this month';
  if (!anyOk) {
    $('benchmark-note').textContent = 'Benchmark fetch failed in this browser (Yahoo Finance blocked the request — this is a provider/CORS limitation, not a Stack error). No benchmark numbers are shown, and none were invented. Try again later, or check VOO / DIA / ^IXIC / QQQ returns for the month yourself.';
    return;
  }
  benchCache[k] = { values, fetchedAt: new Date().toISOString().slice(0, 10) };
  try { localStorage.setItem('stack_benchmarks', JSON.stringify(benchCache)); } catch (e) {}
  if (failures.length) $('benchmark-note').textContent = 'Fetched ' + (Object.keys(values).length - failures.length) + ' of 4 benchmarks. Unavailable: ' + failures.join(', ') + ' (provider blocked that request — nothing was invented for it).';
  renderPortfolio();
}

// ---------- Forms ----------
function bindForms() {
  $('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = await insertRow('expenses', { date: $('exp-date').value, label: $('exp-label').value.trim(), amount: Number($('exp-amount').value), kind: $('exp-kind').value, category: $('exp-category').value });
    if (row) { e.target.reset(); $('exp-date').value = todayISO(); await loadAll(); }
  });
  $('income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const known = $('inc-date-known').checked;
    const row = await insertRow('incomes', { date: $('inc-date').value || todayISO(), amount: Number($('inc-amount').value), source: $('inc-source').value, note: '', date_known: known });
    if (row) { e.target.reset(); $('inc-date').value = todayISO(); $('inc-date-known').checked = true; await loadAll(); }
  });
  $('gain-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = await insertRow('daily_gains', { date: $('gain-date').value, amount: Number($('gain-amount').value), note: $('gain-note').value.trim(), is_estimate: $('gain-estimate').value === 'yes' });
    if (row) { e.target.reset(); $('gain-date').value = todayISO(); await loadAll(); }
  });
  $('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const row = await insertRow('goals', { type: $('goal-type').value, title: $('goal-title').value.trim(), target_amount: Number($('goal-amount').value), target_date: $('goal-date').value || null });
    if (row) { e.target.reset(); await loadAll(); }
  });
  $('monthstart-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (needLogin()) return;
    const val = { user_id: session.user.id, month_start_date: $('ms-date').value + '-01', month_start_value: Number($('ms-value').value) };
    const { error } = await supabase.from('settings').upsert(val, { onConflict: 'user_id' });
    if (error) showError(error.message); else { showNotice('Month-start value saved.'); await loadAll(); }
  });
  $('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const period = $('report-period').value;
    const month = $('report-month').value || new Date().toISOString().slice(0, 7);
    let rows, label;
    if (period === 'monthly') { rows = { ex: inMonth(state.expenses, month), inc: inMonth(state.incomes, month), gn: inMonth(state.gains, month) }; label = 'Monthly report — ' + monthLabel(month); }
    else { const days = { weekly: 7, '3mo': 92, '6mo': 183, '12mo': 365 }[period]; const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10); rows = { ex: state.expenses.filter((r) => r.date >= cut), inc: state.incomes.filter((r) => r.date >= cut), gn: state.gains.filter((r) => r.date >= cut) }; label = ({ weekly: 'Weekly', '3mo': '3-month', '6mo': '6-month', '12mo': '12-month' })[period] + ' report — to ' + todayISO(); }
    const t = expenseTotals(rows.ex);
    const incM = period === 'monthly' ? monthlyIncome(month) : { value: sum(rows.inc), undated: rows.inc.some((r) => r.date_known === false) };
    const summary = { total: t.total, ex: t.ex, invested: t.invested, gas: t.gas, income: incM.undated ? null : incM.value, kept: incM.undated ? null : incM.value - t.ex, gains: sum(rows.gn), patterns: t.ex > 0 ? 'Biggest category this period drives most of the ex-investment total. Gas was ' + money(t.gas) + '. Investments were kept separate: ' + money(t.invested) + ' invested, not counted as spending.' : 'No spending in this period yet.' };
    showReport(label, summary);
    if (!needLogin()) { await insertRow('reports', { period, period_label: label, summary }); await loadAll(); }
  });
  $('setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = $('setup-url').value.trim(); const key = $('setup-key').value.trim();
    if (!url || !key) { showError('Enter both the Supabase URL and the anon key.'); return; }
    localStorage.setItem('stack_supabase_config', JSON.stringify({ url, key }));
    showNotice('Saved in this browser only. Reload the page to connect with the new values.');
  });
  $('setup-clear').onclick = () => { localStorage.removeItem('stack_supabase_config'); showNotice('Saved connection cleared. Reload the page.'); };
  $('fetch-benchmarks').onclick = fetchBenchmarks;
  $('coach-refresh').onclick = renderCoach;
  $('spend-period').onchange = renderSpending;
  $('overview-month').onchange = () => { renderOverview(); renderPortfolio(); };
  $('overview-prev').onclick = () => { shiftMonth(-1); };
  $('overview-next').onclick = () => { shiftMonth(1); };
  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); document.querySelectorAll('section.tab').forEach((s) => s.classList.remove('active')); $('tab-' + b.dataset.tab).classList.add('active'); if (b.dataset.tab === 'goals') renderCoach(); }; });
}
function shiftMonth(d) {
  const cur = $('overview-month').value || new Date().toISOString().slice(0, 7);
  const [y, m] = cur.split('-').map(Number);
  const dt = new Date(y, m - 1 + d, 1);
  $('overview-month').value = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
  renderOverview(); renderPortfolio();
}

// ---------- Boot ----------
$('exp-date').value = todayISO(); $('gain-date').value = todayISO(); $('inc-date').value = todayISO();
$('overview-month').value = new Date().toISOString().slice(0, 7);
$('report-month').value = new Date().toISOString().slice(0, 7);
bindForms();
renderCoach();
initSupabase();
