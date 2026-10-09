export const THEME_STORAGE_KEY = "theme";
export const LIGHT_THEME_COLOR = "#ffffff";
export const DARK_THEME_COLOR = "#0c0c0e";
export const THEME_COLOR_META_ID = "trqsh-theme-color";

// Runs in the document head before paint, keeping static pages free of a theme flash.
export const themeBootScript = `(() => {
  let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  try {
    const saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (saved === "dark" || saved === "light") dark = saved === "dark";
  } catch {}
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  const meta = document.createElement("meta");
  meta.id = ${JSON.stringify(THEME_COLOR_META_ID)};
  meta.name = "theme-color";
  meta.content = dark ? ${JSON.stringify(DARK_THEME_COLOR)} : ${JSON.stringify(LIGHT_THEME_COLOR)};
  document.head.appendChild(meta);
})();`;
