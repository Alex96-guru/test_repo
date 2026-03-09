const http = require('http');
const fs = require('fs');
const path = require('path');

const defaultPort = Number(process.env.PORT) || 3000;
const root = __dirname;

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = http.createServer((request, response) => {
  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(root, safePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain; charset=utf-8'
      });
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream'
    });
    response.end(data);
  });
});

function listen(port) {
  server.listen(port);
}

server.on('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : defaultPort;
  console.log(`Preview server running at http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    const nextPort = Number(error.port || defaultPort) + 1;
    console.log(`Port ${error.port || defaultPort} is busy, trying ${nextPort}...`);
    setTimeout(() => listen(nextPort), 150);
    return;
  }

  throw error;
});

listen(defaultPort);
