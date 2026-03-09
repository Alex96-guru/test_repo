const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const defaultPort = Number(process.env.PORT) || 3000;
const root = __dirname;
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'site.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    project_type TEXT NOT NULL,
    budget TEXT,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertLead = db.prepare(`
  INSERT INTO leads (name, email, project_type, budget, message, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const selectRecentLeads = db.prepare(`
  SELECT id, name, email, project_type, budget, message, created_at
  FROM leads
  ORDER BY id DESC
  LIMIT ?
`);

const countLeads = db.prepare('SELECT COUNT(*) AS total FROM leads');

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

const projectTypeLabels = {
  landing: 'Лендинг',
  multipage: 'Многостраничный сайт',
  portfolio: 'Портфолио',
  'demo-app': 'Демо с backend'
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        request.destroy();
      }
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function mapLead(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    projectType: row.project_type,
    projectTypeLabel: projectTypeLabels[row.project_type] || row.project_type,
    budget: row.budget,
    message: row.message,
    createdAt: row.created_at
  };
}

function getStats() {
  const total = countLeads.get().total;
  const recent = selectRecentLeads.all(5).map(mapLead);

  return {
    totalLeads: total,
    recentLeads: recent
  };
}

function validateLead(input) {
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim();
  const projectType = String(input.projectType || '').trim();
  const budget = String(input.budget || '').trim();
  const message = String(input.message || '').trim();

  if (!name || name.length > 80) {
    return { error: 'Имя обязательно и должно быть короче 80 символов.' };
  }

  if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Нужен корректный email.' };
  }

  if (!projectTypeLabels[projectType]) {
    return { error: 'Выбери корректный тип проекта.' };
  }

  if (!message || message.length > 500) {
    return { error: 'Комментарий обязателен и должен быть короче 500 символов.' };
  }

  return {
    value: {
      name,
      email,
      projectType,
      budget,
      message,
      createdAt: new Date().toISOString()
    }
  };
}

function serveFile(requestPath, response) {
  const safePath = path.normalize(requestPath).replace(/^([.][/\\])+/, '');
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
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/stats' && request.method === 'GET') {
    json(response, 200, getStats());
    return;
  }

  if (url.pathname === '/api/leads' && request.method === 'POST') {
    try {
      const rawBody = await readBody(request);
      const payload = JSON.parse(rawBody || '{}');
      const validated = validateLead(payload);

      if (validated.error) {
        json(response, 400, { error: validated.error });
        return;
      }

      const lead = validated.value;
      const result = insertLead.run(
        lead.name,
        lead.email,
        lead.projectType,
        lead.budget,
        lead.message,
        lead.createdAt
      );

      json(response, 201, {
        success: true,
        id: Number(result.lastInsertRowid),
        totalLeads: countLeads.get().total
      });
    } catch (error) {
      json(response, 500, { error: 'Не удалось сохранить заявку.' });
    }
    return;
  }

  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  serveFile(requestPath, response);
});

function listen(port) {
  server.listen(port);
}

server.on('listening', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : defaultPort;
  console.log(`Preview server running at http://localhost:${port}`);
  console.log(`SQLite database: ${dbPath}`);
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
