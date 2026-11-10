// Applies a saved light or dark theme before the page paints, so it never flashes the wrong one.
// Loaded as a file rather than inline so the Content-Security-Policy can stay script-src 'self'.
try {
  var theme = localStorage.getItem("the-colour-archive-theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (error) {
  // Storage blocked: follow the device setting.
}
