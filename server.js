const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const vm = require('vm');

const rootDir = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : __dirname;
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.BLOG_PORT || 8093);
const dataDir = path.join(rootDir, 'data');
const postsFile = path.join(dataDir, 'posts.json');
const commentsFile = path.join(dataDir, 'comments.json');
const backupsDir = path.join(dataDir, 'backups');
const maxPostBackups = Number(process.env.MAX_POST_BACKUPS || 100);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\u4e00-\u9fa5]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `post-${Date.now()}`;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toParagraphs(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDate(value, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizePost(input) {
  const now = new Date().toISOString();
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '').trim() || slugify(title);
  const status = input.status === 'draft' ? 'draft' : 'published';
  return {
    id: String(input.id || slug || Date.now()),
    slug,
    title,
    category: String(input.category || 'Uncategorized').trim(),
    tags: toArray(input.tags),
    excerpt: String(input.excerpt || '').trim(),
    content: toParagraphs(input.content),
    status,
    published: input.published !== undefined ? !!input.published : status !== 'draft',
    publishedAt: normalizeDate(input.publishedAt, now),
    updatedAt: normalizeDate(input.updatedAt, now)
  };
}

function normalizeComment(input) {
  return {
    postSlug: String(input.postSlug || '').trim(),
    name: String(input.name || 'Anonymous').trim(),
    contact: String(input.contact || '').trim(),
    content: String(input.content || '').trim(),
    approved: input.approved !== false,
    createdAt: normalizeDate(input.createdAt, new Date().toISOString())
  };
}

function sortPosts(posts) {
  return [...posts].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(postsFile)) {
    fs.writeFileSync(postsFile, JSON.stringify(loadSeedPosts(), null, 2), 'utf8');
  }
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, JSON.stringify({}, null, 2), 'utf8');
  }
}

function loadSeedPosts() {
  try {
    const seedCode = fs.readFileSync(path.join(rootDir, 'js', 'blog-data.js'), 'utf8');
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(seedCode, sandbox);
    const posts = (((sandbox.window || {}).LEO_BLOG_DATA || {}).posts) || [];
    return sortPosts(posts.map(normalizePost));
  } catch (error) {
    return [];
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function getTimestampForFile(date = new Date()) {
  return date.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .replace('Z', '')
    .replace('.', '-');
}

function listPostBackups() {
  try {
    return fs.readdirSync(backupsDir)
      .filter((name) => /^posts-\d{8}-\d{6}-\d{3}\.json$/.test(name))
      .sort()
      .map((name) => {
        const fullPath = path.join(backupsDir, name);
        const stats = fs.statSync(fullPath);
        return {
          name,
          size: stats.size,
          createdAt: stats.mtime.toISOString()
        };
      });
  } catch (error) {
    return [];
  }
}

function pruneOldPostBackups() {
  if (!Number.isFinite(maxPostBackups) || maxPostBackups <= 0) return;
  const backups = listPostBackups();
  const excess = backups.length - maxPostBackups;
  if (excess <= 0) return;

  backups.slice(0, excess).forEach((backup) => {
    fs.rmSync(path.join(backupsDir, backup.name), { force: true });
  });
}

function backupPostsFile() {
  ensureDataFiles();
  if (!fs.existsSync(postsFile)) return null;

  fs.mkdirSync(backupsDir, { recursive: true });
  const backupName = `posts-${getTimestampForFile()}.json`;
  const backupPath = path.join(backupsDir, backupName);
  fs.copyFileSync(postsFile, backupPath);
  pruneOldPostBackups();
  return backupName;
}

function readPosts() {
  ensureDataFiles();
  return sortPosts(readJson(postsFile, []).map(normalizePost));
}

function writePosts(posts) {
  backupPostsFile();
  writeJson(postsFile, sortPosts(posts.map(normalizePost)));
}

function readComments() {
  ensureDataFiles();
  return readJson(commentsFile, {});
}

function writeComments(comments) {
  writeJson(commentsFile, comments || {});
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function resolvePath(requestPath) {
  const normalized = decodeURIComponent(requestPath.split('?')[0]);
  const safePath = normalized === '/' ? '/index.html' : normalized;
  const fullPath = path.normalize(path.join(rootDir, safePath));
  if (!fullPath.startsWith(rootDir)) return null;
  return fullPath;
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'GET' && pathname === '/api/posts') {
    const publishedOnly = query.publishedOnly !== 'false';
    const posts = readPosts().filter((post) => (publishedOnly ? post.published && post.status !== 'draft' : true));
    sendJson(res, 200, { posts });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/backups/posts') {
    const posts = readPosts();
    sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      posts,
      backups: listPostBackups()
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/posts') {
    const body = await readRequestBody(req);
    const title = String(body.title || '').trim();
    if (!title) {
      sendJson(res, 400, { error: 'Title is required.' });
      return true;
    }

    const posts = readPosts();
    const post = normalizePost({
      ...body,
      slug: String(body.slug || '').trim() || slugify(title),
      published: body.status !== 'draft',
      updatedAt: new Date().toISOString(),
      publishedAt: body.publishedAt || new Date().toISOString()
    });
    const index = posts.findIndex((item) => item.slug === post.slug);
    if (index >= 0) posts[index] = post;
    else posts.push(post);
    writePosts(posts);
    sendJson(res, 200, { post });
    return true;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/posts/')) {
    const slug = decodeURIComponent(pathname.slice('/api/posts/'.length));
    const posts = readPosts().filter((post) => post.slug !== slug);
    writePosts(posts);
    const comments = readComments();
    delete comments[slug];
    writeComments(comments);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/comments') {
    const postSlug = String(query.postSlug || '').trim();
    const comments = readComments();
    const list = Array.isArray(comments[postSlug]) ? comments[postSlug] : [];
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    sendJson(res, 200, { comments: list.filter((item) => item.approved !== false) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/comments') {
    const body = await readRequestBody(req);
    const comment = normalizeComment(body);
    if (!comment.postSlug || !comment.content) {
      sendJson(res, 400, { error: 'postSlug and content are required.' });
      return true;
    }
    const comments = readComments();
    const list = Array.isArray(comments[comment.postSlug]) ? comments[comment.postSlug] : [];
    list.push(comment);
    comments[comment.postSlug] = list;
    writeComments(comments);
    sendJson(res, 200, { comment });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { ok: true, host, port });
    return true;
  }

  return false;
}

ensureDataFiles();

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';

  try {
    if (pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, pathname, parsed.query || {});
      if (!handled) sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    const fullPath = resolvePath(pathname);
    if (!fullPath) {
      send(res, 403, 'Forbidden');
      return;
    }

    fs.stat(fullPath, (statErr, stats) => {
      if (statErr || !stats.isFile()) {
        send(res, 404, 'Not Found');
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const stream = fs.createReadStream(fullPath);
      res.writeHead(200, {
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      stream.pipe(res);
      stream.on('error', () => send(res, 500, 'Server Error'));
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Server Error' });
  }
});

server.listen(port, host, () => {
  console.log(`Blog server listening on http://${host}:${port}`);
});

module.exports = server;
