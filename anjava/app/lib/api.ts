const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

type ApiSuccess<T> = { success: true; statusCode: number; message: string; data: T };
type ApiError = {
  success: false;
  statusCode: number;
  message: string;
  validationErrors?: string[];
};

export type Tokens = { accessToken: string; refreshToken: string };

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = (await res.json()) as ApiSuccess<T> | ApiError;
  if (!res.ok || json.success === false) {
    const err = json as ApiError;
    throw new Error(err.validationErrors?.[0] ?? err.message ?? "요청 실패");
  }
  return (json as ApiSuccess<T>).data;
}

export function login(email: string, password: string) {
  return request<Tokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signup(email: string, password: string, name: string) {
  return request<Tokens>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function saveTokens(t: Tokens) {
  if (typeof window === "undefined") return;
  localStorage.setItem("accessToken", t.accessToken);
  localStorage.setItem("refreshToken", t.refreshToken);
}
