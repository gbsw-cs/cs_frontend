const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://3.38.108.207:30080";

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
const REFRESH_KEY = "refreshToken";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}
export function saveTokens(t: Tokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, t.accessToken);
  localStorage.setItem(REFRESH_KEY, t.refreshToken);
}
export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
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
  const json = (text ? JSON.parse(text) : {}) as ApiSuccess<T> | ApiError;
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
        const tokens = await refresh();
        saveTokens(tokens);
        return await rawRequest<T>(path, init, true);
      } catch {
        clearTokens();
        throw err;
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
    body: JSON.stringify({ email, password, name, ...(profileImg && { profileImg }) }),
  });
}

export function refresh() {
  const refreshToken = getRefreshToken();
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
