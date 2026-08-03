const http = require('http');
const data = JSON.stringify({ name: 'test', subject: 'test', message: 'test', errorContext: 'test' });
const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/assistance',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  console.log('STATUS', res.statusCode);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('HEADERS', res.headers);
    console.log('BODY', body);
  });
});
req.on('error', err => {
  console.error('ERROR', err);
});
req.write(data);
req.end();
