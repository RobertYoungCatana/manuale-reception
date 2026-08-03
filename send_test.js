const http = require('http');

const data = JSON.stringify({
  name: 'Verifica Automatica',
  email: 'robertpatriche5@gmail.com',
  subject: 'Verifica invio automatica',
  message: "Questo è un test automatico per verificare l'invio a robertpatriche5@gmail.com",
  errorContext: 'Test manuale richiesto dall\'utente'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/assistance',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Response body:', body);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(data);
req.end();
