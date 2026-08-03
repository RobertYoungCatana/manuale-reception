require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || '').replace(/^\"|\"$/g, '');
  const secure = (process.env.SMTP_SECURE === 'true');
  const support = process.env.SUPPORT_EMAIL || user;

  if (!host || !user || !pass) {
    console.error('SMTP non configurato correttamente nelle variabili d\'ambiente.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  try {
    const info = await transporter.sendMail({
      from: `Manuale Reception <${user}>`,
      to: support,
      subject: 'Test consegna SMTP (diretto)',
      text: 'Questa è una email di test inviata direttamente dal server per verificare la consegna.'
    });
    console.log('Invio OK, messageId=', info.messageId);
    process.exit(0);
  } catch (err) {
    console.error('Errore invio SMTP:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
