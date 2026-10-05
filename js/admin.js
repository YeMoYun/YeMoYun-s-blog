(function () {
  const cms = window.LEO_CMS_SERVICE;
  if (!cms) return;

  const el = {
    refreshBtn: document.getElementById('refreshAdminBtn'),
    modeText: document.getElementById('adminModeText'),
    stats: document.getElementById('adminStats'),
    postList: document.getElementById('adminPostList'),
    form: document.getElementById('postForm'),
    newBtn: document.getElementById('newPostBtn'),
    previewBtn: document.getElementById('previewPostBtn'),
    deleteBtn: document.getElementById('deletePostBtn'),
    saveBtn: document.getElementById('savePostBtn'),
    openCmsAdminBtn: document.getElementById('openCmsAdminBtn'),
    openBlogFrontBtn: document.getElementById('openBlogFrontBtn'),
    exportPostsBackupBtn: document.getElementById('exportPostsBackupBtn'),
    editorModeDesc: document.getElementById('editorModeDesc'),
    adminNoteBlock: document.getElementById('adminNoteBlock')
  };

  const state = {
    posts: [],
    activeSlug: ''
  };
  const ADMIN_SESSION_KEY = 'leo_admin_unlocked_v1';

  function requireAdminAccess() {
    const password = cms.config && cms.config.adminPassword;
    if (!password || cms.config.mode === 'cloudbase-openapi') return true;
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') return true;

    const answer = window.prompt('Admin password');
    if (answer === password) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      return true;
    }

    window.location.replace('./blog.html');
    return false;
  }

  function fmt(value) {
    const d = new Date(value || new Date());
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isOpenApiMode() {
    return cms.config.mode === 'cloudbase-openapi';
  }

  function fillForm(post) {
    const p = post || {
      id: '',
      title: '',
      slug: '',
      category: '',
      tags: [],
      excerpt: '',
      content: [],
      status: 'draft',
      publishedAt: new Date().toISOString()
    };
    el.form.elements.id.value = p.id || '';
    el.form.elements.title.value = p.title || '';
    el.form.elements.slug.value = p.slug || '';
    el.form.elements.category.value = p.category || '';
    el.form.elements.tags.value = Array.isArray(p.tags) ? p.tags.join(',') : '';
    el.form.elements.excerpt.value = p.excerpt || '';
    el.form.elements.content.value = Array.isArray(p.content) ? p.content.join('\n\n') : String(p.content || '');
    el.form.elements.status.value = p.status || 'draft';
    el.form.elements.publishedAt.value = fmt(p.publishedAt || new Date());
  }

  function setEditorDisabled(disabled) {
    Array.from(el.form.elements).forEach((node) => {
      if (!node || !node.tagName) return;
      if (node.type === 'hidden') return;
      node.disabled = disabled;
    });
    el.saveBtn.disabled = disabled;
    el.newBtn.disabled = disabled;
    el.deleteBtn.disabled = disabled;
  }

  function renderPostList() {
    el.postList.innerHTML = state.posts.map((post) => `
      <button type="button" class="post-admin-item ${state.activeSlug === post.slug ? 'is-active' : ''}" data-slug="${escapeHtml(post.slug)}">
        <div class="post-admin-item-title">${escapeHtml(post.title)}</div>
        <div class="post-admin-item-meta">${escapeHtml(post.category)} / ${post.status === 'draft' ? '草稿' : '已发布'}</div>
      </button>
    `).join('');

    el.postList.querySelectorAll('.post-admin-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const post = state.posts.find((item) => item.slug === btn.dataset.slug);
        if (!post) return;
        state.activeSlug = post.slug;
        fillForm(post);
        renderPostList();
      });
    });
  }

  async function renderStats() {
    const stats = await cms.getAdminStats();
    el.stats.innerHTML = [
      ['总文章', stats.total],
      ['已发布', stats.published],
      ['草稿', stats.drafts],
      ['评论数', stats.comments]
    ].map(([label, value]) => `
      <div class="admin-stat"><strong>${value}</strong><span>${label}</span></div>
    `).join('');
  }

  function syncModeUi() {
    if (cms.config.mode === 'cloudbase-openapi') {
      el.modeText.textContent = '当前模式：CloudBase CMS 正式模式（文章通过 Open API 公开读取）';
      el.editorModeDesc.textContent = '正式模式下，本页只做内容预览与跳转。真正发文请进入 CloudBase CMS 管理端。';
      el.adminNoteBlock.textContent = '你现在应该在 CloudBase CMS 官方后台里发文。前台 blog.html 每次打开都会重新请求 Open API，所以发文后别人刷新页面就能看到更新。注意官方文档说明 Open API 约有一分钟缓存。';
      setEditorDisabled(true);
    } else if (cms.config.mode === 'node-api') {
      el.modeText.textContent = '当前模式：自托管 API（当前公网版本）';
      el.editorModeDesc.textContent = '文章会直接写入当前服务器的数据文件，保存后前台会自动轮询刷新。';
      el.adminNoteBlock.textContent = '这是当前最稳定的上线链路：后台保存到同源 API，前台博客自动读取最新文章。只要这台机器和公网隧道在线，访客就能看到更新。';
      setEditorDisabled(false);
    } else if (cms.config.mode === 'cloudbase-db') {
      el.modeText.textContent = '当前模式：CloudBase Database（线上测试模式）';
      el.editorModeDesc.textContent = '当前直接读写云开发数据库。适合你自己测试，不建议把 admin.html 公开暴露给所有人。';
      el.adminNoteBlock.textContent = '如果你追求真正长期方案，应切换到 cloudbase-openapi，并改为在 CloudBase CMS 官方管理端发文。';
      setEditorDisabled(false);
    } else {
      el.modeText.textContent = '当前模式：Demo CMS（本地演示）';
      el.editorModeDesc.textContent = '默认保存为草稿。发布后前台博客会按时间倒序显示。';
      el.adminNoteBlock.textContent = '当前还是浏览器本地演示。要让别人看到最新文章，必须切到 CloudBase 正式模式。';
      setEditorDisabled(false);
    }
  }

  async function reload() {
    state.posts = await cms.fetchPosts({ publishedOnly: false });
    state.posts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    if (!state.activeSlug && state.posts[0]) state.activeSlug = state.posts[0].slug;
    const active = state.posts.find((item) => item.slug === state.activeSlug) || null;
    renderPostList();
    fillForm(active);
    renderStats();
    syncModeUi();
  }

  async function downloadPostsBackup() {
    const payload = await cms.exportPostsBackup();
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\..+$/, '');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `moyun-posts-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  el.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isOpenApiMode()) {
      alert('当前是 CloudBase CMS 正式模式。请点击“打开 CMS 管理端”去发文。');
      return;
    }
    const data = {
      id: el.form.elements.id.value.trim(),
      title: el.form.elements.title.value.trim(),
      slug: el.form.elements.slug.value.trim() || cms.slugify(el.form.elements.title.value.trim()),
      category: el.form.elements.category.value.trim() || '未分类',
      tags: el.form.elements.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
      excerpt: el.form.elements.excerpt.value.trim(),
      content: el.form.elements.content.value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean),
      status: el.form.elements.status.value,
      published: el.form.elements.status.value !== 'draft',
      publishedAt: new Date(el.form.elements.publishedAt.value || new Date()).toISOString()
    };
    if (!data.title) {
      alert('标题不能为空。');
      return;
    }
    await cms.savePost(data);
    state.activeSlug = data.slug;
    await reload();
    alert('文章已保存。');
  });

  el.newBtn.addEventListener('click', () => {
    if (isOpenApiMode()) return;
    state.activeSlug = '';
    fillForm(null);
  });

  el.previewBtn.addEventListener('click', () => {
    const slug = el.form.elements.slug.value.trim() || cms.slugify(el.form.elements.title.value.trim());
    if (!slug) {
      alert('请先填写标题。');
      return;
    }
    window.open(`./blog.html#post-${slug}`, '_blank');
  });

  el.deleteBtn.addEventListener('click', async () => {
    if (isOpenApiMode()) {
      alert('正式模式删文请在 CloudBase CMS 管理端完成。');
      return;
    }
    const slug = el.form.elements.slug.value.trim();
    if (!slug) return;
    const ok = confirm('确定删除这篇文章？');
    if (!ok) return;
    await cms.deletePost(slug);
    state.activeSlug = '';
    await reload();
  });

  el.refreshBtn.addEventListener('click', reload);
  el.openCmsAdminBtn.addEventListener('click', () => window.open(cms.getAdminUrl(), '_blank'));
  el.openBlogFrontBtn.addEventListener('click', () => window.open('./blog.html', '_blank'));
  el.exportPostsBackupBtn.addEventListener('click', () => {
    downloadPostsBackup().catch((err) => alert(`下载失败：${err.message || err}`));
  });

  if (!requireAdminAccess()) return;

  cms.initDemoData && cms.initDemoData();
  reload().catch((err) => {
    el.postList.innerHTML = `<div class="empty-state">后台加载失败：${escapeHtml(err.message || err)}</div>`;
    syncModeUi();
  });
})();
