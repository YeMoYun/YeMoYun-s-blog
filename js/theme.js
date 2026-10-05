(function () {
  const STORAGE_KEY = 'moyun_theme_mode';
  const root = document.documentElement;

  function preferredMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'day' || saved === 'night') return saved;
    } catch (error) {
      // localStorage may be unavailable in some embedded browsers.
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'night';
    }
    return 'day';
  }

  function updateButtons(mode) {
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    buttons.forEach((button) => {
      const isNight = mode === 'night';
      button.setAttribute('aria-pressed', String(isNight));
      button.setAttribute('title', isNight ? '切换到白天模式' : '切换到夜间模式');
      button.innerHTML = `
        <span class="theme-toggle-mark" aria-hidden="true">${isNight ? 'N' : 'D'}</span>
        <span class="theme-toggle-text">${isNight ? '夜间' : '白天'}</span>
      `;
    });
  }

  function applyMode(mode) {
    const nextMode = mode === 'night' ? 'night' : 'day';
    root.dataset.theme = nextMode;
    root.style.colorScheme = nextMode === 'night' ? 'dark' : 'light';

    try {
      localStorage.setItem(STORAGE_KEY, nextMode);
    } catch (error) {
      // Theme still works for the current page even if persistence fails.
    }

    updateButtons(nextMode);
  }

  function toggleMode() {
    applyMode(root.dataset.theme === 'night' ? 'day' : 'night');
  }

  applyMode(preferredMode());

  window.MOYUN_THEME = {
    apply: applyMode,
    toggle: toggleMode
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateButtons(root.dataset.theme || preferredMode());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', toggleMode);
    });
  });
})();
