require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { PDFParse } = require('pdf-parse');
const { nanoid } = require('nanoid');
const { extractKeywords } = require('./keywords');

const app = express();
const PORT = process.env.PORT || 3000;

function loadEnvVar(name) {
  let value = process.env[name];
  if (!value) return undefined;
  value = value.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

const ADMIN_PASSWORD = loadEnvVar('ADMIN_PASSWORD') || 'changeme';
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('WARNING: ADMIN_PASSWORD non impostata, viene utilizzata la password di default "changeme". Imposta ADMIN_PASSWORD nel file .env o nelle variabili di ambiente.');
}
console.log(`ADMIN_PASSWORD loaded: ${process.env.ADMIN_PASSWORD ? 'yes' : 'no'} | using default: ${ADMIN_PASSWORD === 'changeme'}`);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(cookieParser());

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'manuali_hotel',
    resource_type: 'auto'
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Solo file PDF sono ammessi'));
    cb(null, true);
  }
});

function readDb() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'db.json'), 'utf-8'));
}
function writeDb(data) {
  fs.writeFileSync(path.join(__dirname, 'data', 'db.json'), JSON.stringify(data, null, 2));
}

function requireAdmin(req, res, next) {
  if (req.cookies.admin_session === SESSION_TOKEN) return next();
  res.status(401).json({ error: 'Accesso admin richiesto' });
}

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, procedure: readDb().length });
});

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body.password || '').trim();
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin_session', SESSION_TOKEN, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Password errata' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ ok: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: req.cookies.admin_session === SESSION_TOKEN });
});

app.get('/api/procedures', (req, res) => {
  const db = readDb();
  res.json(db.map(({ text, ...rest }) => rest));
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const db = readDb();

  if (!q) return res.json(db.map(({ text, ...rest }) => rest));

  const terms = q.split(/\s+/).filter(Boolean);
  const scored = db.map(proc => {
    const title = proc.title.toLowerCase();
    const keywords = proc.keywords.join(' ').toLowerCase();
    const text = (proc.text || '').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 5;
      if (keywords.includes(t)) score += 4;
      if (text.includes(t)) score += 1;
    }
    return { proc, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  res.json(scored.map(x => { const { text, ...rest } = x.proc; return rest; }));
});

app.get('/api/procedures/:id/pdf', (req, res) => {
  const db = readDb();
  const proc = db.find(p => p.id === req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procedura non trovata' });

  if (proc.pdfUrl) return res.redirect(proc.pdfUrl);

  if (proc.filename) {
    const filePath = path.join(__dirname, 'uploads', proc.filename);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || proc.filename}"`);
    return res.sendFile(filePath);
  }

  res.status(404).json({ error: 'PDF non disponibile' });
});

app.get('/api/procedures/pdf/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', filename);

  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.sendFile(filePath);
  } else {
    res.status(404).send('File PDF non trovato sul server.');
  }
});

app.post('/api/procedures', requireAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file ricevuto' });

    const pdfUrl = req.file?.path || null;
    const title = (req.body.title || req.file.originalname.replace(/\.pdf$/i, '')).trim();

    let text = '';
    let keywords = [];

    if (pdfUrl) {
      try {
        const response = await fetch(pdfUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const parser = new PDFParse({ data: buffer });
          const parsed = await parser.getText();
          await parser.destroy();
          text = parsed.text.slice(0, 30000);
          keywords = extractKeywords(text);
        }
      } catch (err) {
        console.warn('Impossibile estrarre il testo dal PDF remoto:', err.message);
      }
    }

    const procedure = {
      id: nanoid(8),
      title,
      keywords,
      text,
      pdfUrl,
      originalName: req.file.originalname,
      uploadedAt: Date.now()
    };

    const db = readDb();
    db.unshift(procedure);
    writeDb(db);

    const { text: _omit, ...toReturn } = procedure;
    res.json(toReturn);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore durante il caricamento del PDF' });
  }
});

app.delete('/api/procedures/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const proc = db.find(p => p.id === req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procedura non trovata' });

  const filePath = path.join(__dirname, 'uploads', proc.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  writeDb(db.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Manuale reception in ascolto sulla porta ${PORT}`);
});