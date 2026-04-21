const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://3.38.108.207:30080/api";

type ApiSuccess<T> = {
  success: true;
  statusCode: number;
  message: string;
  data: T;
};
type ApiError = {
  success: false;
  statusCode: number;
  message: string;
  error?: string;
  validationErrors?: string[];
};

export type Tokens = { accessToken: string; refreshToken: string };
export type Me = {
  id: string;
  email: string;
  name: string;
  profileImg?: string;
  createdAt: string;
};

const ACCESS_KEY = "accessToken";
const REFRESH_COOKIE = "refreshToken";
const REFRESH_DAYS = 30;
const USER_ID_KEY = "userId";
const ONBOARDING_PREFIX = "onboarding:";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + REFRESH_COOKIE + "=([^;]*)"),
  );
  if (match) return decodeURIComponent(match[1]);
  // 과거 버전 호환: localStorage 에 남아있으면 한번 가져옴
  if (typeof window !== "undefined") {
    return localStorage.getItem(REFRESH_COOKIE);
  }
  return null;
}

function setRefreshCookie(token: string) {
  if (typeof document === "undefined") return;
  const expires = new Date(
    Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000,
  ).toUTCString();
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; path=/; expires=${expires}; SameSite=Lax${secure}`;
}

function deleteRefreshCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${REFRESH_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function saveTokens(t: Tokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, t.accessToken);
  setRefreshCookie(t.refreshToken);
  // 혹시 남아있을 수 있는 옛 localStorage 리프레시 토큰 제거
  localStorage.removeItem(REFRESH_COOKIE);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_COOKIE);
  localStorage.removeItem(USER_ID_KEY);
  deleteRefreshCookie();
  // 온보딩 플래그(`onboarding:<id>`)는 기기별로 유지 — 같은 계정이 재로그인하면 가이드 스킵
}

export function cacheUserId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_ID_KEY, id);
}

export function getCachedUserId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_ID_KEY);
}

export function hasCompletedOnboarding(userId: string | null = getCachedUserId()) {
  if (typeof window === "undefined" || !userId) return false;
  return localStorage.getItem(ONBOARDING_PREFIX + userId) === "1";
}

export function markOnboardingComplete(userId: string | null = getCachedUserId()) {
  if (typeof window === "undefined" || !userId) return;
  localStorage.setItem(ONBOARDING_PREFIX + userId, "1");
}

/**
 * 로그인/회원가입/소셜 콜백 성공 직후 공통 분기 로직.
 * 온보딩 완료 여부에 따라 `/dashboard` 또는 `/webcam-guide` 경로를 반환한다.
 * `forceGuide=true` 면 회원가입처럼 항상 가이드로 보내고 싶을 때 사용.
 */
export async function resolvePostAuthPath(options: { forceGuide?: boolean } = {}) {
  try {
    const me = await getMe();
    cacheUserId(me.id);
    if (options.forceGuide) return "/webcam-guide";
    return hasCompletedOnboarding(me.id) ? "/dashboard" : "/webcam-guide";
  } catch {
    return "/webcam-guide";
  }
}

async function rawRequest<T>(
  path: string,
  init: RequestInit,
  auth: boolean,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let json: ApiSuccess<T> | ApiError | Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { success: false, statusCode: res.status, message: text } as ApiError;
    }
  }
  if (!res.ok || (json as ApiError).success === false) {
    const err = json as ApiError;
    const msg =
      err.validationErrors?.[0] ?? err.message ?? `요청 실패 (${res.status})`;
    const error = new Error(msg) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return (json as ApiSuccess<T>).data;
}

let refreshing: Promise<Tokens> | null = null;

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = false,
): Promise<T> {
  try {
    return await rawRequest<T>(path, init, auth);
  } catch (e) {
    const err = e as Error & { status?: number };
    if (auth && err.status === 401 && getRefreshToken()) {
      try {
        refreshing = refreshing ?? refresh();
        const tokens = await refreshing;
        saveTokens(tokens);
        return await rawRequest<T>(path, init, true);
      } catch {
        clearTokens();
        throw err;
      } finally {
        refreshing = null;
      }
    }
    throw err;
  }
}

export function login(email: string, password: string) {
  return request<Tokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signup(
  email: string,
  password: string,
  name: string,
  profileImg?: string,
) {
  return request<Tokens>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      name,
      ...(profileImg && { profileImg }),
    }),
  });
}

export function refresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.reject(new Error("리프레시 토큰이 없습니다."));
  }
  return rawRequest<Tokens>(
    "/auth/refresh",
    { method: "POST", body: JSON.stringify({ refreshToken }) },
    false,
  );
}

export async function logout() {
  try {
    await request<null>("/auth/logout", { method: "POST" }, true);
  } finally {
    clearTokens();
  }
}

export async function withdraw() {
  try {
    await request<null>("/auth/withdraw", { method: "DELETE" }, true);
  } finally {
    clearTokens();
  }
}

export function getMe() {
  return request<Me>("/users/me", { method: "GET" }, true);
}

export function sendEmailCode(email: string) {
  return request<null>("/auth/email/send-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyEmailCode(email: string, code: string) {
  return request<null>("/auth/email/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function googleLoginUrl() {
  return `${API_URL}/auth/google`;
}

export async function uploadImageToCloudinary(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !preset) {
    throw new Error(
      "Cloudinary 환경변수가 설정되지 않았습니다. .env.local 에 NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET 를 추가하세요.",
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message ?? "이미지 업로드 실패");
  }
  return json.secure_url as string;
}
