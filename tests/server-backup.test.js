const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

async function requestJson(port, method, requestPath, payload) {
  const body = payload ? JSON.stringify(payload) : '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            json: raw ? JSON.parse(raw) : {}
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moyun-backup-test-'));
  const dataDir = path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'js'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'js', 'blog-data.js'), 'window.LEO_BLOG_DATA={posts:[]};', 'utf8');
  fs.writeFileSync(path.join(dataDir, 'posts.json'), JSON.stringify([{
    id: 'old-post',
    slug: 'old-post',
    title: 'Old Post',
    category: 'Diary',
    tags: [],
    excerpt: 'before',
    content: ['before body'],
    status: 'published',
    published: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }], null, 2), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'comments.json'), '{}', 'utf8');

  process.env.APP_ROOT = tmpRoot;
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';

  const server = require('../server');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const response = await requestJson(port, 'POST', '/api/posts', {
      slug: 'old-post',
      title: 'Old Post Updated',
      category: 'Diary',
      content: ['after body'],
      status: 'published'
    });
    assert.strictEqual(response.status, 200);

    const backupsDir = path.join(dataDir, 'backups');
    const backups = fs.readdirSync(backupsDir).filter((name) => /^posts-\d{8}-\d{6}-\d{3}\.json$/.test(name));
    assert.strictEqual(backups.length, 1, 'one timestamped posts backup should be created before overwriting posts.json');

    const backupPayload = JSON.parse(fs.readFileSync(path.join(backupsDir, backups[0]), 'utf8'));
    assert.strictEqual(backupPayload[0].title, 'Old Post');
    assert.strictEqual(backupPayload[0].content[0], 'before body');

    const exportResponse = await requestJson(port, 'GET', '/api/backups/posts', null);
    assert.strictEqual(exportResponse.status, 200);
    assert.strictEqual(exportResponse.json.posts[0].title, 'Old Post Updated');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
