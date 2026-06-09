const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || "/api/backend";
const API_URL = /cs-backend\.p-e\.kr/i.test(configuredApiUrl)
  ? "/api/backend"
  : configuredApiUrl.replace(/\/$/, "");

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

export type Tokens = { accessToken: string; refreshToken?: string };
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

export type PushTokenPlatform = "web" | "extension";

export type PushTokenPayload = {
  token: string;
  platform: PushTokenPlatform;
  deviceId: string;
  userAgent?: string;
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
  if (t.refreshToken) {
    setRefreshCookie(t.refreshToken);
  } else {
    deleteRefreshCookie();
  }
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
      credentials: "include",
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
  const success = json as Partial<ApiSuccess<T>>;
  if (success.success === true && "data" in success) {
    return success.data as T;
  }
  return json as T;
}

let refreshing: Promise<Tokens> | null = null;
let currentSessionRequest: Promise<DetectionSession | null> | null = null;
let currentSessionBackoffUntil = 0;

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
      if (!refreshing) {
        refreshing = refresh().finally(() => { refreshing = null; });
      }
      try {
        const tokens = await refreshing;
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
  return rawRequest<Tokens>(
    "/auth/refresh",
    { method: "POST", body: JSON.stringify(refreshToken ? { refreshToken } : {}) },
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

export function registerPushToken(payload: PushTokenPayload) {
  return request<null>(
    "/users/me/push-tokens",
    { method: "POST", body: JSON.stringify(payload) },
    true,
  );
}

export function deletePushToken(deviceId: string) {
  return request<null>(
    `/users/me/push-tokens/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
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
  return "/api/auth/google";
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
  category: string;
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

export type WeeklyReportSummary = {
  reportId: string;
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  status: ReportStatus;
  sentAt: string | null;
  deliveryWay: "EMAIL" | "NOTION";
  totalDetectionSec: number;
  goodPostureSec: number;
  badPostureSec: number;
  riskPercent: number;
  goodPostureRatio: number;
  healthScore: {
    weekly: number | null;
    daily: (number | null)[];
  } | null;
  topIssues: ReportTopIssue[];
  aiSolution: string | null;
  aiAnalyzedAt: string | null;
};

export function getReportsSummary(week?: number, limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (week !== undefined) params.set("week", String(week));
  return request<{ items: WeeklyReportSummary[] }>(
    `/reports/summary?${params.toString()}`,
    { method: "GET" },
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
    turtleNeckSec?: number | string | null;
    shoulderIssueSec?: number | string | null;
    roundShoulderSec?: number | string | null;
    shoulderAsymmetrySec?: number | string | null;
    darkEnvSec?: number | string | null;
    turtleNeckCount?: number | string | null;
    shoulderIssueCount?: number | string | null;
    roundShoulderCount?: number | string | null;
    shoulderAsymmetryCount?: number | string | null;
    darkEnvCount?: number | string | null;
  };
  darkDetectionMode?: "ON" | "OFF";
};

export type WeeklyDashboard = {
  from: string;
  to: string;
  days: {
    date: string;
    badPostureRatio: number;
    totalDetectionSec: number;
    turtleNeckSec: number;
    roundShoulderSec: number;
    shoulderAsymmetrySec: number;
    darkEnvSec: number;
  }[];
  totalDetectionSec: number;
  goodPostureSec: number;
  turtleNeckTotalSec: number;
  roundShoulderTotalSec: number;
  shoulderAsymmetryTotalSec: number;
  darkEnvTotalSec: number;
  goodPostureRatio: number;
  worstWeekday: string | null;
};

export type DailyDashboard = {
  date: string;
  slotIndex: number;
  startHour: number;
  endHour: number;
  goodPostureCount: number;
  singleBadCount: number;
  overlappingCount: number;
};

type RawDailyDashboardSlot = Partial<DailyDashboard> & {
  turtleNeckCount?: number | string | null;
  roundShoulderCount?: number | string | null;
  shoulderAsymmetryCount?: number | string | null;
  shoulderIssueCount?: number | string | null;
  darkEnvCount?: number | string | null;
};

type RawDailyDashboard = RawDailyDashboardSlot & {
  slots?: RawDailyDashboardSlot[];
};

export type TimelineDashboard = {
  date: string;
  buckets: {
    // 신 API: time 문자열 / 구 API: startHour + startMin
    time?: string;
    startHour?: number;
    startMin?: number;
    dominantState: "GOOD" | "GOOD_POSTURE" | "TURTLE_NECK" | "SHOULDER_ISSUE" | "ROUND_SHOULDER" | "SHOULDER_ASYMMETRY" | "DARK_ENV";
    message?: string;
    healthScore?: number;
  }[];
};

export type DetectionState =
  | "GOOD_POSTURE"
  | "TURTLE_NECK"
  | "SHOULDER_ISSUE"
  | "ROUND_SHOULDER"
  | "SHOULDER_ASYMMETRY"
  | "DARK_ENV";

export type DetectionSession = {
  sessionId: string;
  startedAt: string;
};

export type DetectionSessionEvent = {
  type: DetectionState;
  severity: number;
  durationSec: number;
  detectedAt: string;
};

export function getDashboardToday() {
  return request<TodayDashboard>("/dashboard/today", { method: "GET" }, true);
}

type RawWeeklyDashboard = Partial<WeeklyDashboard> & Record<string, unknown>;

function toApiNumber(value: unknown, fallback = 0): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRatio(value: unknown, fallback = 0): number {
  const n = toApiNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function normalizeWeeklyDashboard(raw: RawWeeklyDashboard): WeeklyDashboard {
  const n = (keys: string[], source: Record<string, unknown> = raw) => {
    for (const k of keys) {
      const value = toApiNumber(source[k], NaN);
      if (Number.isFinite(value)) return value;
    }
    return 0;
  };

  // 신 API: breakdown 중첩 객체 지원
  const breakdown =
    raw.breakdown && typeof raw.breakdown === "object" && !Array.isArray(raw.breakdown)
      ? (raw.breakdown as Record<string, unknown>)
      : null;

  // 신 API: dailyStats / 구 API: days
  const rawDays: unknown[] = Array.isArray(raw.dailyStats)
    ? raw.dailyStats
    : Array.isArray(raw.days)
    ? raw.days
    : [];

  const days = rawDays
    .filter((day): day is Record<string, unknown> => Boolean(day) && typeof day === "object")
    .filter((day) => ("hasData" in day ? (day as { hasData?: unknown }).hasData !== false : true))
    .map((day) => {
      const turtleNeckSec = n(["turtleNeckSec", "turtleNeckTotalSec", "turtle_neck_sec", "turtle_neck_total_sec"], day);
      const roundShoulderSec = n(["roundShoulderSec", "roundShoulderTotalSec", "round_shoulder_sec", "round_shoulder_total_sec"], day);
      const shoulderAsymmetrySec = n(["shoulderAsymmetrySec", "shoulderAsymmetryTotalSec", "shoulder_asymmetry_sec", "shoulder_asymmetry_total_sec"], day);
      const shoulderIssueSec = n(["shoulderIssueSec", "shoulderIssueTotalSec", "shoulder_issue_sec", "shoulder_issue_total_sec"], day);
      const finalRoundSec = roundShoulderSec > 0 ? roundShoulderSec : shoulderIssueSec > 0 ? Math.round(shoulderIssueSec * 0.5) : 0;
      const finalAsymSec = shoulderAsymmetrySec > 0 ? shoulderAsymmetrySec : shoulderIssueSec > 0 ? Math.round(shoulderIssueSec * 0.5) : 0;
      const darkEnvSec = n(["darkEnvSec", "darkEnvTotalSec", "dark_env_sec", "dark_env_total_sec"], day);
      const badSec = turtleNeckSec + finalRoundSec + finalAsymSec;
      const totalDetectionSec = n(
        ["totalDetectionSec", "totalDurationSec", "totalScreenSec", "screenTimeSec", "detectionSec", "total_detection_sec", "total_duration_sec", "total_screen_sec", "screen_time_sec"],
        day,
      );
      const ratioFromDuration = totalDetectionSec > 0 ? badSec / totalDetectionSec : 0;
      const rawBadRatio = day.badPostureRatio ?? day.bad_posture_ratio;
      const badPostureRatio =
        typeof rawBadRatio === "number" && Number.isFinite(rawBadRatio)
          ? normalizeRatio(rawBadRatio)
          : typeof rawBadRatio === "string"
          ? normalizeRatio(rawBadRatio)
          : "goodPostureRatio" in day || "good_posture_ratio" in day
          ? 1 - normalizeRatio(day.goodPostureRatio ?? day.good_posture_ratio)
          : ratioFromDuration;
      return {
        date: typeof day.date === "string" ? day.date : "",
        badPostureRatio,
        totalDetectionSec,
        turtleNeckSec,
        roundShoulderSec: finalRoundSec,
        shoulderAsymmetrySec: finalAsymSec,
        darkEnvSec,
      };
    })
    .filter((day) => day.date.length > 0);

  // 신 API: breakdown 객체에서 가져오고 없으면 루트 필드 fallback
  const turtleSec = breakdown
    ? n(["turtleNeckSec"], breakdown)
    : n(["turtleNeckTotalSec", "turtleNeckSec", "turtle_neck_total_sec", "turtle_neck_sec"]);
  const roundSec = breakdown
    ? n(["roundShoulderSec"], breakdown)
    : n(["roundShoulderTotalSec", "roundShoulderSec", "round_shoulder_total_sec", "round_shoulder_sec"]);
  const asymSec = breakdown
    ? n(["shoulderAsymmetrySec"], breakdown)
    : n(["shoulderAsymmetryTotalSec", "shoulderAsymmetrySec", "shoulder_asymmetry_total_sec", "shoulder_asymmetry_sec"]);
  const shoulderIssueSec = n(["shoulderIssueTotalSec", "shoulderIssueSec", "shoulder_issue_total_sec", "shoulder_issue_sec"]);
  const finalRound = roundSec > 0 ? roundSec : shoulderIssueSec > 0 ? Math.round(shoulderIssueSec * 0.5) : 0;
  const finalAsym = asymSec > 0 ? asymSec : shoulderIssueSec > 0 ? Math.round(shoulderIssueSec * 0.5) : 0;
  const darkSec = n(["darkEnvSec", "darkEnvTotalSec", "dark_env_sec", "dark_env_total_sec"]);
  const badSec = turtleSec + finalRound + finalAsym;

  // 신 API: goodPostureSec 직접 제공
  const explicitGoodSec = n([
    "goodPostureSec",
    "goodPostureTotalSec",
    "normalPostureTotalSec",
    "normalPostureSec",
    "good_posture_sec",
    "good_posture_total_sec",
    "normal_posture_total_sec",
    "normal_posture_sec",
  ]);
  const summedDayTotalSec = days.reduce((sum, day) => sum + day.totalDetectionSec, 0);
  const explicitTotalSec = n([
    "totalDetectionSec",
    "totalDurationSec",
    "totalScreenSec",
    "screenTimeSec",
    "detectionSec",
    "total_detection_sec",
    "total_duration_sec",
    "total_screen_sec",
    "screen_time_sec",
  ]);

  // 신 API: goodPostureRatio (0~1) 또는 riskPercent (0~100) 중 있는 쪽 사용
  const rawGoodRatio = raw.goodPostureRatio ?? raw.good_posture_ratio;
  const rawRiskPct = toApiNumber(raw.riskPercent ?? raw.risk_percent, NaN);
  const goodPostureRatio =
    rawGoodRatio !== undefined
      ? normalizeRatio(rawGoodRatio)
      : Number.isFinite(rawRiskPct)
      ? Math.max(0, 1 - rawRiskPct / 100)
      : explicitTotalSec > 0
      ? Math.max(0, 1 - badSec / explicitTotalSec)
      : 0;

  const totalDetectionSec =
    explicitTotalSec > 0
      ? Math.max(explicitTotalSec, badSec)
      : summedDayTotalSec > 0
      ? Math.max(summedDayTotalSec, badSec)
      : explicitGoodSec > 0
      ? explicitGoodSec + badSec
      : goodPostureRatio < 1 && badSec > 0
      ? Math.round(badSec / (1 - goodPostureRatio))
      : badSec;
  // 서버가 goodPostureRatio를 직접 제공하면 그대로 사용; 없을 때만 (total-bad)/total 추정
  const normalizedGoodPostureRatio =
    rawGoodRatio !== undefined
      ? goodPostureRatio
      : totalDetectionSec > 0
      ? Math.max(0, Math.min(1, (totalDetectionSec - badSec) / totalDetectionSec))
      : goodPostureRatio;

  // 정자세 시간: 서버 제공값 우선, 없으면 total * goodRatio 추정
  const goodPostureSecNormalized =
    explicitGoodSec > 0
      ? explicitGoodSec
      : Math.round(totalDetectionSec * normalizedGoodPostureRatio);

  // 신 API: weekStartDate/weekEndDate / 구 API: from/to
  const from =
    typeof raw.weekStartDate === "string" ? raw.weekStartDate
    : typeof raw.from === "string" ? raw.from
    : "";
  const to =
    typeof raw.weekEndDate === "string" ? raw.weekEndDate
    : typeof raw.to === "string" ? raw.to
    : "";

  return {
    from,
    to,
    days,
    totalDetectionSec,
    goodPostureSec: goodPostureSecNormalized,
    turtleNeckTotalSec: turtleSec,
    roundShoulderTotalSec: finalRound,
    shoulderAsymmetryTotalSec: finalAsym,
    darkEnvTotalSec: darkSec,
    goodPostureRatio: normalizedGoodPostureRatio,
    worstWeekday:
      typeof raw.worstWeekday === "string" ? raw.worstWeekday
      : typeof raw.worst_weekday === "string" ? (raw.worst_weekday as string)
      : null,
  };
}

export function getDashboardWeekly(from: string) {
  return request<RawWeeklyDashboard>(`/dashboard/weekly?from=${from}`, { method: "GET" }, true)
    .then(normalizeWeeklyDashboard);
}

function normalizeDailyDashboard(raw: RawDailyDashboard): DailyDashboard {
  const source = Array.isArray(raw.slots) ? raw.slots[0] ?? raw : raw;
  const slotIndex = Math.max(0, Math.min(7, Math.trunc(toApiNumber(source.slotIndex))));
  const turtleNeckCount = toApiNumber(source.turtleNeckCount ?? raw.turtleNeckCount);
  const roundShoulderCount = toApiNumber(source.roundShoulderCount ?? raw.roundShoulderCount);
  const shoulderAsymmetryCount = toApiNumber(source.shoulderAsymmetryCount ?? raw.shoulderAsymmetryCount);
  const shoulderIssueCount = toApiNumber(source.shoulderIssueCount ?? raw.shoulderIssueCount);
  const darkEnvCount = toApiNumber(source.darkEnvCount ?? raw.darkEnvCount);
  const singleBadCount =
    source.singleBadCount !== undefined
      ? toApiNumber(source.singleBadCount)
      : turtleNeckCount + roundShoulderCount + shoulderAsymmetryCount + shoulderIssueCount + darkEnvCount;

  return {
    date: typeof source.date === "string" ? source.date : "",
    slotIndex,
    startHour: toApiNumber(source.startHour, slotIndex * 3),
    endHour: toApiNumber(source.endHour, slotIndex * 3 + 3),
    goodPostureCount: toApiNumber(source.goodPostureCount),
    singleBadCount,
    overlappingCount: toApiNumber(source.overlappingCount),
  };
}

export function getDashboardDaily() {
  return request<RawDailyDashboard>("/dashboard/daily", { method: "GET" }, true)
    .then(normalizeDailyDashboard);
}

export function getDashboardTimeline(date: string) {
  return request<TimelineDashboard>(`/dashboard/timeline?date=${date}`, { method: "GET" }, true);
}

export function startDetectionSession(startedAt = new Date().toISOString()) {
  return request<DetectionSession>(
    "/sessions",
    { method: "POST", body: JSON.stringify({ startedAt }) },
    true,
  );
}

export function getCurrentDetectionSession() {
  if (Date.now() < currentSessionBackoffUntil) {
    const error = new Error("세션 조회 요청을 잠시 후 다시 시도해주세요.") as Error & {
      status?: number;
    };
    error.status = 429;
    return Promise.reject(error);
  }
  if (currentSessionRequest) return currentSessionRequest;

  currentSessionRequest = request<DetectionSession | null>(
    "/sessions/current",
    { method: "GET" },
    true,
  ).catch((error: unknown) => {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
    if (status === 429) currentSessionBackoffUntil = Date.now() + 60_000;
    else if (status >= 500) currentSessionBackoffUntil = Date.now() + 20_000;
    throw error;
  }).finally(() => {
    currentSessionRequest = null;
  });

  return currentSessionRequest;
}

export function endDetectionSession(sessionId: string, endedAt = new Date().toISOString()) {
  return request<{
    sessionId: string;
    totalDurationSec: number;
    goodPostureSec: number;
    turtleNeckSec: number;
    shoulderIssueSec: number;
    darkEnvSec: number;
    goodPostureCount: number;
    turtleNeckCount: number;
    shoulderIssueCount: number;
    darkEnvCount: number;
    healthScore: number;
    newBadges: { code: string; name: string }[];
  }>(
    `/sessions/${sessionId}/end`,
    { method: "POST", body: JSON.stringify({ endedAt }) },
    true,
  );
}

export function postSessionEvents(sessionId: string, events: DetectionSessionEvent[]) {
  return request<{ accepted: number }>(
    `/sessions/${sessionId}/events`,
    { method: "POST", body: JSON.stringify({ events }) },
    true,
  );
}

export function postDashboardTimeline(body: {
  date: string;
  time: string;
  dominantState: DetectionState;
  message: string;
}) {
  return request<{ accepted: number }>(
    "/dashboard/timeline",
    { method: "POST", body: JSON.stringify(body) },
    true,
  );
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
