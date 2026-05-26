"use client";

import { useEffect } from "react";

const THEME_KEY = "uiDarkMode";
export const THEME_CHANGE_EVENT = "anjava-theme-change";

export function applyUiTheme(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", enabled);
  document.documentElement.dataset.theme = enabled ? "dark" : "light";
}

export function setStoredUiTheme(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, enabled ? "1" : "0");
  applyUiTheme(enabled);
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: enabled }));
}

export function getStoredUiTheme() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(THEME_KEY) === "1";
}

export default function ThemeBootstrap() {
  useEffect(() => {
    applyUiTheme(getStoredUiTheme());

    function onStorage(e: StorageEvent) {
      if (e.key === THEME_KEY) {
        applyUiTheme(e.newValue === "1");
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
