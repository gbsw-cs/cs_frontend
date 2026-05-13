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
  settings: UserSettings;
};

export type ApiBadge = {
  badgeId: string;
  code: string;
  name: string;
  earnedAt: string;
  iconUrl: string;
};

export type BadgeProgressNext = {
  code: string;
  requirementValue: number;
  remaining: number;
};

export type BadgeProgressCategory = {
  category: string;
  current: number;
  next: BadgeProgressNext | null;
};

export type AvatarSymptom = {
  type: string;
  severity: number;
  durationSec: number;
  count: number;
};

export type AvatarState = {
  windowSec: number;
  dominantSymptom: string | null;
  severity: number;
  symptoms: AvatarSymptom[];
  avatarHoodColor: string;
};

export type ReportPushWay = "EMAIL" | "NOTION";

export type UserSettings = {
  brightnessThreshold: number;
  darkDetectionEnabled: boolean;
  reportPushEnabled: boolean;
  reportPushWay: ReportPushWay;
  pushEnabled: boolean;
  soundEnabled: boolean;
  avatarHoodColor: string;
};

export type UserSettingsPatch = Partial<Omit<UserSettings, "darkDetectionEnabled">>;

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
  // 과거 버전에서 계정 구분 없이 저장되던 키 정리
  localStorage.removeItem("mySettings");
  deleteRefreshCookie();
  // 온보딩 플래그(`onboarding:<id>`)와 계정별 설정 캐시(`mySettings:<id>`)는
  // 같은 계정이 재로그인할 때 즉시 복원되도록 기기에 유지.
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

const REQUEST_TIMEOUT_MS = 15000;

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

  const controller = new AbortController();
  const externalSignal = init.signal as AbortSignal | undefined;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(new Error("timeout")), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (e) {
    const err = e as Error & { name?: string };
    const networkError = new Error(
      err.name === "AbortError" || /timeout/i.test(err.message ?? "")
        ? "서버 응답이 없습니다. 네트워크 또는 서버 상태를 확인해 주세요."
        : "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    ) as Error & { status?: number; cause?: unknown };
    networkError.cause = e;
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }

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

export async function getMe() {
  const me = await request<Me>("/users/me", { method: "GET" }, true);
  cacheUserId(me.id);
  return me;
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

export function getMySettings() {
  return getMe().then((me) => me.settings);
}

export function updateMySettings(patch: UserSettingsPatch) {
  return request<UserSettings>(
    "/users/me/settings",
    { method: "PATCH", body: JSON.stringify(patch) },
    true,
  );
}

export function setDarkDetection(enabled: boolean) {
  return request<{ darkDetectionEnabled: boolean }>(
    "/users/me/dark-detection",
    { method: "PATCH", body: JSON.stringify({ enabled }) },
    true,
  );
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<null>(
    "/users/me/password",
    {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    true,
  );
}

export function googleLoginUrl() {
  return `${API_URL}/auth/google`;
}

export function updateProfile(patch: { name?: string; profileImg?: string | null }) {
  return request<{ id: string; name: string; profileImg: string }>(
    "/users/me/profile",
    { method: "PATCH", body: JSON.stringify(patch) },
    true,
  );
}

export function getAvatarState(windowSec = 60) {
  return request<AvatarState>(
    `/users/me/avatar-state?windowSec=${windowSec}`,
    { method: "GET" },
    true,
  );
}

export function getBadges() {
  return request<ApiBadge[]>("/users/me/badges", { method: "GET" }, true);
}

export function getBadgesProgress() {
  return request<{ categories: BadgeProgressCategory[] }>(
    "/users/me/badges/progress",
    { method: "GET" },
    true,
  );
}

export type MasterBadge = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: "POSTURE_TIME" | "STREAK" | "SPECIAL";
  iconUrl: string | null;
  requirementValue: number;
};

export type ReportStatus = "PENDING" | "SENT" | "FAILED";

export type ReportListItem = {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  deliveryWay: "EMAIL" | "NOTION";
  status: ReportStatus;
  sentAt: string | null;
};

export type ReportTopIssue = {
  type: string;
  durationSec: number;
  count: number;
  rank: number;
};

export type ReportDetail = ReportListItem & {
  session: {
    firstStartedAt: string;
    lastEndedAt: string;
    totalDetectionSec: number;
  } | null;
  healthScore: {
    weekly: number | null;
    daily: (number | null)[];
  } | null;
  timeline: {
    date: string;
    startHour: number;
    startMin: number;
    dominantState: string;
    healthScore: number;
  }[];
  topIssues: ReportTopIssue[];
  aiSolution: string | null;
};

export function getAllBadges() {
  return request<MasterBadge[]>("/badges", { method: "GET" }, true);
}

export type CurrentReport = {
  weekStartDate: string;
  weekEndDate: string;
  session: {
    firstStartedAt: string;
    lastEndedAt: string;
    totalDetectionSec: number;
  } | null;
  healthScore: {
    weekly: number | null;
    daily: (number | null)[];
  } | null;
  timeline: {
    date: string;
    startHour: number;
    startMin: number;
    dominantState: string;
    healthScore: number;
  }[];
  topIssues: ReportTopIssue[];
  aiSolution: string | null;
};

export function getCurrentReport() {
  return request<CurrentReport>("/users/me/reports/current", { method: "GET" }, true);
}

export function getReports(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return request<{ items: ReportListItem[] }>(
    `/users/me/reports${qs ? `?${qs}` : ""}`,
    { method: "GET" },
    true,
  );
}

export function getReport(id: string) {
  return request<ReportDetail>(`/users/me/reports/${id}`, { method: "GET" }, true);
}

export function resendReport(id: string) {
  return request<{ id: string; status: ReportStatus }>(
    `/users/me/reports/${id}/resend`,
    { method: "POST" },
    true,
  );
}

// ── Dashboard ──────────────────────────────────────────────

export type TodayDashboard = {
  date: string;
  // 신 API: postureScore / 구 API: healthScore — 둘 다 허용
  postureScore?: number;
  healthScore?: number;
  warningCount?: number;
  vsYesterday?: number;
  vsLastWeek?: number;
  // 구 API 필드
  totalDetectionSec?: number;
  goodPostureRatio?: number;
  breakdown?: {
    turtleNeckSec?: number;
    shoulderIssueSec?: number;
    darkEnvSec?: number;
    turtleNeckCount?: number;
    shoulderIssueCount?: number;
    darkEnvCount?: number;
  };
  darkDetectionMode?: "ON" | "OFF";
};

export type WeeklyDashboard = {
  from: string;
  to: string;
  days: {
    date: string;
    badPostureRatio: number;
  }[];
  turtleNeckTotalSec: number;
  roundShoulderTotalSec: number;
  shoulderAsymmetryTotalSec: number;
  darkEnvTotalSec: number;
  goodPostureRatio: number;
  worstWeekday: string;
};

export type DailyDashboard = {
  date: string;
  slots: {
    slotIndex: number;
    startHour: number;
    goodPostureCount: number;
    singleBadCount: number;
    overlappingCount: number;
  }[];
};

export type TimelineDashboard = {
  date: string;
  buckets: {
    // 신 API: time 문자열 / 구 API: startHour + startMin
    time?: string;
    startHour?: number;
    startMin?: number;
    dominantState: "GOOD" | "TURTLE_NECK" | "SHOULDER_ISSUE" | "DARK_ENV";
    message?: string;
    healthScore?: number;
  }[];
};

export function getDashboardToday() {
  return request<TodayDashboard>("/dashboard/today", { method: "GET" }, true);
}

export function getDashboardWeekly(from: string) {
  return request<WeeklyDashboard>(`/dashboard/weekly?from=${from}`, { method: "GET" }, true);
}

export function getDashboardDaily(date: string) {
  return request<DailyDashboard>(`/dashboard/daily?date=${date}`, { method: "GET" }, true);
}

export function getDashboardTimeline(date: string) {
  return request<TimelineDashboard>(`/dashboard/timeline?date=${date}`, { method: "GET" }, true);
}

// ── AI API ──────────────────────────────────────────────

// 프록시 라우트 사용 (API 키는 서버사이드에서 관리)
const AI_URL = "/api/ai";

export type AIHealthScoreRequest = {
  id: string;
  counts: {
    turtle_neck: number;
    round_shoulder: number;
    shoulder_tilted: number;
    dark_environment: number;
  };
  total_frames: number;
  low_visibility_frames: number;
};

export type AIHealthScoreBreakdown = {
  count: number;
  ratio: number;
  severity: number;
  weight: number;
  penalty: number;
};

export type AIHealthScoreResult = {
  success: boolean;
  data: {
    id: string;
    result: {
      score: number | null;
      grade: string | null;
      status: "ok" | "insufficient_data";
      effective_frames: number;
      total_frames: number;
      low_visibility_frames: number;
      total_penalty: number;
      breakdown: Record<string, AIHealthScoreBreakdown>;
    };
  } | null;
  error: { code: string; message: string; hint: string } | null;
};

export async function postAIHealthScore(
  body: AIHealthScoreRequest,
): Promise<AIHealthScoreResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${AI_URL}/health/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI 건강 점수 요청 실패 (${res.status})`);
    return res.json() as Promise<AIHealthScoreResult>;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Cloudinary ──────────────────────────────────────────

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
