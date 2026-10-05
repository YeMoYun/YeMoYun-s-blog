function getCmsConfig() {
  const config = window.CMS_CONFIG || window.LEO_CMS_CONFIG;

  if (!config) {
    throw new Error('CMS 配置未加载：请先加载 js/cms-config.js');
  }

  if (!config.cloudbase || !config.cloudbase.enabled) {
    throw new Error('CloudBase 配置未开启');
  }

  if (!config.cloudbase.env) {
    throw new Error('CloudBase 环境 ID 未配置');
  }

  return config;
}

function getCloudbaseSdk() {
  return window.cloudbase || window.tcb || null;
}

async function ensureCloudbaseLogin(app) {
  if (!app) {
    throw new Error('CloudBase app 初始化失败');
  }

  // 兼容旧版 SDK：app.auth({...})
  if (typeof app.auth === 'function') {
    const auth = app.auth({ persistence: 'local' });

    let hasLogin = false;
    try {
      if (typeof auth.hasLoginState === 'function') {
        hasLogin = await auth.hasLoginState();
      }
    } catch (e) {
      hasLogin = false;
    }

    if (!hasLogin) {
      if (typeof auth.signInAnonymously === 'function') {
        await auth.signInAnonymously();
      } else if (typeof auth.anonymousAuthProvider === 'function') {
        await auth.anonymousAuthProvider().signIn();
      } else {
        throw new Error('当前 SDK 不支持匿名登录');
      }
    }

    return auth;
  }

  // 兼容新版 full sdk：app.auth.signInAnonymously()
  if (app.auth && typeof app.auth.signInAnonymously === 'function') {
    let hasLogin = false;
    try {
      if (typeof app.auth.getLoginState === 'function') {
        const state = await app.auth.getLoginState();
        hasLogin = !!state;
      }
    } catch (e) {
      hasLogin = false;
    }

    if (!hasLogin) {
      await app.auth.signInAnonymously();
    }

    return app.auth;
  }

  throw new Error('CloudBase Auth 初始化失败');
}

let __cloudbaseAppPromise = null;

async function getCloudbaseApp() {
  if (__cloudbaseAppPromise) {
    return __cloudbaseAppPromise;
  }

  __cloudbaseAppPromise = (async () => {
    if (window.location.protocol === 'file:') {
      throw new Error('请不要直接双击本地 HTML 调试 CloudBase，请使用部署后的 https 地址');
    }

    const config = getCmsConfig();
    const sdk = getCloudbaseSdk();

    if (!sdk || typeof sdk.init !== 'function') {
      throw new Error('CloudBase SDK 未加载：请先引入 cloudbase.full.js 或 tcb.js');
    }

    const app = sdk.init({
      env: config.cloudbase.env,
      region: config.cloudbase.region || 'ap-shanghai'
    });

    await ensureCloudbaseLogin(app);
    return app;
  })();

  try {
    return await __cloudbaseAppPromise;
  } catch (error) {
    __cloudbaseAppPromise = null;
    throw error;
  }
}

async function getCloudbaseDb() {
  const app = await getCloudbaseApp();

  if (typeof app.database !== 'function') {
    throw new Error('CloudBase 数据库方法不存在');
  }

  const db = app.database();

  if (!db || typeof db.collection !== 'function') {
    throw new Error('CloudBase 数据库对象不可用');
  }

  return db;
}

function normalizePosts(rows) {
  return (rows || [])
    .filter(Boolean)
    .filter((item) => item.published !== false)
    .sort((a, b) => {
      const aTime = new Date(a.publishedAt || a._createTime || 0).getTime();
      const bTime = new Date(b.publishedAt || b._createTime || 0).getTime();
      return bTime - aTime;
    });
}

async function fetchPostsFromCloudbase() {
  const config = getCmsConfig();
  const db = await getCloudbaseDb();
  const collectionName = config.cloudbase.postsCollection || 'posts';

  const res = await db.collection(collectionName).limit(100).get();
  const rows = Array.isArray(res?.data) ? res.data : [];

  const normalizeTime = (value) => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const t = new Date(value).getTime();
      return Number.isNaN(t) ? 0 : t;
    }
    if (typeof value === 'object') {
      if (typeof value.seconds === 'number') return value.seconds * 1000;
      if (typeof value._seconds === 'number') return value._seconds * 1000;
      if (value.$date) {
        const t = new Date(value.$date).getTime();
        return Number.isNaN(t) ? 0 : t;
      }
    }
    return 0;
  };

  return rows
    .filter((item) => {
      const p = item?.published;
      return p === true || p === 'true' || p === 1;
    })
    .sort((a, b) => {
      const aTime = normalizeTime(a?.publishedAt);
      const bTime = normalizeTime(b?.publishedAt);
      return bTime - aTime;
    });
}
window.__debugFetchPosts = fetchPostsFromCloudbase;

(function () {
  const { sections, hero } = window.LEO_UI_DATA || { sections: [], hero: {} };

  const heroStage = document.getElementById('heroStage');
  const heroSphere = document.getElementById('heroSphere');
  const heroBaseLayer = document.getElementById('heroBaseLayer');
  const heroMaskLayer = document.getElementById('heroMaskLayer');
  const maskTitle = document.getElementById('maskTitle');
  const baseTitle = document.getElementById('baseTitle');

  if (heroStage && heroSphere && heroBaseLayer && heroMaskLayer && maskTitle && baseTitle) {
    const state = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      currentSize: hero.sphereBase || 170,
      targetSize: hero.sphereBase || 170,
      active: false,
      raf: 0,
      initialized: false
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function setDefaultTarget() {
      const rect = heroStage.getBoundingClientRect();
      state.targetX = rect.width * 0.5;
      state.targetY = rect.height * 0.36;
      if (!state.initialized) {
        state.currentX = state.targetX;
        state.currentY = state.targetY;
        state.initialized = true;
      }
    }

    function computeOverlap() {
      const stageRect = heroStage.getBoundingClientRect();
      const titleRect = baseTitle.getBoundingClientRect();
      const x = stageRect.left + state.currentX;
      const y = stageRect.top + state.currentY;
      const radius = state.currentSize * 0.5;

      const overlaps = !(
        x + radius < titleRect.left ||
        x - radius > titleRect.right ||
        y + radius < titleRect.top ||
        y - radius > titleRect.bottom
      );

      heroSphere.classList.toggle('is-over', overlaps);
      state.targetSize = overlaps ? (hero.sphereLarge || 240) : (hero.sphereBase || 170);

      const titleWrapRect = heroMaskLayer.getBoundingClientRect();
      const localX = x - titleWrapRect.left;
      const localY = y - titleWrapRect.top;
      const clipRadius = state.currentSize * 0.5;
      heroMaskLayer.style.clipPath = `circle(${clipRadius}px at ${localX}px ${localY}px)`;
      heroMaskLayer.style.opacity = overlaps ? '1' : '0.92';

      return overlaps;
    }

    function updateTitleTilt() {
      const rect = heroStage.getBoundingClientRect();
      const centerX = rect.width * 0.5;
      const centerY = rect.height * 0.42;
      const dx = (state.currentX - centerX) / rect.width;
      const dy = (state.currentY - centerY) / rect.height;
      const rotateY = clamp(dx * 22, -14, 14);
      const rotateX = clamp(-dy * 14, -10, 10);
      const skewX = clamp(dx * 14, -10, 10);
      const translateX = clamp(dx * 42, -28, 28);
      const translateY = clamp(dy * 28, -18, 18);
      const baseTransform = `translate3d(calc(-50% + ${translateX}px), ${translateY}px, 0) rotateX(${rotateX}deg) rotateY(${rotateY}deg) skewX(${skewX}deg)`;
      heroBaseLayer.style.transform = baseTransform;
      heroMaskLayer.style.transform = baseTransform;

      const maskScale = 1.015 + Math.min(Math.abs(dx) + Math.abs(dy), 0.18);
      const maskSkew = clamp(dx * 9, -6, 6);
      const maskLift = clamp(-dy * 12, -8, 8);
      maskTitle.style.transform = `rotate(-6deg) scale(${maskScale}) skewX(${maskSkew}deg) translate3d(0, ${maskLift}px, 24px)`;
    }

    function frame() {
      state.currentX += (state.targetX - state.currentX) * 0.12;
      state.currentY += (state.targetY - state.currentY) * 0.12;
      state.currentSize += (state.targetSize - state.currentSize) * 0.18;
      heroSphere.style.left = `${state.currentX}px`;
      heroSphere.style.top = `${state.currentY}px`;
      heroSphere.style.width = `${state.currentSize}px`;
      heroSphere.style.height = `${state.currentSize}px`;
      computeOverlap();
      updateTitleTilt();
      state.raf = requestAnimationFrame(frame);
    }

    function onMove(event) {
      const rect = heroStage.getBoundingClientRect();
      state.active = true;
      state.targetX = event.clientX - rect.left;
      state.targetY = event.clientY - rect.top;
    }

    setDefaultTarget();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('resize', setDefaultTarget);
    frame();
  }

  const rows = document.querySelectorAll('.skill-row');
  const hoverPanel = document.getElementById('skillHoverPanel');
  if (rows.length && hoverPanel) {
    const defaultText = hoverPanel.textContent;
    rows.forEach((row) => {
      row.addEventListener('mouseenter', () => {
        hoverPanel.textContent = row.dataset.detail || defaultText;
        hoverPanel.style.background = '#0f0f0f';
        hoverPanel.style.color = '#ffffff';
      });
      row.addEventListener('mouseleave', () => {
        hoverPanel.textContent = defaultText;
        hoverPanel.style.background = 'rgba(0,0,0,0.025)';
        hoverPanel.style.color = '#6f6f6f';
      });
    });
  }

  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const sectionNavLinks = navLinks.filter((link) => (link.getAttribute('href') || '').startsWith('#'));
  if (sections.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          sectionNavLinks.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === `#${entry.target.id}`));
        });
      },
      { threshold: 0.4 }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();
