(function () {
  try {
    var pref = 'system';
    var multiRaw = window.localStorage.getItem('diang-anglais:profiles:v2');
    if (multiRaw) {
      var multi = JSON.parse(multiRaw);
      if (multi && Array.isArray(multi.profiles)) {
        var active =
          multi.profiles.find(function (p) {
            return p.id === multi.activeProfileId;
          }) || multi.profiles[0];
        var t = active && active.state && active.state.theme;
        if (t === 'light' || t === 'dark' || t === 'system') {
          pref = t;
        }
      }
    } else {
      var raw =
        window.localStorage.getItem('diang-anglais:v1') ||
        window.localStorage.getItem('diang-anglais-state-v1');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (
          parsed &&
          (parsed.theme === 'light' ||
            parsed.theme === 'dark' ||
            parsed.theme === 'system')
        ) {
          pref = parsed.theme;
        }
      }
    }
    var systemDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = pref === 'dark' || (pref === 'system' && systemDark);
    var root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#141817' : '#0F4C3A');
    }
  } catch (e) {}
})();
