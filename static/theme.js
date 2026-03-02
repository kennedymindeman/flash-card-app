// Shared theme logic across all pages
(function () {
  let theme = localStorage.getItem("mono-theme") || "auto";

  function applyTheme() {
    const r = document.documentElement;
    if (theme === "auto") r.removeAttribute("data-theme");
    else r.setAttribute("data-theme", theme);
    const btn = document.getElementById("theme-btn");
    if (btn)
      btn.textContent = theme === "dark" ? "○" : theme === "light" ? "●" : "◐";
  }

  applyTheme();

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-btn");
    if (btn) {
      applyTheme();
      btn.addEventListener("click", () => {
        theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
        localStorage.setItem("mono-theme", theme);
        applyTheme();
      });
    }
  });
})();
