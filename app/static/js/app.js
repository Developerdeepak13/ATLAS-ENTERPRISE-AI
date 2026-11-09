// Atlas Knowledge Base — single-workspace UI. No login, tokens, or user accounts.
const $ = id => document.getElementById(id);

/* ---------- Safe storage helpers ---------- */
const store = {
  get(k, s = false) { try { return (s ? sessionStorage : localStorage).getItem(k) } catch { return null } },
  set(k, v, s = false) { try { (s ? sessionStorage : localStorage).setItem(k, v) } catch { } }
};

/* ---------- Toast ---------- */
let toastTimer;
const toast = (msg, type = 'info') => {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 4000);
};

/* ---------- API ---------- */
const api = async (path, options = {}) => {
  const res = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let data = {};
  try { data = await res.json() } catch { }
  if (!res.ok) throw Error(data.detail || 'Request failed');
  return data;
};

/* ---------- DOM helpers ---------- */
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n };
const icon = name => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'i'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + name); s.append(u); return s };
const fmtDate = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString() };
const humanize = k => String(k).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
const statusTone = s => {
  s = String(s || '').toLowerCase();
  if (/ready|index|approved|complete|active|success|pass/.test(s)) return 'ok';
  if (/pend|process|upload|queue|running/.test(s)) return 'warn';
  if (/fail|error|reject|block|delet/.test(s)) return 'bad';
  return '';
};
function emptyState(title, text) {
  const d = el('div', 'empty');
  d.append(el('strong', '', title), el('span', '', text));
  return d;
}

/* ---------- Greeting ---------- */
(function () {
  const now = new Date(), h = now.getHours();
  const part = h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('heroKicker').textContent = part;
  $('greeting').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
})();

/* ---------- Conversation id (not an auth token) ---------- */
let conversationId = store.get('atlas_conversation_id', true) || crypto.randomUUID();
store.set('atlas_conversation_id', conversationId, true);

$('newChat').onclick = () => {
  conversationId = crypto.randomUUID();
  store.set('atlas_conversation_id', conversationId, true);
  $('messages').replaceChildren();
  $('chatView').classList.remove('has-messages');
  resetSource();
  $('question').focus();
  toast('Started a new conversation', 'success');
};

/* ---------- Navigation ---------- */
const VIEWS = ['home', 'chat', 'docs', 'approval', 'admin'];
const TITLES = {
  home: ['Overview', 'A quick look at your knowledge base'],
  chat: ['Ask a question', 'Answers come only from approved documents'],
  docs: ['Documents', 'Everything that has been uploaded and indexed'],
  approval: ['Approvals', 'Requests that need a human decision'],
  admin: ['Reports', 'Usage, quality and safety figures']
};
function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show') }
function view(name) {
  VIEWS.forEach(x => {
    $(x + 'View').classList.toggle('hidden', x !== name);
    $(x + 'Tab').classList.toggle('active', x === name);
  });
  $('heading').textContent = TITLES[name][0];
  $('crumb').textContent = TITLES[name][1];
  $('topAsk').classList.toggle('hidden', name === 'chat');
  if (name === 'home') loadOverview();
  if (name === 'docs') loadDocs();
  if (name === 'admin') loadMetrics();
  if (name === 'approval') loadApprovals();
  if (name === 'chat') { $('question').focus(); scrollChat() }
  closeSidebar();
  window.scrollTo({ top: 0 });
}
$('homeTab').onclick = () => view('home');
$('chatTab').onclick = () => view('chat');
$('docsTab').onclick = () => view('docs');
$('adminTab').onclick = () => view('admin');
$('approvalTab').onclick = () => view('approval');
$('topAsk').onclick = () => view('chat');
$('goDocs').onclick = () => view('docs');
$('goApprovals').onclick = () => view('approval');
$('qaAsk').onclick = () => view('chat');
$('qaUpload').onclick = () => view('docs');
$('qaReview').onclick = () => view('approval');
$('refreshApprovals').onclick = loadApprovals;
$('refreshDocs').onclick = loadDocs;
$('refreshMetrics').onclick = loadMetrics;
$('menuBtn').onclick = () => { $('sidebar').classList.add('open'); $('scrim').classList.add('show') };
$('scrim').onclick = closeSidebar;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSidebar(); $('sourcePanel').classList.remove('open') } });

/* ---------- Rich text (XSS-safe: builds DOM nodes, never innerHTML) ---------- */
function inline(text, parent) {
  text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g).forEach(part => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) parent.append(el('strong', '', part.slice(2, -2)));
    else if (/^`[^`]+`$/.test(part)) parent.append(el('code', '', part.slice(1, -1)));
    else if (/^\[\d+\]$/.test(part)) parent.append(el('sup', 'cite', part.slice(1, -1)));
    else parent.append(document.createTextNode(part));
  });
}
function renderRich(text) {
  const frag = document.createDocumentFragment();
  String(text ?? '').split(/\n{2,}/).forEach(block => {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    if (!lines.length) return;
    if (lines.every(l => /^\s*[-*•]\s+/.test(l))) {
      const ul = el('ul'); lines.forEach(l => { const li = el('li'); inline(l.replace(/^\s*[-*•]\s+/, ''), li); ul.append(li) }); frag.append(ul);
    } else if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) {
      const ol = el('ol'); lines.forEach(l => { const li = el('li'); inline(l.replace(/^\s*\d+[.)]\s+/, ''), li); ol.append(li) }); frag.append(ol);
    } else if (/^#{1,4}\s+/.test(lines[0])) {
      const h = el('h4'); inline(lines[0].replace(/^#{1,4}\s+/, ''), h); frag.append(h);
      if (lines.length > 1) { const p = el('p'); lines.slice(1).forEach((l, i) => { if (i) p.append(el('br')); inline(l, p) }); frag.append(p) }
    } else {
      const p = el('p'); lines.forEach((l, i) => { if (i) p.append(el('br')); inline(l, p) }); frag.append(p);
    }
  });
  return frag;
}

/* ---------- Recent questions (stored in this browser only) ---------- */
function getRecent() { try { return JSON.parse(store.get('atlas_recent') || '[]') } catch { return [] } }
function saveRecent(q) {
  store.set('atlas_recent', JSON.stringify([q, ...getRecent().filter(x => x !== q)].slice(0, 12)));
  renderRecent();
}
function renderRecent() {
  const box = $('recentList'), list = getRecent();
  if (!list.length) { box.replaceChildren(el('p', 'recent-empty', 'Questions you ask will appear here.')); return }
  box.replaceChildren(...list.map(q => {
    const b = el('button', 'recent-item', q); b.type = 'button'; b.title = q;
    b.onclick = () => ask(q);
    return b;
  }));
}
$('clearRecent').onclick = () => { store.set('atlas_recent', '[]'); renderRecent() };

/* ---------- Source viewer ---------- */
function resetSource() {
  $('sourceBody').replaceChildren(el('p', 'muted', 'Select a source under an answer to read the original passage here.'));
  document.querySelectorAll('.src-chip.active').forEach(c => c.classList.remove('active'));
  $('sourcePanel').classList.remove('open');
}
function showSource(s, chip, open = true) {
  document.querySelectorAll('.src-chip.active').forEach(c => c.classList.remove('active'));
  if (chip) chip.classList.add('active');
  const meta = el('div', 'source-meta');
  meta.append(el('span', 'pill', `Source ${s.index}`), el('span', 'pill grey', `Page ${s.page}`));
  $('sourceBody').replaceChildren(
    el('h4', '', s.title), meta,
    el('blockquote', '', s.excerpt),
    el('p', 'source-note', 'This is the original passage the answer was based on. Read it in full before acting on it.')
  );
  if (open) $('sourcePanel').classList.add('open');
}
$('closeSource').onclick = () => $('sourcePanel').classList.remove('open');

/* ---------- Conversation ---------- */
let questionCount = 0, helpfulCount = 0;
const setQuestions = n => { questionCount = n; $('statQuestions').textContent = n };
function scrollChat() { const s = $('chatScroll'); s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }) }

function addUser(q) {
  $('chatView').classList.add('has-messages');
  const row = el('div', 'msg user');
  row.append(el('div', 'bubble', q));
  $('messages').append(row);
  scrollChat();
}
function addBot() {
  const row = el('div', 'msg bot');
  const col = el('div', 'bot-col');
  const body = el('div', 'bot-body');
  const foot = el('div', 'bot-foot');
  col.append(body, foot);
  row.append(el('div', 'avatar', 'A'), col);
  $('messages').append(row);
  scrollChat();
  return { row, col, body, foot };
}
function showLoading(ref) {
  const sk = el('div', 'skel'); sk.append(el('i'), el('i'), el('i'));
  ref.body.replaceChildren(sk, el('p', 'skel-text', 'Looking through the approved documents…'));
}
function fillAnswer(ref, content, sources = [], isError = false) {
  ref.body.classList.toggle('error', isError);
  ref.body.replaceChildren(renderRich(content));
  ref.foot.replaceChildren();
  if (isError) { scrollChat(); return }

  if (sources.length) {
    const row = el('div', 'src-row');
    row.append(el('span', 'src-label', 'Sources'));
    const chips = new Map();
    sources.forEach(s => {
      const b = el('button', 'src-chip'); b.type = 'button';
      b.append(el('i', '', s.index), document.createTextNode(`${s.title} · p.${s.page}`));
      b.onclick = () => showSource(s, b);
      chips.set(String(s.index), { s, b });
      row.append(b);
    });
    ref.col.insertBefore(row, ref.foot);
    ref.body.querySelectorAll('.cite').forEach(c => {
      const hit = chips.get(c.textContent.trim());
      if (hit) { c.title = 'Show source'; c.onclick = () => showSource(hit.s, hit.b) }
    });
    const first = chips.values().next().value;
    showSource(first.s, first.b, false);
  }

  const copy = el('button', 'act'); copy.type = 'button';
  copy.append(icon('file'), document.createTextNode('Copy'));
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(content); copy.lastChild.textContent = 'Copied'; setTimeout(() => copy.lastChild.textContent = 'Copy', 1800) }
    catch { toast('Could not copy to clipboard', 'error') }
  };
  ref.foot.append(copy);

  if (sources.length) {
    const yes = el('button', 'act'); yes.type = 'button';
    yes.append(icon('check'), document.createTextNode('Helpful'));
    yes.onclick = async () => {
      try {
        await api('/api/feedback', { method: 'POST', body: JSON.stringify({ rating: 1 }) });
        yes.lastChild.textContent = 'Thanks'; yes.classList.add('done'); yes.disabled = true;
        helpfulCount++; $('statHelpful').textContent = helpfulCount;
        toast('Feedback saved', 'success');
      } catch (e) { toast(e.message, 'error') }
    };
    ref.foot.append(yes);
  }
  scrollChat();
}

let sending = false;
async function ask(q) {
  if (!q || sending) return;
  if ($('chatView').classList.contains('hidden')) view('chat');
  sending = true; $('sendBtn').disabled = true;
  saveRecent(q); setQuestions(questionCount + 1);
  $('question').value = ''; autosize();
  addUser(q);
  const ref = addBot();
  showLoading(ref);
  try {
    const r = await api('/api/chat', { method: 'POST', body: JSON.stringify({ question: q, conversation_id: conversationId }) });
    fillAnswer(ref, r.answer, r.sources || []);
    if (r.status === 'pending_approval') {
      const btn = el('button', 'act review'); btn.type = 'button';
      btn.append(icon('check'), document.createTextNode('Review approval request'));
      btn.onclick = () => view('approval');
      ref.foot.prepend(btn);
      refreshApprovalsData();
    }
  } catch (err) {
    fillAnswer(ref, err.message, [], true);
  } finally {
    sending = false; $('sendBtn').disabled = false; $('question').focus();
  }
}
$('chatForm').onsubmit = e => { e.preventDefault(); ask($('question').value.trim()) };
$('heroForm').onsubmit = e => { e.preventDefault(); const q = $('heroInput').value.trim(); $('heroInput').value = ''; ask(q) };
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => ask(b.dataset.q));

function autosize() { const t = $('question'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px' }
$('question').addEventListener('input', autosize);
$('question').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chatForm').requestSubmit() }
});

/* ---------- Overview ---------- */
function miniItem(iconName, tone, title, sub, badge) {
  const row = el('div', 'mini-item');
  const ic = el('span', 'mini-ic' + (tone ? ' ' + tone : '')); ic.append(icon(iconName));
  const txt = el('div', 'mini-text'); txt.append(el('b', '', title), el('small', '', sub));
  row.append(ic, txt);
  if (badge) row.append(badge);
  return row;
}
function renderOverview() {
  const docs = docsCache.slice(0, 5);
  $('ovDocs').replaceChildren(...(docs.length
    ? docs.map(d => miniItem('file', '', d.title, `Version ${d.current_version}`, el('span', 'badge ' + statusTone(d.status), d.status)))
    : [emptyState('No documents yet', 'Upload your first one from the Documents page.')]));
  const pend = approvalsCache.filter(a => normStatus(a) === 'pending').slice(0, 4);
  $('ovApprovals').replaceChildren(...(pend.length
    ? pend.map(a => miniItem('clock', 'amber', a.question, `Requested by ${a.requester} · ${fmtDate(a.created_at)}`))
    : [emptyState('All clear', 'No requests are waiting for a decision.')]));
}
async function loadOverview() {
  await Promise.allSettled([
    api('/api/documents').then(r => { docsCache = Array.isArray(r.documents) ? r.documents : []; $('statDocs').textContent = docsCache.length }),
    refreshApprovalsData(true)
  ]);
  renderOverview();
}

/* ---------- Documents ---------- */
let docsCache = [];
function renderDocs() {
  const root = $('docs');
  const term = $('docFilter').value.trim().toLowerCase();
  const list = docsCache.filter(d => String(d.title).toLowerCase().includes(term));
  $('docCount').textContent = `${docsCache.length} document${docsCache.length === 1 ? '' : 's'}${term ? ` · ${list.length} match${list.length === 1 ? '' : 'es'}` : ''}`;
  if (!docsCache.length) { root.replaceChildren(emptyState('No documents yet', 'Add your first approved document using the form on the right.')); return }
  if (!list.length) { root.replaceChildren(emptyState('No matches', 'Try a different search term.')); return }
  const th = el('div', 'tr th');
  th.append(el('span'), el('span', '', 'Title'), el('span', '', 'Version'), el('span', '', 'Status'));
  root.replaceChildren(th, ...list.map(d => {
    const row = el('div', 'tr');
    const ext = (String(d.title).includes('.') ? String(d.title).split('.').pop() : 'doc').slice(0, 4).toUpperCase();
    const title = el('div', 't-title', d.title); title.title = d.title;
    row.append(el('div', 'ext', ext), title, el('div', 't-ver', `v${d.current_version}`), el('span', 'badge ' + statusTone(d.status), d.status));
    return row;
  }));
}
async function loadDocs() {
  const root = $('docs');
  root.replaceChildren(el('div', 'skeleton'), el('div', 'skeleton'), el('div', 'skeleton'));
  try {
    const r = await api('/api/documents');
    docsCache = Array.isArray(r.documents) ? r.documents : [];
    $('statDocs').textContent = docsCache.length;
    renderDocs(); renderOverview();
  } catch (e) { $('docCount').textContent = 'Could not load'; root.replaceChildren(emptyState('Unable to load documents', e.message)) }
}
$('docFilter').addEventListener('input', renderDocs);

const dz = $('dropzone');
function showFile(f) {
  $('fileName').textContent = f ? `${f.name} (${f.size / 1048576 >= 1 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'})` : 'Choose a file or drop it here';
  dz.classList.toggle('has-file', !!f);
}
$('file').addEventListener('change', () => showFile($('file').files[0]));
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag') }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag') }));
dz.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0]; if (!f) return;
  try { const dt = new DataTransfer(); dt.items.add(f); $('file').files = dt.files; showFile(f) } catch { toast('Drag and drop is not supported here — choose the file instead', 'error') }
});

$('uploadForm').onsubmit = async e => {
  e.preventDefault();
  const f = $('file').files[0]; if (!f) return;
  if (f.size > 10485760) { toast('Maximum file size is 10 MB', 'error'); return }
  const btn = $('uploadBtn'); btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const r = await api('/api/documents/uploads', { method: 'POST', body: JSON.stringify({ filename: f.name }) });
    const up = await fetch(r.upload_url, { method: 'PUT', headers: r.headers, body: f });
    if (!up.ok) throw Error('S3 upload failed');
    toast('Uploaded to S3. Processing document now…');
    btn.textContent = 'Indexing…';
    await api('/api/documents/complete', { method: 'POST', body: JSON.stringify({ document_id: r.document_id }) });
    toast('Document indexed in Pinecone!', 'success');
    $('uploadForm').reset(); showFile(null);
    loadDocs();
  } catch (err) { toast(err.message, 'error') }
  finally { btn.disabled = false; btn.textContent = 'Upload document' }
};

/* ---------- Reports ---------- */
const isPrim = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const fmtVal = v => typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);
function renderMetrics(target, data) {
  const nodes = [];
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([k, v]) => {
      const card = el('div', 'stat');
      card.append(el('div', 'stat-label', humanize(k)));
      if (isPrim(v)) {
        card.append(el('div', 'stat-value' + (typeof v === 'number' ? '' : ' text'), v === null ? '—' : fmtVal(v)));
      } else {
        const entries = Array.isArray(v) ? v.map((x, i) => [i + 1, x]) : Object.entries(v);
        if (!entries.length) card.append(el('div', 'stat-value text', 'None'));
        else {
          const kv = el('div', 'kv');
          entries.forEach(([a, b]) => { const row = el('div'); row.append(el('span', '', humanize(a)), el('span', '', isPrim(b) ? fmtVal(b) : JSON.stringify(b))); kv.append(row) });
          card.append(kv);
          if (entries.length > 4) card.classList.add('wide');
        }
      }
      nodes.push(card);
    });
  }
  const raw = document.createElement('details'); raw.className = 'raw';
  const s = document.createElement('summary'); s.textContent = 'Show raw data';
  const pre = document.createElement('pre'); pre.textContent = JSON.stringify(data, null, 2);
  raw.append(s, pre);
  target.replaceChildren(...nodes, raw);
}
async function loadMetrics() {
  $('metrics').textContent = 'Loading metrics...';
  $('guardrailMetrics').textContent = 'Loading guardrail metrics...';
  try { renderMetrics($('metrics'), await api('/api/admin/metrics')) } catch (e) { $('metrics').textContent = e.message }
  try { renderMetrics($('guardrailMetrics'), await api('/api/admin/guardrails')) } catch (e) { $('guardrailMetrics').textContent = e.message }
}

/* ---------- Approvals (DOM nodes use textContent, never untrusted innerHTML) ---------- */
let approvalsCache = [];
const normStatus = a => String(a.status).trim().toLowerCase();
function updatePending() {
  const n = approvalsCache.filter(a => normStatus(a) === 'pending').length;
  $('statPending').textContent = n;
  const b = $('approvalBadge'); b.textContent = n; b.classList.toggle('hidden', !n);
  return n;
}
async function refreshApprovalsData(skipRender = false) {
  try {
    const r = await api('/api/approvals');
    if (Array.isArray(r.approvals)) { approvalsCache = r.approvals; updatePending(); if (!skipRender) renderOverview() }
  } catch { $('statPending').textContent = '–' }
}

function approvalCard(a) {
  const status = normStatus(a);
  const card = el('article', 'approval-card is-' + status);
  const header = el('div', 'approval-header');
  header.append(el('span', 'approval-status ' + a.status, a.status), el('strong', '', a.question));
  card.append(header, el('p', '', `Requested by ${a.requester} · ${fmtDate(a.created_at)}`));
  if (status === 'pending') {
    const actions = el('div', 'approval-actions');
    for (const [label, approve] of [['Approve', true], ['Reject', false]]) {
      const button = el('button', approve ? 'approve-button' : 'reject-button', label);
      button.onclick = async () => {
        const decision = approve ? 'approve' : 'reject';
        if (!confirm(`Are you sure you want to ${decision} this request? This records a decision only and does not execute the requested action.`)) return;
        button.disabled = true;
        try {
          const r = await api(`/api/approvals/${encodeURIComponent(a.id)}/decision`, { method: 'POST', body: JSON.stringify({ approve }) });
          toast(`Request ${r.status}. No action executed.`, 'success'); await loadApprovals();
        } catch (e) { toast(e.message, 'error'); button.disabled = false }
      };
      actions.append(button);
    }
    card.append(actions);
  } else {
    card.append(el('p', '', `Reviewed by ${a.reviewer || 'unknown'} · ${fmtDate(a.reviewed_at)} · No action executed`));
  }
  return card;
}
function renderApprovals() {
  const root = $('approvalList');
  const pending = updatePending();
  $('approvalSummary').textContent = `${pending} pending · ${approvalsCache.length} total (most recent 100)`;
  root.replaceChildren();
  if (!approvalsCache.length) { root.append(emptyState('No approval requests yet', 'Try asking for a document to be deleted on the Ask a question page.')); return }
  const groups = { pending: [], approved: [], rejected: [] };
  approvalsCache.forEach(a => (groups[normStatus(a)] || groups.pending).push(a));
  const board = el('div', 'board');
  [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].forEach(([key, label]) => {
    const col = el('section', 'col col-' + key);
    const head = el('div', 'col-head');
    head.append(el('span', 'col-dot'), el('h3', '', label), el('span', 'col-count', groups[key].length));
    col.append(head);
    if (!groups[key].length) col.append(el('p', 'col-empty', 'Nothing here'));
    groups[key].forEach(a => col.append(approvalCard(a)));
    board.append(col);
  });
  root.append(board);
}
async function loadApprovals() {
  const root = $('approvalList'); root.textContent = 'Loading approvals...';
  try {
    const response = await api('/api/approvals');
    if (!Array.isArray(response.approvals)) throw Error('Unexpected API response: approvals list missing');
    approvalsCache = response.approvals;
    renderApprovals(); renderOverview();
  } catch (e) {
    root.replaceChildren(emptyState('Unable to load approvals', `${e.message}. Check /api/approvals and your Uvicorn terminal.`));
    console.error('Approvals loading failed:', e);
  }
}

/* ---------- Init ---------- */
renderRecent();
loadOverview();