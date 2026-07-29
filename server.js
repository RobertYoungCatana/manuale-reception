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

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};
const useCloudinary = cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret;

if (useCloudinary) {
  cloudinary.config(cloudinaryConfig);
}

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

const storage = useCloudinary
  ? new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'manuali_hotel',
        resource_type: 'auto'
      }
    })
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
      filename: (req, file, cb) => {
        const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        cb(null, safeName);
      }
    });

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/octet-stream'];
    if (!allowed.includes(file.mimetype) && !file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(new Error('Solo file PDF sono ammessi'));
    }
    cb(null, true);
  }
});

console.log(`Upload mode: ${useCloudinary ? 'cloudinary' : 'local uploads folder'}`);

function readDb() {
}
function readDb() {
  const dbDir = path.join(__dirname, 'data');
  const dbPath = path.join(dbDir, 'db.json');
  if (!fs.existsSync(dbPath)) return [];
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
function writeDb(data) {
  const dbDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  fs.writeFileSync(path.join(dbDir, 'db.json'), JSON.stringify(data, null, 2));
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

app.post('/api/procedures', upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('/api/procedures upload', {
      fileFields: req.files ? Object.keys(req.files) : [],
      pdfFiles: req.files?.pdf?.length || 0,
      fileFiles: req.files?.file?.length || 0,
      body: {
        title: req.body.title,
        keywords: req.body.keywords
      }
    });

    const uploadedFile = (req.files?.pdf && req.files.pdf[0]) || (req.files?.file && req.files.file[0]);
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Nessun file ricevuto. Assicurati di selezionare un PDF valido.' });
    }

    const pdfUrl = uploadedFile.path && uploadedFile.path.startsWith('http')
      ? uploadedFile.path
      : `/uploads/${uploadedFile.filename}`;
    const title = (req.body.title || uploadedFile.originalname.replace(/\.pdf$/i, '')).trim();

    let text = '';
    let keywords = [];

    try {
      if (uploadedFile.path && uploadedFile.path.startsWith('http')) {
        const response = await fetch(uploadedFile.path);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const parser = new PDFParse({ data: buffer });
          const parsed = await parser.getText();
          await parser.destroy();
          text = parsed.text.slice(0, 30000);
          keywords = extractKeywords(text);
        }
      } else if (uploadedFile.path) {
        const buffer = fs.readFileSync(uploadedFile.path);
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        await parser.destroy();
        text = parsed.text.slice(0, 30000);
        keywords = extractKeywords(text);
      }
    } catch (err) {
      console.warn('Impossibile estrarre il testo dal PDF:', err.message);
    }

    const procedure = {
      id: nanoid(8),
      title,
      keywords,
      text,
      pdfUrl,
      filename: uploadedFile.filename,
      originalName: uploadedFile.originalname,
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