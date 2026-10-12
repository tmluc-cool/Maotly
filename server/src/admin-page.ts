/** Admin dashboard: plain HTML + one script, readable on a phone. */

const STYLE = `
:root { color-scheme: light dark; --bg:#f8fafc; --card:#fff; --text:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#059669; --red:#e11d48; }
@media (prefers-color-scheme: dark) { :root { --bg:#020617; --card:#0f172a; --text:#f1f5f9; --muted:#94a3b8; --line:#1e293b; } }
* { box-sizing: border-box; }
body { margin:0; font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--text); }
main { max-width:1100px; margin:0 auto; padding:16px; }
header { display:flex; justify-content:space-between; align-items:center; gap:8px; }
h1 { font-size:22px; margin:8px 0; } h2 { font-size:17px; margin:0 0 10px; }
.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:14px 0; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; }
.num { font-size:26px; font-weight:800; } .muted { color:var(--muted); font-size:13px; }
section.card { margin-top:14px; } .scroll { overflow-x:auto; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { cursor:pointer; user-select:none; color:var(--muted); font-weight:600; }
input[type=search] { width:100%; max-width:320px; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--text); margin-bottom:10px; }
button, .btn { font:inherit; font-size:13px; padding:5px 10px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--text); cursor:pointer; text-decoration:none; }
button.danger { color:var(--red); } .pill { padding:1px 8px; border-radius:99px; font-size:12px; background:var(--line); }
.pending { background:#fef3c7; color:#92400e; } .accepted { background:#d1fae5; color:#065f46; } .rejected { background:#ffe4e6; color:#9f1239; } .blocked { background:#ffe4e6; color:#9f1239; }
.bars { display:flex; align-items:flex-end; gap:4px; height:120px; } .bar { flex:1; background:var(--brand); border-radius:4px 4px 0 0; min-height:2px; }
a { color:var(--brand); }
`;

export const LOGIN_HTML = `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GratisStatt Admin</title><style>${STYLE}</style></head><body><main>
<h1>GratisStatt Admin</h1><div class="card"><p>Nur für den Betreiber.</p><a class="btn" href="/admin/login">Mit GitHub anmelden</a></div>
</main></body></html>`;

export const DASHBOARD_HTML = `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GratisStatt Admin</title><style>${STYLE}</style></head><body><main>
<header><h1>GratisStatt Netzwerk</h1><a class="btn" href="/admin/logout">Abmelden</a></header>
<div class="cards">
  <div class="card"><div class="num" id="active7">–</div><div class="muted">aktiv (7 Tage)</div></div>
  <div class="card"><div class="num" id="active30">–</div><div class="muted">aktiv (30 Tage)</div></div>
  <div class="card"><div class="num" id="total">–</div><div class="muted">Mitglieder total</div></div>
  <div class="card"><div class="num" id="pending">–</div><div class="muted">Beiträge offen</div></div>
  <div class="card"><div class="num" id="accepted">–</div><div class="muted">angenommen</div></div>
  <div class="card"><div class="num" id="rejected">–</div><div class="muted">abgelehnt</div></div>
</div>
<section class="card"><h2>Mitglieder</h2><input type="search" id="filter" placeholder="Suchen …" aria-label="Mitglieder suchen">
<div class="scroll"><table id="users"><thead><tr>
<th data-k="login">Username</th><th data-k="app_version">Version</th><th data-k="joined_day">Beigetreten</th>
<th data-k="last_active_day">Zuletzt aktiv</th><th data-k="submissions">Beiträge</th><th data-k="status">Status</th><th></th>
</tr></thead><tbody></tbody></table></div></section>
<section class="card"><h2>Letzte 100 Beiträge</h2><div class="scroll"><table id="subs"><thead><tr>
<th>Repo</th><th>Von</th><th>Tag</th><th>Status</th><th>Grund</th></tr></thead><tbody></tbody></table></div></section>
<section class="card"><h2>Neue Projekte pro Woche</h2><div class="bars" id="bars"></div><div class="muted" id="barsinfo"></div></section>
</main><script src="/admin/app.js"></script></body></html>`;

export const DASHBOARD_JS = `
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let users = [], sortKey = 'last_active_day', sortDir = -1;

async function api(path, method = 'GET') {
  const res = await fetch('/admin/api/' + path, { method, headers: { 'X-Admin-Request': '1' }, credentials: 'same-origin' });
  if (res.status === 401) { location.href = '/admin'; return null; }
  return res.json();
}

function renderUsers() {
  const q = $('#filter').value.toLowerCase();
  const rows = users.filter((u) => !q || u.login.toLowerCase().includes(q))
    .sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * sortDir);
  $('#users tbody').innerHTML = rows.map((u) => '<tr>' +
    '<td><a href="https://github.com/' + encodeURIComponent(u.login) + '" rel="noreferrer" target="_blank">@' + esc(u.login) + '</a></td>' +
    '<td>' + esc(u.app_version || '–') + '</td><td>' + esc(u.joined_day) + '</td><td>' + esc(u.last_active_day) + '</td>' +
    '<td>' + esc(u.submissions) + '</td><td><span class="pill ' + esc(u.status) + '">' + (u.status === 'blocked' ? 'gesperrt' : 'aktiv') + '</span></td>' +
    '<td><button data-act="' + (u.status === 'blocked' ? 'unblock' : 'block') + '" data-id="' + u.github_id + '">' + (u.status === 'blocked' ? 'Entsperren' : 'Blockieren') + '</button> ' +
    '<button class="danger" data-act="delete" data-id="' + u.github_id + '" data-login="' + esc(u.login) + '">Löschen</button></td></tr>').join('');
}

async function load() {
  const o = await api('overview');
  if (!o) return;
  for (const k of ['active7', 'active30', 'total']) $('#' + k).textContent = o[k];
  for (const k of ['pending', 'accepted', 'rejected']) $('#' + k).textContent = o.submissions[k] || 0;
  users = o.users;
  renderUsers();
  $('#subs tbody').innerHTML = o.recent.map((s) => {
    const repo = s.repo_name
      ? '<a href="https://github.com/' + esc(s.repo_name) + '" rel="noreferrer" target="_blank">' + esc(s.repo_name) + '</a>'
      : '<a href="https://api.github.com/repositories/' + Number(s.repo_id) + '" rel="noreferrer" target="_blank">#' + Number(s.repo_id) + '</a>';
    return '<tr><td>' + repo + '</td><td>' + (s.login ? '@' + esc(s.login) : '–') + '</td><td>' + esc(s.submitted_day) + '</td>' +
      '<td><span class="pill ' + esc(s.status) + '">' + esc(s.status) + '</span></td><td>' + esc(s.reason || '') + '</td></tr>';
  }).join('');
  const h = await api('history');
  const weeks = (h && h.weeks) || [];
  const max = Math.max(1, ...weeks.map((w) => w.count));
  $('#bars').innerHTML = weeks.map((w) => '<div class="bar" title="' + esc(w.date + ': ' + w.count) + '" style="height:' + Math.round((w.count / max) * 100) + '%"></div>').join('');
  $('#barsinfo').textContent = weeks.length ? weeks[0].date + ' bis ' + weeks[weeks.length - 1].date : 'Noch keine Update-Pakete veröffentlicht.';
}

$('#filter').addEventListener('input', renderUsers);
$('#users thead').addEventListener('click', (e) => {
  const k = e.target.dataset && e.target.dataset.k;
  if (!k) return;
  sortDir = sortKey === k ? -sortDir : 1;
  sortKey = k;
  renderUsers();
});
$('#users tbody').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'delete') {
    if (!confirm('@' + b.dataset.login + ' und alle offenen Beiträge löschen?')) return;
    await api('users/' + id, 'DELETE');
  } else {
    await api('users/' + id + '/' + b.dataset.act, 'POST');
  }
  load();
});
load();
`;
