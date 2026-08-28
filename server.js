const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { handleRequest } = require('./lib/backend');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const readRequestBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1e6) request.destroy();
  });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

const sendResponse = (response, result) => {
  response.writeHead(result.statusCode || 200, result.headers || {});
  response.end(result.body || '');
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const result = await handleRequest({
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body: await readRequestBody(request),
      isBase64Encoded: false
    });
    return sendResponse(response, result);
  }

  if (request.method !== 'GET') {
    return sendResponse(response, {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Method not allowed.' })
    });
  }

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendResponse(response, {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: 'Not found.' })
    });
  }
  response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`SOUFIANE DEV running at http://localhost:${PORT}`));
}

module.exports = { server };
