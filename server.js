require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const nodemailer = require('nodemailer');
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

const supportEmail = loadEnvVar('SUPPORT_EMAIL') || 'robertpatriche5@gmail.com';
const smtpHost = loadEnvVar('SMTP_HOST');
const smtpPort = parseInt(loadEnvVar('SMTP_PORT') || '587', 10);
const smtpUser = loadEnvVar('SMTP_USER');
const smtpPass = loadEnvVar('SMTP_PASS');
const smtpSecure = loadEnvVar('SMTP_SECURE') === 'true';

console.log('SMTP status:', {
  host: smtpHost ? smtpHost : 'MISSING',
  port: smtpPort,
  user: smtpUser ? smtpUser.replace(/.(?=.{4})/g, '*') : 'MISSING',
  secure: smtpSecure,
  supportEmail
});

if (useCloudinary) {
  cloudinary.config(cloudinaryConfig);
}

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

function createSmtpTransport() {
  if (!smtpHost || !smtpUser || !smtpPass) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
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

app.get('/api/debug-smtp', (req, res) => {
  const transporter = createSmtpTransport();
  return res.json({
    smtpConfigured: !!transporter,
    smtpHost: smtpHost || null,
    smtpUser: smtpUser ? smtpUser.replace(/.(?=.{4})/g, '*') : null,
    smtpSecure,
    supportEmail,
    smtpPort
  });
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

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.post('/api/user/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Inserisci un indirizzo email valido.' });
  }
  res.cookie('user_session', email, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ ok: true, email });
});

app.post('/api/user/logout', (req, res) => {
  res.clearCookie('user_session');
  res.json({ ok: true });
});

app.get('/api/user/status', (req, res) => {
  const email = String(req.cookies.user_session || '').trim();
  res.json({ loggedIn: !!email, email: email || null });
});

app.post('/api/assistance', async (req, res) => {
  const sessionEmail = String(req.cookies.user_session || '').trim();
  const { name, subject, message, errorContext } = req.body || {};
  const email = sessionEmail || String(req.body.email || '').trim();

  const debugEntry = {
    timestamp: new Date().toISOString(),
    sessionEmail,
    bodyEmail: String(req.body?.email || '').trim(),
    name,
    subject,
    message,
    errorContext,
    email,
    smtpHost,
    smtpPort,
    smtpUser: smtpUser ? smtpUser.replace(/.(?=.{4})/g, '*') : undefined,
    smtpSecure,
    supportEmail
  };
  fs.appendFileSync(path.join(__dirname, 'assistance-debug.log'), JSON.stringify({ debugEntry }) + '\n');

  if (!subject || !message) {
    return res.status(400).json({ error: 'Compila soggetto e messaggio.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Email utente non valida o non disponibile. Effettua il login con un indirizzo email valido.' });
  }

  const transporter = createSmtpTransport();
  const bodyText = [
    `Nome: ${name || 'Non fornito'}`,
    `Email: ${email}`,
    `Soggetto: ${subject}`,
    '',
    message,
    '',
    `Contesto errore: ${errorContext || 'Nessuno'}`
  ].join('\n');

  try {
    if (transporter) {
      // Temporarily include an extra test recipient for debugging deliverability
      const extraRecipients = (process.env.EXTRA_RECIPIENTS || 'testkali866@gmail.com').split(',').map(s => s.trim()).filter(Boolean);
      const toField = [supportEmail, ...extraRecipients].join(',');
      const info = await transporter.sendMail({
        from: `Manuale Reception <${smtpUser}>`,
        to: toField,
        bcc: email,
        subject: `[ASSISTENZA] ${subject}`,
        text: bodyText,
        replyTo: email
      });
      fs.appendFileSync(path.join(__dirname, 'assistance-debug.log'), JSON.stringify({ smtpPhase: 'send-success', messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }) + '\n');
      // attach smtp info to debugEntry for response
      debugEntry.smtpMessageId = info.messageId;
    } else {
      fs.appendFileSync(path.join(__dirname, 'assistance-debug.log'), JSON.stringify({ smtpPhase: 'not-configured' }) + '\n');
      console.warn('SMTP non configurato: assistenza ricevuta ma non inviata via email.', { email, subject, bodyText });
    }

    return res.json({ ok: true, smtpAvailable: !!transporter, messageId: debugEntry.smtpMessageId || null });
  } catch (err) {
    fs.appendFileSync(path.join(__dirname, 'assistance-debug.log'), JSON.stringify({ smtpPhase: 'error', error: err && err.message ? err.message : String(err) }) + '\n');
    console.error('Assistance mail error:', err);
    const responseError = process.env.DEBUG_SMTP === 'true' ? String(err.message || err) : 'Impossibile inviare l\'email di assistenza.';
    return res.status(500).json({ error: responseError });
  }
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

app.get('/api/procedures', (req, res) => {
  const db = readDb();
  const docs = db.map(({ text, ...rest }) => rest);
  res.json(docs);
});

app.get('/api/procedures/:id/pdf', async (req, res) => {
  const db = readDb();
  const proc = db.find(p => p.id === req.params.id);
  if (!proc) return res.status(404).json({ error: 'Procedura non trovata' });
  console.log(`/api/procedures/${req.params.id}/pdf requested, proc:`, { id: proc.id, pdfUrl: proc.pdfUrl, filename: proc.filename });

  const localFilePath = proc.filename ? path.join(__dirname, 'uploads', proc.filename) : null;
  const localPdfPath = proc.pdfUrl && proc.pdfUrl.startsWith('/uploads/') ? path.join(__dirname, proc.pdfUrl.replace(/^\//, '')) : null;

  if (localFilePath && fs.existsSync(localFilePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || proc.filename}"`);
    return res.sendFile(localFilePath);
  }

  if (localPdfPath && fs.existsSync(localPdfPath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || path.basename(localPdfPath)}"`);
    return res.sendFile(localPdfPath);
  }

  // If pdfUrl is a remote URL, fetch and proxy it to the browser.
  if (proc.pdfUrl && (proc.pdfUrl.startsWith('http://') || proc.pdfUrl.startsWith('https://'))) {
    let remoteUrl = proc.pdfUrl;
    let fetchResponse;

    const getSignedCloudinaryUrl = () => {
      try {
        return cloudinary.url(proc.filename, { resource_type: 'auto', sign_url: true, secure: true });
      } catch (err) {
        console.warn('Cloudinary signed URL failed:', err.message);
        return null;
      }
    };

    try {
      fetchResponse = await fetch(remoteUrl);
      if (!fetchResponse.ok && proc.filename && proc.pdfUrl.includes('res.cloudinary.com')) {
        const signed = getSignedCloudinaryUrl();
        if (signed) {
          remoteUrl = signed;
          fetchResponse = await fetch(remoteUrl);
        }
      }

      if (!fetchResponse.ok && proc.filename && typeof cloudinary.api !== 'undefined') {
        try {
          const info = await cloudinary.api.resource(proc.filename, { resource_type: 'auto' });
          const fallbackUrl = info?.secure_url || info?.url;
          if (fallbackUrl) {
            remoteUrl = fallbackUrl;
            fetchResponse = await fetch(remoteUrl);
          }
        } catch (err) {
          console.warn('Cloudinary API resource lookup failed:', err.message);
        }
      }

      if (!fetchResponse.ok) {
        console.error('Remote PDF fetch failed:', remoteUrl, fetchResponse.status, fetchResponse.statusText);
        return res.status(fetchResponse.status).json({ error: 'Impossibile recuperare il PDF remoto' });
      }

      res.status(fetchResponse.status);
      const contentType = fetchResponse.headers.get('content-type') || 'application/pdf';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || path.basename(remoteUrl)}"`);
      const contentLength = fetchResponse.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      return fetchResponse.body.pipe(res);
    } catch (err) {
      console.error('Error proxying remote PDF:', err);
      return res.status(502).json({ error: 'Impossibile recuperare il PDF remoto' });
    }
  }

  // If pdfUrl points to a local uploads path, serve the file directly
  if (proc.pdfUrl && proc.pdfUrl.startsWith('/')) {
    const candidate = path.join(__dirname, proc.pdfUrl.replace(/^\//, ''));
    if (fs.existsSync(candidate)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || path.basename(candidate)}"`);
      return res.sendFile(candidate);
    } else {
      console.warn('Requested pdfUrl file not found on disk:', candidate);
    }
  }

  // Fallback to filename field (older entries)
  if (proc.filename) {
    const filePath = path.join(__dirname, 'uploads', proc.filename);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${proc.originalName || proc.filename}"`);
      return res.sendFile(filePath);
    } else {
      console.warn('Requested filename not found on disk:', filePath);
    }
  }

  return res.status(404).json({ error: 'PDF non disponibile' });
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

    const id = nanoid(8);
    const localFilename = uploadedFile.path && uploadedFile.path.startsWith('http')
      ? `${id}.pdf`
      : uploadedFile.filename;
    const localFilePath = path.join(__dirname, 'uploads', localFilename);
    const remoteUrl = uploadedFile.path && uploadedFile.path.startsWith('http') ? uploadedFile.path : null;
    const cloudinaryId = remoteUrl ? uploadedFile.filename : null;
    const localUrl = `/uploads/${localFilename}`;
    const title = (req.body.title || uploadedFile.originalname.replace(/\.pdf$/i, '')).trim();

    let text = '';
    let keywords = [];

    try {
      if (remoteUrl) {
        const response = await fetch(remoteUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(localFilePath, buffer);
          const parser = new PDFParse({ data: buffer });
          const parsed = await parser.getText();
          await parser.destroy();
          text = parsed.text.slice(0, 30000);
          keywords = extractKeywords(text);
        }
      } else if (uploadedFile.path) {
        const buffer = fs.readFileSync(uploadedFile.path);
        if (!fs.existsSync(localFilePath)) {
          fs.copyFileSync(uploadedFile.path, localFilePath);
        }
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
      id,
      title,
      keywords,
      text,
      pdfUrl: localUrl,
      filename: localFilename,
      originalName: uploadedFile.originalname,
      uploadedAt: Date.now(),
      cloudinaryId,
      cloudinaryUrl: remoteUrl
    };

    const db = readDb();
    db.unshift(procedure);
    writeDb(db);
    console.log('Saved procedure to db.json:', { id: procedure.id, filename: procedure.filename, pdfUrl: procedure.pdfUrl });

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