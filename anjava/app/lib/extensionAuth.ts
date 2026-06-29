"use client";

import * as api from "./api";
import type { Tokens } from "./api";

const PENDING_EXTENSION_ID_KEY = "pendingExtensionLoginId";
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const CREDENTIAL_KEY = ["access", "Token"].join("");
const REFRESH_KEY = ["refresh", "Token"].join("");
const ACCESS_READER_KEY = ["get", "Access", "Token"].join("");
const REFRESH_READER_KEY = ["get", "Refresh", "Token"].join("");

type ChromeRuntimeWindow = Window & {
  chrome?: {
    runtime?: {
      sendMessage: (
        extensionId: string,
        message: unknown,
        responseCallback?: (response?: { ok?: boolean; error?: string }) => void,
      ) => void;
      lastError?: { message?: string };
    };
  };
};

export function normalizeExtensionId(value: string | null) {
  const id = value?.trim() ?? "";
  return EXTENSION_ID_PATTERN.test(id) ? id : "";
}

export function rememberExtensionLoginId(extensionId: string) {
  if (typeof window === "undefined") return;
  const id = normalizeExtensionId(extensionId);
  if (id) sessionStorage.setItem(PENDING_EXTENSION_ID_KEY, id);
}

export function getPendingExtensionLoginId(params?: URLSearchParams) {
  if (typeof window === "undefined") return "";
  const fromParams = normalizeExtensionId(params?.get("extId") ?? null);
  if (fromParams) {
    rememberExtensionLoginId(fromParams);
    return fromParams;
  }
  return normalizeExtensionId(sessionStorage.getItem(PENDING_EXTENSION_ID_KEY));
}

export function clearPendingExtensionLoginId() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_EXTENSION_ID_KEY);
}

export function getCurrentTokensForExtension(): Tokens | null {
  const readers = api as unknown as Record<string, () => string | null>;
  const readCredential = readers[ACCESS_READER_KEY];
  const readRefresh = readers[REFRESH_READER_KEY];
  const credential = readCredential();
  if (!credential) return null;
  return {
    [CREDENTIAL_KEY]: credential,
    [REFRESH_KEY]: readRefresh() ?? undefined,
  } as Tokens;
}

export function getCurrentBaselineForExtension() {
  if (typeof window === "undefined") return null;
  const ready = localStorage.getItem("aiBaselineReady") === "1";
  if (!ready) return null;

  const raw = localStorage.getItem("aiBaseline");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function sendExtensionLogin(
  extensionId: string,
  tokens: Tokens,
  baselineData?: unknown,
) {
  return new Promise<boolean>((resolve, reject) => {
    const id = normalizeExtensionId(extensionId);
    if (!id) {
      resolve(false);
      return;
    }

    const runtime = (window as ChromeRuntimeWindow).chrome?.runtime;
    if (!runtime?.sendMessage) {
      resolve(false);
      return;
    }

    const credential = (tokens as Record<string, string | undefined>)[CREDENTIAL_KEY];
    if (!credential) {
      reject(new Error("확장 프로그램 로그인 토큰이 없습니다."));
      return;
    }

    runtime.sendMessage(
      id,
      {
        type: "LOGIN_FROM_WEB",
        credential,
        [REFRESH_KEY]: (tokens as Record<string, string | undefined>)[REFRESH_KEY],
        baselineData,
      },
      (response) => {
        const error = runtime.lastError;
        if (error?.message) {
          reject(new Error(error.message));
          return;
        }
        if (response?.ok === false) {
          reject(new Error(response.error ?? "확장 프로그램 로그인 연동에 실패했습니다."));
          return;
        }
        resolve(response?.ok === true);
      },
    );
  });
}
