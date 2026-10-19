/* Applied before first paint so switching to or from dark mode never flashes
   the wrong theme. src/theme/ThemeProvider.jsx takes over once React mounts
   (same storage key, same resolution logic). A file rather than an inline
   script, so the server's Content Security Policy allows it. */
(function () {
  try {
    var saved = localStorage.getItem('lp_theme_preference');
    var pref = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    var scheme = pref === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    document.documentElement.setAttribute('data-theme', scheme);
  } catch { /* storage or matchMedia unavailable: default light styles apply */ }
})();
