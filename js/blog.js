(function () {
  const cms = window.LEO_CMS_SERVICE;
  if (!cms) return;

  const state = {
    posts: [],
    commentCache: {},
    query: '',
    tag: '',
    selectedDate: '',
    expandedSlug: '',
    commentSlug: '',
    monthCursor: new Date(),
    isLoading: true,
    lastSignature: '',
    refreshTimer: 0
  };

  const el = {
    searchInput: document.getElementById('searchInput'),
    quickTags: document.getElementById('quickTags'),
    clearFiltersBtn: document.getElementById('clearFiltersBtn'),
    calendarMonth: document.getElementById('calendarMonth'),
    calendarGrid: document.getElementById('calendarGrid'),
    prevMonthBtn: document.getElementById('prevMonthBtn'),
    nextMonthBtn: document.getElementById('nextMonthBtn'),
    calendarFilterText: document.getElementById('calendarFilterText'),
    timelineList: document.getElementById('timelineList'),
    resultStats: document.getElementById('resultStats'),
    postList: document.getElementById('postList'),
    blogRightScroll: document.getElementById('blogRightScroll'),
    blogSidebarScroll: document.getElementById('blogSidebarScroll'),
    resultPanel: document.getElementById('resultPanel'),
    calendarPanel: document.getElementById('calendarPanel'),
    timelinePanel: document.getElementById('timelinePanel'),
    searchPanel: document.getElementById('searchPanel'),
    sortByTimeBtn: document.getElementById('sortByTimeBtn'),
    keywordSearchBtn: document.getElementById('keywordSearchBtn'),
    calendarArchiveBtn: document.getElementById('calendarArchiveBtn'),
    commentModeBtn: document.getElementById('commentModeBtn'),
    adminEntryBtn: document.getElementById('adminEntryBtn')
  };

  function formatDateTime(value) {
    const date = new Date(value);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function formatMonth(date) {
    return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
  }

  function dateOnly(value) {
    return formatDateTime(value).slice(0, 10);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function smoothScrollWithin(container, target, extraOffset = 0) {
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextTop = container.scrollTop + (targetRect.top - containerRect.top) + extraOffset;
    container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
  }

  function smoothScrollAfterRender(container, targetId, extraOffset = 0) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(targetId);
        if (target) smoothScrollWithin(container, target, extraOffset);
      });
    });
  }

  function flashPanel(panel) {
    if (!panel) return;
    panel.classList.remove('panel-flash');
    void panel.offsetWidth;
    panel.classList.add('panel-flash');
    window.setTimeout(() => panel.classList.remove('panel-flash'), 700);
  }

  function allTags() {
    return Array.from(new Set(state.posts.flatMap((post) => post.tags || [])));
  }

  function postsSignature(posts) {
    return (posts || [])
      .map((post) => [post.slug, post.updatedAt || '', post.publishedAt || '', post.status || ''].join('|'))
      .join('||');
  }

  function getFilteredPosts() {
    const q = state.query.trim().toLowerCase();
    return state.posts.filter((post) => {
      const haystack = [post.title, post.excerpt, post.category, (post.tags || []).join(' '), (post.content || []).join(' ')].join(' ').toLowerCase();
      const matchesQuery = !q || haystack.includes(q);
      const matchesTag = !state.tag || (post.tags || []).includes(state.tag);
      const matchesDate = !state.selectedDate || dateOnly(post.publishedAt) === state.selectedDate;
      return matchesQuery && matchesTag && matchesDate;
    });
  }

  function ensureExpandedPost(filtered) {
    if (!filtered.length) {
      state.expandedSlug = '';
      state.commentSlug = '';
      return;
    }
    if (!filtered.some((post) => post.slug === state.expandedSlug)) {
      state.expandedSlug = '';
    }
    if (state.commentSlug && !filtered.some((post) => post.slug === state.commentSlug)) {
      state.commentSlug = '';
    }
  }

  function syncHeroButtons(filtered) {
    if (el.sortByTimeBtn) el.sortByTimeBtn.classList.toggle('is-active', !state.query && !state.tag && !state.selectedDate);
    if (el.keywordSearchBtn) el.keywordSearchBtn.classList.toggle('is-active', !!state.query);
    if (el.calendarArchiveBtn) el.calendarArchiveBtn.classList.toggle('is-active', !!state.selectedDate);
    if (el.commentModeBtn) el.commentModeBtn.classList.toggle('is-active', !!state.commentSlug && filtered.some((post) => post.slug === state.commentSlug));
  }

  async function ensureCommentCache(slugs) {
    const need = slugs.filter((slug) => !state.commentCache[slug]);
    if (!need.length) return;
    await Promise.all(need.map(async (slug) => {
      state.commentCache[slug] = await cms.fetchComments(slug);
    }));
  }

  function renderTags() {
    const tags = allTags();
    el.quickTags.innerHTML = tags.map((tag) => `
      <button type="button" class="quick-tag ${state.tag === tag ? 'is-active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>
    `).join('');

    el.quickTags.querySelectorAll('.quick-tag').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tag = state.tag === btn.dataset.tag ? '' : btn.dataset.tag;
        rerender().then(() => smoothScrollWithin(el.blogRightScroll, el.resultPanel, -12));
      });
    });
  }

  function renderTimeline() {
    el.timelineList.innerHTML = state.posts.slice(0, 8).map((post) => `
      <button type="button" class="timeline-item" data-slug="${post.slug}">
        <div class="timeline-date">${formatDateTime(post.publishedAt)}</div>
        <div class="timeline-title">${escapeHtml(post.title)}</div>
        <div class="timeline-tag">${escapeHtml(post.category)}</div>
      </button>
    `).join('');

    el.timelineList.querySelectorAll('.timeline-item').forEach((item) => {
      item.addEventListener('click', () => {
        const post = state.posts.find((p) => p.slug === item.dataset.slug);
        if (!post) return;
        state.query = '';
        state.tag = '';
        state.selectedDate = '';
        state.monthCursor = new Date(post.publishedAt);
        state.expandedSlug = post.slug;
        state.commentSlug = '';
        el.searchInput.value = '';
        rerender().then(() => {
          const card = document.getElementById(`post-${post.slug}`);
          if (card) smoothScrollWithin(el.blogRightScroll, card, -12);
        });
      });
    });
  }

  function renderCalendar() {
    const year = state.monthCursor.getFullYear();
    const month = state.monthCursor.getMonth();
    el.calendarMonth.textContent = formatMonth(state.monthCursor);

    const firstDay = new Date(year, month, 1);
    const totalDays = new Date(year, month + 1, 0).getDate();
    const startIndex = (firstDay.getDay() + 6) % 7;
    const datesWithPosts = new Set(
      state.posts
        .filter((post) => {
          const d = new Date(post.publishedAt);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .map((post) => dateOnly(post.publishedAt))
    );

    let html = '';
    for (let i = 0; i < startIndex; i += 1) html += '<div class="calendar-day is-empty"></div>';
    for (let day = 1; day <= totalDays; day += 1) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const hasPost = datesWithPosts.has(dateStr);
      const selected = state.selectedDate === dateStr;
      html += `<button type="button" class="calendar-day ${hasPost ? 'has-post' : ''} ${selected ? 'is-selected' : ''}" ${hasPost ? `data-date="${dateStr}"` : 'disabled'}>${day}</button>`;
    }

    el.calendarGrid.innerHTML = html;
    el.calendarGrid.querySelectorAll('.calendar-day.has-post').forEach((dayBtn) => {
      dayBtn.addEventListener('click', () => {
        state.selectedDate = state.selectedDate === dayBtn.dataset.date ? '' : dayBtn.dataset.date;
        rerender().then(() => smoothScrollWithin(el.blogRightScroll, el.resultPanel, -12));
      });
    });

    el.calendarFilterText.textContent = state.selectedDate ? `已按 ${state.selectedDate} 过滤` : '当前未按日期过滤';
  }

  function commentBlock(post) {
    const comments = state.commentCache[post.slug] || [];
    return `
      <section class="post-inline-comments" id="comment-block-${post.slug}">
        <div class="panel-head inline-comments-head">
          <span class="panel-badge">C</span>
          <div>
            <h2>文章评论</h2>
          </div>
        </div>
        <form class="comment-form inline-comment-form" data-slug="${post.slug}">
          <div class="comment-grid">
            <input name="name" type="text" placeholder="你的名字" maxlength="20" />
            <input name="contact" type="text" placeholder="邮箱或昵称（可选）" maxlength="40" />
          </div>
          <textarea name="content" rows="4" placeholder="写下你的评论"></textarea>
          <div class="comment-actions">
            <div class="comment-tip">当前评论文章：${escapeHtml(post.title)}</div>
            <button type="submit" class="solid-btn">发布评论</button>
          </div>
        </form>
        <div class="comment-list">
          ${comments.length ? comments.map((comment) => `
            <article class="comment-item">
              <div class="comment-item-head">
                <div>
                  <span class="comment-item-name">${escapeHtml(comment.name)}</span>
                  ${comment.contact ? `<span class="comment-item-contact"> / ${escapeHtml(comment.contact)}</span>` : ''}
                </div>
                <div class="comment-item-time">${formatDateTime(comment.createdAt)}</div>
              </div>
              <div class="comment-item-body">${escapeHtml(comment.content)}</div>
            </article>
          `).join('') : '<div class="empty-state">这篇文章还没有评论。你可以先写第一条。</div>'}
        </div>
      </section>
    `;
  }

  function postBody(post, commentsOpen) {
    return `
      <div class="post-card-body">
        ${(post.content || []).map((paragraph) => `<p class="detail-paragraph">${escapeHtml(paragraph)}</p>`).join('')}
        ${commentsOpen ? commentBlock(post) : ''}
      </div>
    `;
  }

  function openPost(slug) {
    state.expandedSlug = slug;
    rerender().then(() => {
      const card = document.getElementById(`post-${slug}`);
      if (card) smoothScrollWithin(el.blogRightScroll, card, -12);
    });
  }

  function togglePost(slug) {
    if (state.expandedSlug === slug) {
      state.expandedSlug = '';
      if (state.commentSlug === slug) state.commentSlug = '';
      rerender();
      return;
    }
    openPost(slug);
  }

  function renderPostList(filtered) {
    el.resultStats.textContent = `${filtered.length} 篇结果`;

    if (!filtered.length) {
      el.postList.innerHTML = '<div class="empty-state">没有找到匹配内容。可以换关键词，或者清空筛选。</div>';
      return;
    }

    el.postList.innerHTML = filtered.map((post) => {
      const isExpanded = post.slug === state.expandedSlug;
      const commentsOpen = post.slug === state.commentSlug;
      const commentsCount = (state.commentCache[post.slug] || []).length;
      return `
        <article class="post-card ${isExpanded ? 'is-expanded' : ''}" id="post-${post.slug}" data-slug="${post.slug}">
          <div class="post-card-head">
            <div class="post-card-head-left">
              <h3 class="post-card-title">${escapeHtml(post.title)}</h3>
              <div class="post-card-time">${formatDateTime(post.publishedAt)}</div>
            </div>
            <div class="post-card-action-buttons">
              <button type="button" class="detail-comment-btn post-read-btn ${isExpanded ? 'is-open' : ''}" data-slug="${post.slug}">${isExpanded ? '收起文章' : '阅读全文'}</button>
              <button type="button" class="detail-inline-comment-btn post-comment-btn" data-slug="${post.slug}">${commentsOpen ? `收起评论（${commentsCount}）` : `评论（${commentsCount}）`}</button>
            </div>
          </div>
          <div class="post-card-excerpt">${escapeHtml(post.excerpt)}</div>
          <div class="post-card-footer">
            <div class="detail-tag-row">
              <span class="post-tag">${escapeHtml(post.category)}</span>
              ${(post.tags || []).map((tag) => `<span class="post-tag"># ${escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>
          ${isExpanded ? postBody(post, commentsOpen) : ''}
        </article>
      `;
    }).join('');

    el.postList.querySelectorAll('.post-card').forEach((card) => {
      card.addEventListener('click', (event) => {
        const interactive = event.target.closest('button, a, input, textarea, select, label, form');
        if (interactive) return;
        const slug = card.dataset.slug;
        if (slug) togglePost(slug);
      });
    });

    el.postList.querySelectorAll('.post-read-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const slug = btn.dataset.slug;
        if (slug) togglePost(slug);
      });
    });

    el.postList.querySelectorAll('.post-comment-btn').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const slug = btn.dataset.slug;
        state.expandedSlug = slug;
        state.commentSlug = state.commentSlug === slug ? '' : slug;
        if (state.commentSlug) await ensureCommentCache([slug]);
        await rerender();
        smoothScrollAfterRender(el.blogRightScroll, state.commentSlug === slug ? `comment-block-${slug}` : `post-${slug}`, -16);
      });
    });

    el.postList.querySelectorAll('.inline-comment-form').forEach((form) => {
      form.addEventListener('click', (event) => event.stopPropagation());
      form.addEventListener('submit', submitComment);
    });
  }

  async function submitComment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const slug = form.dataset.slug;
    if (!slug) return;
    const name = form.elements.name.value.trim();
    const contact = form.elements.contact.value.trim();
    const content = form.elements.content.value.trim();

    if (!name || !content) {
      alert('名字和评论内容不能为空。');
      return;
    }

    await cms.submitComment({ postSlug: slug, name, contact, content, approved: true });
    state.commentCache[slug] = await cms.fetchComments(slug);
    state.expandedSlug = slug;
    state.commentSlug = slug;
    await rerender();
    smoothScrollAfterRender(el.blogRightScroll, `comment-block-${slug}`, -16);
  }

  function bindHeroActionButtons() {
    el.sortByTimeBtn.addEventListener('click', async () => {
      state.query = '';
      state.tag = '';
      state.selectedDate = '';
      state.commentSlug = '';
      state.expandedSlug = '';
      el.searchInput.value = '';
      await rerender();
      flashPanel(el.resultPanel);
      smoothScrollWithin(el.blogRightScroll, el.resultPanel, -12);
    });

    el.keywordSearchBtn.addEventListener('click', () => {
      smoothScrollWithin(el.blogSidebarScroll, el.searchPanel, -8);
      flashPanel(el.searchPanel);
      el.searchInput.focus();
    });

    el.calendarArchiveBtn.addEventListener('click', () => {
      smoothScrollWithin(el.blogSidebarScroll, el.calendarPanel, -8);
      flashPanel(el.calendarPanel);
    });

    el.commentModeBtn.addEventListener('click', async () => {
      const filtered = getFilteredPosts();
      if (!filtered.length) return;
      state.expandedSlug = filtered[0].slug;
      state.commentSlug = filtered[0].slug;
      await ensureCommentCache([filtered[0].slug]);
      await rerender();
      smoothScrollAfterRender(el.blogRightScroll, `comment-block-${filtered[0].slug}`, -16);
    });

    if (el.adminEntryBtn) {
      if (cms.config && cms.config.exposeAdminEntry === false) {
        el.adminEntryBtn.style.display = 'none';
      } else {
        el.adminEntryBtn.addEventListener('click', () => {
          window.location.href = './admin.html';
        });
      }
    }
  }

  async function refreshPostsSilently() {
    const latestPosts = await cms.fetchPosts({ publishedOnly: true });
    const latestSignature = postsSignature(latestPosts);
    if (latestSignature === state.lastSignature) return;

    state.posts = latestPosts;
    state.lastSignature = latestSignature;

    if (!state.posts.some((post) => post.slug === state.expandedSlug)) {
      state.expandedSlug = '';
    }
    if (state.commentSlug && !state.posts.some((post) => post.slug === state.commentSlug)) {
      state.commentSlug = '';
    }
    if (!state.selectedDate) {
      state.monthCursor = state.posts[0] ? new Date(state.posts[0].publishedAt) : new Date();
    }

    await rerender();
  }

  function startAutoRefresh() {
    const intervalMs = Number((cms.config && cms.config.refreshIntervalMs) || 15000);
    if (!intervalMs || intervalMs < 5000) return;
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);

    state.refreshTimer = window.setInterval(() => {
      refreshPostsSilently().catch(() => {});
    }, intervalMs);
  }

  async function rerender() {
    renderTags();
    renderTimeline();
    renderCalendar();
    const filtered = getFilteredPosts();
    ensureExpandedPost(filtered);
    const important = Array.from(new Set(filtered.slice(0, 12).map((p) => p.slug).concat(state.commentSlug ? [state.commentSlug] : [])));
    await ensureCommentCache(important);
    renderPostList(filtered);
    syncHeroButtons(filtered);
  }

  async function boot() {
    try {
      cms.initDemoData && cms.initDemoData();
      state.posts = await cms.fetchPosts({ publishedOnly: true });
      state.lastSignature = postsSignature(state.posts);
      state.expandedSlug = '';
      state.monthCursor = state.posts[0] ? new Date(state.posts[0].publishedAt) : new Date();

      const hashSlug = (window.location.hash || '').replace('#post-', '').trim();
      if (hashSlug && state.posts.some((p) => p.slug === hashSlug)) {
        state.expandedSlug = hashSlug;
      }

      el.searchInput.addEventListener('input', (event) => {
        state.query = event.target.value || '';
        rerender().then(() => smoothScrollWithin(el.blogRightScroll, el.resultPanel, -12));
      });

      el.clearFiltersBtn.addEventListener('click', async () => {
        state.query = '';
        state.tag = '';
        state.selectedDate = '';
        state.commentSlug = '';
        state.expandedSlug = '';
        el.searchInput.value = '';
        await rerender();
      });

      el.prevMonthBtn.addEventListener('click', () => {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
        renderCalendar();
      });

      el.nextMonthBtn.addEventListener('click', () => {
        state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
        renderCalendar();
      });

      bindHeroActionButtons();
      await rerender();
      startAutoRefresh();
      if (hashSlug) smoothScrollAfterRender(el.blogRightScroll, `post-${hashSlug}`, -12);
    } catch (err) {
      el.postList.innerHTML = `<div class="empty-state">博客数据加载失败：${escapeHtml(err.message || err)}</div>`;
    }
  }

  boot();
})();
