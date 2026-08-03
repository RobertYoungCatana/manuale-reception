require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const user = process.env.SMTP_USER;
  const pass = (process.env.SMTP_PASS || '').replace(/^\"|\"$/g, '');
  const secure = (process.env.SMTP_SECURE === 'true');
  const toList = ['robertpatriche5@gmail.com', 'testkali866@gmail.com'];

  if (!host || !user || !pass) {
    console.error('SMTP non configurato correttamente nelle variabili d\'ambiente.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });

  try {
    const info = await transporter.sendMail({
      from: `Manuale Reception <${user}>`,
      to: toList.join(','),
      subject: 'Test consegna SMTP a più destinatari',
      text: 'Questo è un test inviato dal server per verificare la consegna a più destinatari: ' + toList.join(', ')
    });
    const fs = require('fs');
    fs.appendFileSync('assistance-debug.log', JSON.stringify({ directSend: true, to: toList, messageId: info.messageId, timestamp: new Date().toISOString() }) + '\n');
    console.log('Invio OK, messageId=', info.messageId);
    process.exit(0);
  } catch (err) {
    const fs = require('fs');
    fs.appendFileSync('assistance-debug.log', JSON.stringify({ directSend: true, error: String(err && err.message ? err.message : err), timestamp: new Date().toISOString() }) + '\n');
    console.error('Errore invio SMTP:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
