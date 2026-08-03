// --- Stato Applicativo ---
let docs = [];
let isAdmin = false;
let favorites = JSON.parse(localStorage.getItem('fav_docs') || '[]');
let procedureFavorites = JSON.parse(localStorage.getItem('fav_procedures') || '[]');
let viewCounts = JSON.parse(localStorage.getItem('doc_views') || '{}');
// showOnlyFavorites removed (reverting last changes)

// --- Elementi DOM ---
const subcount = document.getElementById('subcount');
const searchInput = document.getElementById('searchInput');
const metaRow = document.getElementById('metaRow');
const resultCount = document.getElementById('resultCount');
const favoritesSection = document.getElementById('favoritesSection');
const favoritesList = document.getElementById('favoritesList');
const proceduresList = document.getElementById('proceduresList');
const btnAddPdf = document.getElementById('btnAddPdf');

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function getProcedurePdfUrl(proc) {
  if (!proc) return null;

  let path = proc.pdfUrl || proc.fileUrl || proc.filepath || proc.path || proc.filename || proc.file_path || proc.url || proc.pdf || proc.file;

  if (!path) return null;

  if (!path.startsWith('http') && !path.startsWith('/')) {
    if (!path.includes('uploads/')) {
      path = '/uploads/' + path;
    } else {
      path = '/' + path;
    }
  }

  return path;
}

// --- Dark Mode Toggle ---
function initTheme() {
  const isDark = localStorage.getItem('theme_dark') === 'true';
  if (isDark) document.body.classList.add('dark-mode');
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('theme_dark', document.body.classList.contains('dark-mode'));
}

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader || preloader.classList.contains('fade-out')) return;
  preloader.classList.add('fade-out');
}

window.addEventListener('load', () => {
  setTimeout(hidePreloader, 1800);
});

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(hidePreloader, 2200);
});

setTimeout(hidePreloader, 6000);

// --- Caricamento e Rendering Procedure ---
async function loadDocs() {
  try {
    const res = await fetch('/api/procedures');
    docs = await res.json();
    render(searchInput ? searchInput.value.trim() : '');
  } catch (e) {
    if (subcount) subcount.textContent = 'Errore nel caricamento delle procedure.';
  }
}

function render(filterQuery = '') {
  const list = filterQuery
    ? docs.filter(d => {
        const q = filterQuery.toLowerCase();
        return d.title.toLowerCase().includes(q) ||
          (d.keywords && d.keywords.some(k => k.toLowerCase().includes(q)));
      })
    : docs;

  list.sort((a, b) => (procedureFavorites.includes(b.id) ? 1 : 0) - (procedureFavorites.includes(a.id) ? 1 : 0));

  if (subcount) {
    subcount.textContent = docs.length ? `${docs.length} procedure disponibili` : 'Nessuna procedura caricata';
  }

  if (metaRow && resultCount) {
    metaRow.style.display = filterQuery ? 'flex' : 'none';
    resultCount.textContent = `${list.length} risultati per "${filterQuery}"`;
  }

  renderProcedures(list);
}

function renderProcedures(listToRender = docs) {
  const container = document.getElementById('proceduresList');
  if (!container) return;

  if (!listToRender || listToRender.length === 0) {
    container.innerHTML = '<div class="empty">Nessuna procedura trovata.</div>';
    return;
  }

  const sortedList = [...listToRender].sort((a, b) => {
    const isFavA = procedureFavorites.includes(a.id) ? 1 : 0;
    const isFavB = procedureFavorites.includes(b.id) ? 1 : 0;
    return isFavB - isFavA;
  });

  container.innerHTML = sortedList.map(proc => {
    const isFav = procedureFavorites.includes(String(proc.id));

    let tagsArray = [];
    if (Array.isArray(proc.tags)) {
      tagsArray = proc.tags;
    } else if (typeof proc.tags === 'string' && proc.tags.trim() !== '') {
      tagsArray = proc.tags.split(',').map(t => t.trim());
    } else if (proc.keywords && Array.isArray(proc.keywords)) {
      tagsArray = proc.keywords;
    }

    const tagsHTML = tagsArray.length > 0
      ? tagsArray.slice(0, 6).map(tag => `<span class="tag-pill">#${escapeHtml(tag)}</span>`).join('')
      : '<span style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Nessun tag</span>';

    const source = proc.pdfUrl && String(proc.pdfUrl).startsWith('http') ? 'Remote' : (proc.filename ? 'Local' : 'None');
    return `
      <div class="card-procedure ${isFav ? 'favorite-card' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
          <h4 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: #0f172a; line-height: 1.3;">
            ${escapeHtml(proc.title || proc.name)}
            <span style="font-size:0.7rem; margin-left:0.6rem; padding:0.15rem 0.4rem; background:#eef2ff; color:#1e3a8a; border-radius:6px; vertical-align:middle;">${source}</span>
          </h4>
        </div>

        <div class="tags-container">
          ${tagsHTML}
        </div>

        <div class="card-footer">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn-mini-edit" onclick="printProcedure('${proc.id}')" title="Stampa">
              🖨️
            </button>
            <button class="btn-primary-pill" onclick="openProcedure('${proc.id}')">
              Apri PDF
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// favorites view code removed (reverted)

// --- Gestione Preferiti & Tag ---
function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(favId => favId !== id);
  } else {
    favorites.push(id);
  }
  localStorage.setItem('fav_docs', JSON.stringify(favorites));
  render(searchInput ? searchInput.value.trim() : '');
}

function toggleProcedureFavorite(event, id) {
  event.stopPropagation();
  const sid = String(id);

  if (procedureFavorites.includes(sid)) {
    procedureFavorites = procedureFavorites.filter(favId => favId !== sid);
  } else {
    procedureFavorites.push(sid);
  }

  localStorage.setItem('fav_procedures', JSON.stringify(procedureFavorites));
  render(searchInput ? searchInput.value.trim() : '');
}

window.toggleProcedureFavorite = toggleProcedureFavorite;

function openProcedure(id) {
  const proc = docs.find(p => String(p.id) === String(id));
  if (!proc) return alert('Procedura non trovata.');

  proc.views = (proc.views || 0) + 1;
  if (typeof renderProcedures === 'function') renderProcedures();

  const apiPdfUrl = `/api/procedures/${proc.id}/pdf`;
  const filename = (proc.filename || proc.pdfUrl || proc.filepath || proc.path || proc.file || '').split('/').pop().split('\\').pop();

  if (proc.id) {
    window.open(apiPdfUrl, '_blank');
  } else if (filename) {
    window.open(`/api/procedures/pdf/${filename}`, '_blank');
  } else if (proc.content || proc.description) {
    const docWindow = window.open('', '_blank');
    if (docWindow) {
      docWindow.document.write(`
        <html>
          <head><title>${escapeHtml(proc.title || proc.name)}</title></head>
          <body style="font-family: sans-serif; padding: 20px;">
            <h1>${escapeHtml(proc.title || proc.name)}</h1>
            <p>${proc.content || proc.description}</p>
          </body>
        </html>
      `);
      docWindow.document.close();
    }
  } else {
    alert('Nessun PDF o testo associato a questa procedura.');
  }
}

window.openProcedure = openProcedure;

function printProcedure(id) {
  const proc = docs.find(p => String(p.id) === String(id));

  if (!proc) {
    alert('Errore: Procedura non trovata.');
    return;
  }

  const apiPdfUrl = `/api/procedures/${proc.id}/pdf`;
  const pdfUrl = getProcedurePdfUrl(proc);

  if (proc.id) {
    const printWin = window.open(apiPdfUrl, '_blank');
    if (printWin) {
      printWin.focus();
    } else {
      alert('Abilita i pop-up per procedere con la stampa.');
    }
  } else if (pdfUrl) {
    const printWin = window.open(pdfUrl, '_blank');
    if (printWin) {
      printWin.focus();
    } else {
      alert('Abilita i pop-up per procedere con la stampa.');
    }
  } else {
    alert('Nessun file PDF associato da stampare.');
  }
}

window.printProcedure = printProcedure;

function editProcedure(id) {
  const proc = docs.find(d => d.id === id);
  if (!proc) return;
  alert(`Modifica procedura non ancora implementata per "${proc.title}".`);
}

function deleteProcedure(id) {
  const proc = docs.find(d => d.id === id);
  if (proc) deleteDoc(proc);
}

function filterByTag(tag) {
  if (searchInput) {
    searchInput.value = tag;
    render(tag);
  }
}

// --- Tracciamento Visualizzazioni & Stampa ---
function openPdf(d) {
  viewCounts[d.id] = (viewCounts[d.id] || 0) + 1;
  localStorage.setItem('doc_views', JSON.stringify(viewCounts));

  const pdfOverlay = document.getElementById('pdfOverlay');
  const pdfFrame = document.getElementById('pdfFrame');
  const pdfTitle = document.getElementById('pdfTitle');

  if (pdfTitle) pdfTitle.textContent = d.title;
  if (pdfFrame) pdfFrame.src = '/api/procedures/' + d.id + '/pdf';
  if (pdfOverlay) {
    pdfOverlay.style.display = 'flex';
    pdfOverlay.classList.add('open');
  }

  render(searchInput ? searchInput.value.trim() : '');
}

function printPdf(d) {
  const win = window.open('/api/procedures/' + d.id + '/pdf', '_blank');
  if (win) {
    win.focus();
    win.print();
  }
}

async function deleteDoc(d) {
  if (!confirm(`Eliminare "${d.title}"?`)) return;
  try {
    await fetch('/api/procedures/' + d.id, { method: 'DELETE' });
    docs = docs.filter(x => x.id !== d.id);
    render(searchInput ? searchInput.value.trim() : '');
  } catch (e) {
    alert('Errore durante l\'eliminazione.');
  }
}

// --- Drag & Drop Upload ---
function initDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('pdfFile');
  if (!dropZone || !fileInput) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      const fileNameDisplay = document.getElementById('fileNameDisplay');
      if (fileNameDisplay) fileNameDisplay.textContent = e.dataTransfer.files[0].name;
    }
  });

  dropZone.addEventListener('click', () => fileInput.click());
}

// --- Listener Input di Ricerca ---
let searchTimer;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    searchTimer = setTimeout(() => render(q), 250);
  });
}

const clearSearchBtn = document.getElementById('clearSearch');
if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    render();
  });
}

// --- Modale Anteprima PDF ---
const pdfOverlay = document.getElementById('pdfOverlay');
const pdfFrame = document.getElementById('pdfFrame');
const pdfTitle = document.getElementById('pdfTitle');

function closePdf() {
  if (!pdfOverlay || !pdfFrame) return;
  pdfOverlay.classList.remove('open');
  pdfOverlay.style.display = 'none';
  pdfFrame.src = '';
}

const closePdfBtn = document.getElementById('closePdf');
if (closePdfBtn) closePdfBtn.addEventListener('click', closePdf);

if (pdfOverlay) {
  pdfOverlay.addEventListener('click', e => {
    if (e.target === pdfOverlay) closePdf();
  });
}

// --- Upload Overlay / Admin actions ---
const btnAssistance = document.getElementById('btnAssistance');
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const userBadge = document.getElementById('userBadge');
const uploadOverlay = document.getElementById('uploadOverlay');
const assistanceOverlay = document.getElementById('assistanceOverlay');
const loginOverlay = document.getElementById('loginOverlay');
const uploadForm = document.getElementById('uploadForm');
const assistanceForm = document.getElementById('assistanceForm');
const loginForm = document.getElementById('loginForm');
const btnCancelUpload = document.getElementById('btnCancelUpload');
const btnCancelAssistance = document.getElementById('btnCancelAssistance');
const btnCancelLogin = document.getElementById('btnCancelLogin');
const pdfFileInput = document.getElementById('pdfFile');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const loginEmail = document.getElementById('loginEmail');
const loginStatus = document.getElementById('loginStatus');
const assistanceName = document.getElementById('assistanceName');
const assistanceEmail = document.getElementById('assistanceEmail');
const assistanceSubject = document.getElementById('assistanceSubject');
const assistanceMessage = document.getElementById('assistanceMessage');
const assistanceErrorContext = document.getElementById('assistanceErrorContext');
let userLoggedIn = false;
let userEmail = '';

if (pdfFileInput && fileNameDisplay) {
  pdfFileInput.addEventListener('change', () => {
    const f = pdfFileInput.files[0];
    fileNameDisplay.textContent = f ? f.name : 'Nessun file selezionato';
  });
}

function openUpload() {
  if (!uploadOverlay) return;
  uploadOverlay.style.display = 'flex';
  uploadOverlay.classList.add('open');
}

function closeUpload() {
  if (!uploadOverlay) return;
  uploadOverlay.classList.remove('open');
  uploadOverlay.style.display = 'none';
  if (uploadForm) uploadForm.reset();
}

function openAssistance() {
  if (!assistanceOverlay) return;
  refreshAssistanceEmail();
  assistanceOverlay.style.display = 'flex';
  assistanceOverlay.classList.add('open');
}

function closeAssistance() {
  if (!assistanceOverlay) return;
  assistanceOverlay.classList.remove('open');
  assistanceOverlay.style.display = 'none';
  if (assistanceForm) assistanceForm.reset();
}

function openLogin() {
  if (!loginOverlay) return;
  loginOverlay.style.display = 'flex';
  loginOverlay.classList.add('open');
}

function closeLogin() {
  if (!loginOverlay) return;
  loginOverlay.classList.remove('open');
  loginOverlay.style.display = 'none';
  if (loginForm) loginForm.reset();
  if (loginStatus) loginStatus.textContent = '';
}

function refreshUserUI() {
  if (btnLogin) btnLogin.style.display = userLoggedIn ? 'none' : 'inline-flex';
  if (btnLogout) btnLogout.style.display = userLoggedIn ? 'inline-flex' : 'none';
  if (userBadge) {
    if (userLoggedIn && userEmail) {
      userBadge.textContent = `Loggato come ${userEmail}`;
      userBadge.style.display = 'inline-block';
    } else {
      userBadge.style.display = 'none';
    }
  }
}

function refreshAssistanceEmail() {
  if (!assistanceEmail) return;
  if (userLoggedIn && userEmail) {
    assistanceEmail.value = userEmail;
    assistanceEmail.readOnly = true;
  } else {
    assistanceEmail.value = '';
    assistanceEmail.readOnly = false;
  }
}

async function loadUserStatus() {
  try {
    const res = await fetch('/api/user/status');
    if (!res.ok) return;
    const data = await res.json();
    userLoggedIn = !!data.loggedIn;
    userEmail = data.email || '';
  } catch (err) {
    console.warn('Impossibile recuperare lo stato utente', err);
  }
  refreshUserUI();
}

if (btnAddPdf) btnAddPdf.addEventListener('click', openUpload);
if (btnAssistance) btnAssistance.addEventListener('click', openAssistance);
if (btnLogin) btnLogin.addEventListener('click', openLogin);
if (loginForm) {
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = loginEmail ? loginEmail.value.trim().toLowerCase() : '';
    if (!email) {
      if (loginStatus) loginStatus.textContent = 'Inserisci l\'email per accedere.';
      return;
    }

    try {
      const res = await fetch('/api/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Accesso fallito (${res.status})`);
      }

      const data = await res.json();
      userLoggedIn = true;
      userEmail = data.email || email;
      refreshUserUI();
      closeLogin();
    } catch (err) {
      console.error('Login error', err);
      if (loginStatus) loginStatus.textContent = err.message;
    }
  });
}
if (btnLogout) btnLogout.addEventListener('click', async () => {
  await fetch('/api/user/logout', { method: 'POST' });
  userLoggedIn = false;
  userEmail = '';
  refreshUserUI();
});
if (btnCancelUpload) btnCancelUpload.addEventListener('click', closeUpload);
if (btnCancelAssistance) btnCancelAssistance.addEventListener('click', closeAssistance);
if (btnCancelLogin) btnCancelLogin.addEventListener('click', closeLogin);
if (uploadOverlay) {
  uploadOverlay.addEventListener('click', e => { if (e.target === uploadOverlay) closeUpload(); });
}
if (assistanceOverlay) {
  assistanceOverlay.addEventListener('click', e => { if (e.target === assistanceOverlay) closeAssistance(); });
}
if (loginOverlay) {
  loginOverlay.addEventListener('click', e => { if (e.target === loginOverlay) closeLogin(); });
}

if (assistanceForm) {
  assistanceForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!userLoggedIn) {
      alert('Devi essere loggato per inviare una richiesta di assistenza.');
      closeAssistance();
      openLogin();
      return;
    }

    const name = assistanceName ? assistanceName.value.trim() : '';
    const subject = assistanceSubject ? assistanceSubject.value.trim() : '';
    const message = assistanceMessage ? assistanceMessage.value.trim() : '';
    const errorContext = assistanceErrorContext ? assistanceErrorContext.value.trim() : '';

    if (!subject || !message) {
      alert('Compila soggetto e messaggio.');
      return;
    }

    try {
      const res = await fetch('/api/assistance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, message, errorContext })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Errore invio assistenza (${res.status})`);
      }

      closeAssistance();
      if (data && data.smtpAvailable === false) {
        alert('Richiesta ricevuta. Al momento l\'invio email non è disponibile perché SMTP non è configurato. La richiesta è stata registrata sul server e sarà gestita manualmente.');
      } else {
        alert('Richiesta di assistenza inviata con successo.');
      }
    } catch (err) {
      console.error('Assistenza error', err);
      alert(`Errore durante l\'invio della richiesta: ${err.message}`);
    }
  });
}

if (uploadOverlay) {
  uploadOverlay.addEventListener('click', e => { if (e.target === uploadOverlay) closeUpload(); });
}

if (uploadForm) {
  uploadForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const title = document.getElementById('uploadPdfTitle').value.trim();
    const keywords = document.getElementById('pdfKeywords').value.trim();
    const fileEl = document.getElementById('pdfFile');
    if (!title || !keywords || !fileEl || !fileEl.files.length) {
      alert('Compila tutti i campi e seleziona un file PDF.');
      return;
    }

    const fd = new FormData();
    fd.append('title', title);
    fd.append('keywords', keywords);
    fd.append('pdf', fileEl.files[0]);

    try {
      console.log('Upload PDF request', { title, keywords, fileName: fileEl.files[0].name });
      const res = await fetch('/api/procedures', { method: 'POST', body: fd });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        const message = errBody?.error || errBody?.message || `Upload fallito (status ${res.status})`;
        throw new Error(message);
      }
      closeUpload();
      await loadDocs();
      alert('PDF caricato con successo.');
    } catch (err) {
      console.error('Upload error', err);
      alert(`Errore durante l\'upload del PDF: ${err.message}`);
    }
  });
}

// --- Animazione Splash Screen ---
function initSplashScreen() {
  const titleEl = document.getElementById('splashTitle');
  if (!titleEl || typeof anime === 'undefined') return;

  const text = titleEl.textContent;
  titleEl.innerHTML = '';

  for (let char of text) {
    const span = document.createElement('span');
    span.className = 'letter';
    span.innerHTML = char === ' ' ? '&nbsp;' : char;
    titleEl.appendChild(span);
  }

  const splashTL = anime.timeline({
    autoplay: true,
    easing: 'easeOutExpo',
    complete: function () {
      setTimeout(() => {
        const splashOverlay = document.getElementById('splash-overlay');
        if (splashOverlay) {
          splashOverlay.classList.add('hidden');
          setTimeout(() => {
            splashOverlay.style.display = 'none';
          }, 800);
        }
      }, 2000);
    }
  });

  splashTL
    .add({
      targets: '#splashTitle .letter',
      opacity: [0, 1],
      translateY: [40, 0],
      scale: [0.7, 1],
      delay: anime.stagger(60, { start: 200 }),
      duration: 1000
    })
    .add({
      targets: '#splashLine',
      width: ['0px', '280px'],
      duration: 800,
      easing: 'easeInOutQuart'
    }, '-=400')
    .add({
      targets: '#splashSub',
      opacity: [0, 1],
      translateY: [15, 0],
      duration: 600
    }, '-=300');
}

// --- Inizializzazione ---
async function init() {
  initTheme();
  initSplashScreen();

  await loadUserStatus();
  initDragAndDrop();
  updateAdminUI();
  loadDocs();
}

function updateAdminUI() {
  if (btnAddPdf) btnAddPdf.style.display = 'inline-flex';
  if (btnAddContact) {
    btnAddContact.style.display = isAdmin ? 'inline-block' : 'none';
  }
  render(searchInput ? searchInput.value.trim() : '');
  renderContacts();
}

// --- STATO RUBRICA ---
const defaultContatti = [
  { id: 1, name: 'Direzione (Interno)', number: '6020' },
  { id: 2, name: 'Amministrazione (Interno)', number: '6015' },
  { id: 3, name: 'Reception (Interno)', number: '6010 / 6012' },
  { id: 4, name: 'Backoffice (Interno)', number: '6014' },
  { id: 5, name: 'Spiaggia (Interno)', number: '6017' },
  { id: 6, name: 'Cucina (Interno)', number: '613' },
  { id: 7, name: 'Sala (Interno)', number: '601' },
  { id: 8, name: 'Manutenzione (Interno)', number: '6018' },
  { id: 9, name: 'Bar (Interno)', number: '6011' },
  { id: 10, name: 'TAXI 23 TEKARI', number: '0544453050' },
  { id: 11, name: 'RADIO TAXI', number: '054433833' },
  { id: 101, name: 'Gianmaria - Direzione', number: '335684998' },
  { id: 102, name: 'Buratti - Direzione', number: '335307250' },
  { id: 103, name: 'Carlo - Direzione', number: '3703260700' },
  { id: 104, name: 'Dorotina - Amministrazione', number: '3382524284' },
  { id: 105, name: 'Deborah Usai - Amministrazione', number: '3475085817' },
  { id: 106, name: 'Ivana - Amministrazione', number: '3478601700' },
  { id: 107, name: 'Monica - Reception', number: '3387486936' },
  { id: 108, name: 'Sara - Reception', number: '3898595155' },
  { id: 109, name: 'Athene - Reception', number: '3334859947' },
  { id: 110, name: 'Alba - Reception', number: '3331232340' },
  { id: 111, name: 'Deborah - Reception', number: '3513586022' },
  { id: 112, name: 'Robert - Reception', number: '3513613136' },
  { id: 113, name: 'Antonella - Sala', number: '3491947734' },
  { id: 114, name: 'Nela - Sala', number: '3287043752' },
  { id: 115, name: 'Cristina - Sala', number: '3446387763' },
  { id: 116, name: 'Giulia - Sala', number: '3716125418' },
  { id: 117, name: 'Sara - Sala', number: '3899071857' },
  { id: 118, name: 'Mirko - Sala', number: '3891420222' },
  { id: 119, name: 'Antonio - Cucina', number: '3406033829' },
  { id: 120, name: 'Rino - Cucina', number: '3476555489' },
  { id: 121, name: 'Stefano - Cucina', number: '3662121706' },
  { id: 122, name: 'Joy - Cucina', number: '320675941' },
  { id: 123, name: 'Fofana - Cucina', number: '3509952068' },
  { id: 124, name: 'Elisa - Cucina', number: '3475127787' },
  { id: 125, name: 'Monica Polo - Bar', number: '339659330' },
  { id: 126, name: 'Marina - Bar', number: '3480633578' },
  { id: 127, name: 'Vincenzo - Bar', number: '3761065399' },
  { id: 128, name: 'Gerina - Bar', number: '3934522850' },
  { id: 129, name: 'Domenico - Bagnini', number: '3713124668' },
  { id: 130, name: 'Lorenzo - Bagnini', number: '3334345644' },
  { id: 131, name: 'Elena - Pulizie', number: '3476873503' },
  { id: 132, name: 'Bobo - Pulizie', number: '3922871792' },
  { id: 133, name: 'Danjela - Pulizie', number: '3791469391' },
  { id: 134, name: 'Ana - Pulizie', number: '3334294665' },
  { id: 135, name: 'Claudio - Manutenzione', number: '3664774232' },
  { id: 136, name: 'Kiki - Manutenzione', number: '+33 7 69 04 24 69' },
  { id: 137, name: 'Alex - Manutenzione', number: '3805825255' },
  { id: 138, name: 'Ibra Fall - Guardiano', number: '3203285632' },
  { id: 139, name: 'Lorenzo - Portiere Notturno', number: '3493217135' },
  { id: 140, name: 'Riccardo - Animazione', number: '377015826' },
  { id: 201, name: 'Pepe - Rotonda', number: '3357891890' },
  { id: 202, name: 'Sanzio - Rotonda', number: '3924042842' }
];

localStorage.setItem('hotel_contacts', JSON.stringify(defaultContatti));
let contatti = defaultContatti;

const btnAddContact = document.getElementById('btnAddContact');
const contactOverlay = document.getElementById('contactOverlay');
const btnCancelContact = document.getElementById('btnCancelContact');
const contactForm = document.getElementById('contactForm');
const searchContactInput = document.getElementById('searchContact');

function renderContacts(filterQuery = '') {
  const contactsList = document.getElementById('contactsList');
  if (!contactsList) return;

  contactsList.innerHTML = '';

  const q = filterQuery.toLowerCase();

  contatti.forEach(c => {
    if (q && !c.name.toLowerCase().includes(q) && !c.number.toLowerCase().includes(q)) return;

    const adminBtns = isAdmin ? `
      <div class="contact-actions" style="display:flex; gap:0.4rem; margin-top:0.3rem;">
        <button class="btn-mini-edit" onclick="editContact(${c.id})">Modifica</button>
        <button class="btn-mini-danger" onclick="deleteContact(${c.id})">Elimina</button>
      </div>
    ` : '';

    const html = `
      <div class="contact-item">
        <div>
          <div class="contact-name">${escapeHtml(c.name)}</div>
          ${adminBtns}
        </div>
        <div class="contact-number">${escapeHtml(c.number)}</div>
      </div>
    `;

    contactsList.innerHTML += html;
  });
}

if (btnAddContact) {
  btnAddContact.addEventListener('click', () => {
    document.getElementById('contactModalTitle').textContent = 'Aggiungi Contatto';
    contactForm.reset();
    document.getElementById('contactId').value = '';
    contactOverlay.style.display = 'flex';
  });
}

if (btnCancelContact) {
  btnCancelContact.addEventListener('click', () => {
    contactOverlay.style.display = 'none';
  });
}

if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('contactId').value;
    const name = document.getElementById('contactName').value.trim();
    const number = document.getElementById('contactNumber').value.trim();
    const category = document.getElementById('contactCategory').value;

    if (id) {
      const index = contatti.findIndex(c => c.id == id);
      if (index !== -1) {
        contatti[index] = { id: parseInt(id), name, number, category };
      }
    } else {
      const newId = contatti.length ? Math.max(...contatti.map(c => c.id)) + 1 : 1;
      contatti.push({ id: newId, name, number, category });
    }

    localStorage.setItem('hotel_contacts', JSON.stringify(contatti));
    contactOverlay.style.display = 'none';
    renderContacts(searchContactInput ? searchContactInput.value : '');
  });
}

window.editContact = function(id) {
  const c = contatti.find(x => x.id == id);
  if (c) {
    document.getElementById('contactModalTitle').textContent = 'Modifica Contatto';
    document.getElementById('contactId').value = c.id;
    document.getElementById('contactName').value = c.name;
    document.getElementById('contactNumber').value = c.number;
    document.getElementById('contactCategory').value = c.category;
    contactOverlay.style.display = 'flex';
  }
};

window.deleteContact = function(id) {
  if (confirm('Sei sicuro di voler eliminare questo contatto?')) {
    contatti = contatti.filter(c => c.id != id);
    localStorage.setItem('hotel_contacts', JSON.stringify(contatti));
    renderContacts(searchContactInput ? searchContactInput.value : '');
  }
};

if (searchContactInput) {
  searchContactInput.addEventListener('input', (e) => {
    renderContacts(e.target.value);
  });
}

const themeToggleBtns = document.querySelectorAll('.theme-toggle-btn, #themeToggle');
themeToggleBtns.forEach(btn => btn.addEventListener('click', toggleTheme));

init();