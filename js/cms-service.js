(function () {
  const config = window.CMS_CONFIG || window.LEO_CMS_CONFIG || {};
  const seedData = window.LEO_BLOG_DATA || window.BLOG_DATA || { posts: [] };
  const STORAGE_KEYS = {
    posts: 'leo_cms_posts_v2',
    comments: 'leo_cms_comments_v2',
    initialized: 'leo_cms_seed_initialized_v2'
  };
  const API_BASE = ((config.api && config.api.baseUrl) || '/api').replace(/\/$/, '');

  let cloudbaseAppPromise = null;

  function pick(obj, keys, fallback = '') {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
        return obj[key];
      }
    }
    return fallback;
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

  function toParagraphs(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value || '')
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function toTags(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    return String(value || '')
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeDateValue(value) {
    if (!value) return new Date().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    }
    if (typeof value === 'object') {
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
      if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
      if (value.$date) return normalizeDateValue(value.$date);
    }
    return new Date().toISOString();
  }

  function normalizePost(post) {
    const status = pick(post, ['status'], post && post.published === false ? 'draft' : 'published');
    const title = pick(post, ['title'], '');
    const slug = pick(post, ['slug'], slugify(title));
    return {
      id: pick(post, ['id', '_id', 'contentId', 'slug'], slug || String(Date.now())),
      slug: slug || `post-${Date.now()}`,
      title,
      category: pick(post, ['category'], 'Uncategorized'),
      tags: toTags(pick(post, ['tags'], [])),
      publishedAt: normalizeDateValue(pick(post, ['publishedAt', 'createdAt', 'updatedAt'], new Date().toISOString())),
      excerpt: pick(post, ['excerpt', 'summary', 'description'], ''),
      content: toParagraphs(pick(post, ['content', 'body', 'markdown'], '')),
      status,
      published: post && post.published !== undefined ? !!post.published : status !== 'draft',
      updatedAt: normalizeDateValue(pick(post, ['updatedAt', 'publishedAt'], new Date().toISOString()))
    };
  }

  function normalizeCmsApiPost(raw) {
    const sources = [raw, raw && raw.data, raw && raw.fields, raw && raw.content].filter(Boolean);
    const merged = {};
    sources.forEach((source) => {
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        Object.assign(merged, source);
      }
    });
    return normalizePost({
      id: pick(merged, ['_id', 'id', 'contentId'], pick(raw, ['_id', 'id'], '')),
      slug: pick(merged, ['slug']),
      title: pick(merged, ['title']),
      category: pick(merged, ['category']),
      tags: pick(merged, ['tags']),
      excerpt: pick(merged, ['excerpt', 'summary', 'description']),
      content: pick(merged, ['content', 'body', 'markdown']),
      publishedAt: pick(merged, ['publishedAt', 'createdAt', 'updatedAt']),
      status: pick(merged, ['status']),
      published: pick(merged, ['published'], true),
      updatedAt: pick(merged, ['updatedAt', 'publishedAt'])
    });
  }

  function sortPosts(list) {
    return [...list].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  function getLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function setLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function initDemoData() {
    if (localStorage.getItem(STORAGE_KEYS.initialized)) return;
    const normalizedPosts = (seedData.posts || []).map(normalizePost);
    setLocal(STORAGE_KEYS.posts, normalizedPosts);
    setLocal(STORAGE_KEYS.comments, {});
    localStorage.setItem(STORAGE_KEYS.initialized, '1');
  }

  function getCloudbaseGlobal() {
    return window.cloudbase || window.tcb || null;
  }

  async function requestJson(url, options) {
    const response = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    }, options || {}));

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || `Request failed: HTTP ${response.status}`);
    }

    return payload;
  }

  async function ensureCloudbaseLogin(app) {
    if (!app) throw new Error('CloudBase app init failed.');

    if (typeof app.auth === 'function') {
      const auth = app.auth({ persistence: 'local' });
      let hasLogin = false;

      try {
        if (typeof auth.hasLoginState === 'function') {
          hasLogin = await auth.hasLoginState();
        }
      } catch (error) {
        hasLogin = false;
      }

      if (!hasLogin) {
        if (typeof auth.signInAnonymously === 'function') {
          await auth.signInAnonymously();
        } else if (typeof auth.anonymousAuthProvider === 'function') {
          await auth.anonymousAuthProvider().signIn();
        } else {
          throw new Error('CloudBase anonymous auth is unavailable.');
        }
      }

      return auth;
    }

    if (app.auth && typeof app.auth.signInAnonymously === 'function') {
      let hasLogin = false;

      try {
        if (typeof app.auth.getLoginState === 'function') {
          const loginState = await app.auth.getLoginState();
          hasLogin = !!loginState;
        }
      } catch (error) {
        hasLogin = false;
      }

      if (!hasLogin) {
        await app.auth.signInAnonymously();
      }

      return app.auth;
    }

    throw new Error('CloudBase auth init failed.');
  }

  async function getCloudbaseApp() {
    if (cloudbaseAppPromise) return cloudbaseAppPromise;

    cloudbaseAppPromise = (async () => {
      const sdk = getCloudbaseGlobal();
      const cb = config.cloudbase || {};

      if (!sdk || typeof sdk.init !== 'function') {
        throw new Error('CloudBase SDK is missing.');
      }
      if (!cb.enabled || !cb.env || String(cb.env).includes('replace-with-your-env-id')) {
        throw new Error('CloudBase config is incomplete.');
      }

      const app = sdk.init({
        env: cb.env,
        region: cb.region || 'ap-shanghai'
      });

      await ensureCloudbaseLogin(app);
      return app;
    })();

    try {
      return await cloudbaseAppPromise;
    } catch (error) {
      cloudbaseAppPromise = null;
      throw error;
    }
  }

  async function ensureCloudbase() {
    const app = await getCloudbaseApp();
    if (typeof app.database !== 'function') {
      throw new Error('CloudBase database is unavailable.');
    }
    return app.database();
  }

  function getOpenApiUrl(limit = 100, offset = 0) {
    const cms = config.cmsOpenApi || {};
    if (!cms.enabled) throw new Error('CMS Open API is not enabled.');

    if (cms.openApiUrl) {
      const url = new URL(cms.openApiUrl);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));
      return url.toString();
    }

    const required = [cms.env, cms.region, cms.kitId, cms.projectId, cms.collectionId];
    if (required.some((item) => !item || String(item).includes('replace-with-'))) {
      throw new Error('CMS Open API config is incomplete.');
    }

    return `https://${cms.env}.${cms.region}.kits.tcloudbase.com/cms/${cms.kitId}/v1/open-api/projects/${cms.projectId}/collections/${cms.collectionId}/contents?limit=${limit}&offset=${offset}`;
  }

  async function fetchPosts(options) {
    const opts = Object.assign({ publishedOnly: true }, options || {});

    if (config.mode === 'node-api') {
      const query = `publishedOnly=${opts.publishedOnly ? 'true' : 'false'}`;
      const payload = await requestJson(`${API_BASE}/posts?${query}`, { method: 'GET' });
      return sortPosts((payload.posts || []).map(normalizePost));
    }

    if (config.mode === 'cloudbase-openapi') {
      const response = await fetch(getOpenApiUrl(100, 0), { cache: 'no-store' });
      if (!response.ok) throw new Error(`CMS Open API request failed: HTTP ${response.status}`);

      const json = await response.json();
      if (json.code && json.code !== 'NORMAL') {
        throw new Error(`CMS Open API returned ${json.code}`);
      }

      const items = (((json || {}).result || {}).data) || [];
      const posts = items.map(normalizeCmsApiPost);
      const filtered = opts.publishedOnly ? posts.filter((post) => post.published !== false && post.status !== 'draft') : posts;
      return sortPosts(filtered);
    }

    if (config.mode === 'cloudbase-db') {
      const db = await ensureCloudbase();
      const collection = db.collection((config.cloudbase || {}).postsCollection || 'posts');
      let query = collection;
      if (opts.publishedOnly) query = query.where({ published: true });
      const response = await query.orderBy('publishedAt', 'desc').limit(100).get();
      return sortPosts((response.data || []).map(normalizePost));
    }

    initDemoData();
    const posts = getLocal(STORAGE_KEYS.posts, []).map(normalizePost);
    const filtered = opts.publishedOnly ? posts.filter((post) => post.published !== false && post.status !== 'draft') : posts;
    return sortPosts(filtered);
  }

  async function fetchPostBySlug(slug, options) {
    const posts = await fetchPosts({ publishedOnly: options && options.includeDraft ? false : true });
    return posts.find((post) => post.slug === slug) || null;
  }

  async function savePost(postInput) {
    if (config.mode === 'node-api') {
      const payload = await requestJson(`${API_BASE}/posts`, {
        method: 'POST',
        body: JSON.stringify(postInput)
      });
      return normalizePost(payload.post || postInput);
    }

    if (config.mode === 'cloudbase-openapi') {
      throw new Error('Use the official CloudBase CMS admin to publish in Open API mode.');
    }

    if (config.mode === 'cloudbase-db') {
      const db = await ensureCloudbase();
      const collection = db.collection((config.cloudbase || {}).postsCollection || 'posts');
      const post = normalizePost({
        ...postInput,
        slug: postInput.slug || slugify(postInput.title),
        updatedAt: new Date().toISOString(),
        publishedAt: postInput.publishedAt || new Date().toISOString()
      });
      const existing = await collection.where({ slug: post.slug }).limit(1).get();

      if (existing.data && existing.data[0] && existing.data[0]._id) {
        await collection.doc(existing.data[0]._id).update(post);
      } else {
        await collection.add(post);
      }

      return post;
    }

    initDemoData();
    const posts = getLocal(STORAGE_KEYS.posts, []).map(normalizePost);
    const slug = postInput.slug || slugify(postInput.title);
    const post = normalizePost({
      ...postInput,
      slug,
      id: postInput.id || slug,
      updatedAt: new Date().toISOString(),
      publishedAt: postInput.publishedAt || new Date().toISOString(),
      published: postInput.status !== 'draft'
    });
    const index = posts.findIndex((item) => item.slug === slug);
    if (index >= 0) posts[index] = post;
    else posts.push(post);
    setLocal(STORAGE_KEYS.posts, posts);
    return post;
  }

  async function deletePost(slug) {
    if (config.mode === 'node-api') {
      await requestJson(`${API_BASE}/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      return true;
    }

    if (config.mode === 'cloudbase-openapi') {
      throw new Error('Delete content in the official CloudBase CMS admin in Open API mode.');
    }

    if (config.mode === 'cloudbase-db') {
      const db = await ensureCloudbase();
      const collection = db.collection((config.cloudbase || {}).postsCollection || 'posts');
      const existing = await collection.where({ slug }).limit(1).get();
      if (existing.data && existing.data[0] && existing.data[0]._id) {
        await collection.doc(existing.data[0]._id).remove();
      }
      return true;
    }

    initDemoData();
    const posts = getLocal(STORAGE_KEYS.posts, []).filter((item) => item.slug !== slug);
    setLocal(STORAGE_KEYS.posts, posts);
    const commentsMap = getLocal(STORAGE_KEYS.comments, {});
    delete commentsMap[slug];
    setLocal(STORAGE_KEYS.comments, commentsMap);
    return true;
  }

  function canUseCloudComments() {
    const cb = config.cloudbase || {};
    return !!(cb.enabled && cb.commentsEnabled);
  }

  async function fetchComments(postSlug) {
    if (config.mode === 'node-api') {
      const payload = await requestJson(`${API_BASE}/comments?postSlug=${encodeURIComponent(postSlug)}`, { method: 'GET' });
      return payload.comments || [];
    }

    if (canUseCloudComments()) {
      const db = await ensureCloudbase();
      const response = await db.collection((config.cloudbase || {}).commentsCollection || 'comments')
        .where({ postSlug, approved: true })
        .orderBy('createdAt', 'desc')
        .get();
      return response.data || [];
    }

    initDemoData();
    const map = getLocal(STORAGE_KEYS.comments, {});
    return Array.isArray(map[postSlug]) ? [...map[postSlug]].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
  }

  async function submitComment(input) {
    const payload = {
      postSlug: input.postSlug,
      name: input.name || 'Anonymous',
      contact: input.contact || '',
      content: input.content || '',
      createdAt: input.createdAt || new Date().toISOString(),
      approved: input.approved !== false
    };

    if (config.mode === 'node-api') {
      const response = await requestJson(`${API_BASE}/comments`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return response.comment || payload;
    }

    if (canUseCloudComments()) {
      const db = await ensureCloudbase();
      await db.collection((config.cloudbase || {}).commentsCollection || 'comments').add(payload);
      return payload;
    }

    initDemoData();
    const map = getLocal(STORAGE_KEYS.comments, {});
    const list = Array.isArray(map[payload.postSlug]) ? map[payload.postSlug] : [];
    list.push(payload);
    map[payload.postSlug] = list;
    setLocal(STORAGE_KEYS.comments, map);
    return payload;
  }

  async function getAdminStats() {
    const posts = await fetchPosts({ publishedOnly: false });
    const published = posts.filter((post) => post.status !== 'draft').length;
    const drafts = posts.filter((post) => post.status === 'draft').length;
    let comments = 0;

    if (canUseCloudComments()) {
      const db = await ensureCloudbase();
      const response = await db.collection((config.cloudbase || {}).commentsCollection || 'comments').get();
      comments = (response.data || []).length;
    } else {
      const map = getLocal(STORAGE_KEYS.comments, {});
      comments = Object.values(map).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
    }

    return {
      total: posts.length,
      published,
      drafts,
      comments
    };
  }

  function getAdminUrl() {
    return (config.cmsOpenApi && config.cmsOpenApi.adminUrl) || 'https://tcb.cloud.tencent.com/';
  }

  async function exportPostsBackup() {
    if (config.mode === 'node-api') {
      return requestJson(`${API_BASE}/backups/posts`, { method: 'GET' });
    }

    const posts = await fetchPosts({ publishedOnly: false });
    return {
      generatedAt: new Date().toISOString(),
      posts,
      backups: []
    };
  }

  window.LEO_CMS_SERVICE = {
    config,
    fetchPosts,
    fetchPostBySlug,
    savePost,
    deletePost,
    fetchComments,
    submitComment,
    getAdminStats,
    slugify,
    initDemoData,
    getAdminUrl,
    exportPostsBackup,
    normalizePost,
    normalizeCmsApiPost
  };
})();
