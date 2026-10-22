// Applies the saved theme before first paint (loaded blocking from <head>).
(function () {
  var mode = "system";
  try {
    mode = localStorage.getItem("trqsh-admin-theme") || "system";
  } catch (e) {}
  var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = mode;
})();
