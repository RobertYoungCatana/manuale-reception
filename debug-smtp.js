require('dotenv').config();
const nodemailer = require('nodemailer');

function loadEnvVar(name) {
  let value = process.env[name];
  if (!value) return undefined;
  value = value.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

const smtpHost = loadEnvVar('SMTP_HOST');
const smtpPort = parseInt(loadEnvVar('SMTP_PORT') || '587', 10);
const smtpUser = loadEnvVar('SMTP_USER');
const smtpPass = loadEnvVar('SMTP_PASS');
const smtpSecure = loadEnvVar('SMTP_SECURE') === 'true';

console.log({ smtpHost, smtpPort, smtpUser, smtpPass: smtpPass ? '***' : undefined, smtpSecure });

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: { user: smtpUser, pass: smtpPass },
  logger: true,
  debug: true,
});
(async () => {
  try {
    const info = await transporter.verify();
    console.log('VERIFY OK', info);
    const sendInfo = await transporter.sendMail({
      from: `Manuale Reception <${smtpUser}>`,
      to: smtpUser,
      subject: 'Test SMTP debug',
      text: 'SMTP test message',
    });
    console.log('SEND OK', sendInfo);
  } catch (err) {
    console.error('SMTP ERROR', err);
  }
})();
