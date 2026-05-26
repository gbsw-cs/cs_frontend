import { mkdir, appendFile } from "fs/promises";
import path from "path";

type Point = {
  x?: number;
  y?: number;
  z?: number;
};

type Frame = {
  timestamp?: string;
  visibility?: number;
  nose?: Point;
  left_ear?: Point;
  right_ear?: Point;
  left_shoulder?: Point;
  right_shoulder?: Point;
  brightness?: number;
};

type SentPayload = {
  id?: string;
  frame?: Frame;
  frames?: Frame[];
  baseline?: {
    neck_forward?: number;
    shoulder_diff?: number;
    brightness?: number;
    shoulder_width?: number;
    shoulder_z?: number;
    issued_at?: string;
    expires_at?: string;
    signature?: string;
  };
  z_threshold?: number;
  shoulder_threshold?: number;
  round_shoulder_ratio?: number;
  round_shoulder_z_threshold?: number;
  dark_mode?: boolean;
  dark_abs_threshold?: number;
  dark_relative_ratio?: number;
};

type DetectionLogPayload = {
  id?: string;
};

const CSV_HEADERS = [
  "logged_at",
  "route",
  "id",
  "frame_index",
  "timestamp",
  "visibility",
  "nose_x",
  "nose_y",
  "nose_z",
  "left_ear_x",
  "left_ear_y",
  "left_ear_z",
  "right_ear_x",
  "right_ear_y",
  "right_ear_z",
  "left_shoulder_x",
  "left_shoulder_y",
  "left_shoulder_z",
  "right_shoulder_x",
  "right_shoulder_y",
  "right_shoulder_z",
  "brightness",
  "baseline_signature",
  "baseline_brightness",
  "z_threshold",
  "shoulder_threshold",
  "round_shoulder_ratio",
  "round_shoulder_z_threshold",
  "dark_mode",
  "dark_abs_threshold",
  "dark_relative_ratio",
];

const DETECTION_HEADERS = [
  "logged_at",
  "route",
  "id",
  "status",
  "detected",
  "labels",
  "response_json",
];

function csvValue(value: unknown) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isCsvLoggingEnabled() {
  return process.env.AI_CSV_LOG_ENABLED === "1";
}

function pointValues(point?: Point) {
  return [point?.x, point?.y, point?.z];
}

function rowForFrame(route: string, payload: SentPayload, frame: Frame, index: number) {
  return [
    new Date().toISOString(),
    route,
    payload.id,
    index,
    frame.timestamp,
    frame.visibility,
    ...pointValues(frame.nose),
    ...pointValues(frame.left_ear),
    ...pointValues(frame.right_ear),
    ...pointValues(frame.left_shoulder),
    ...pointValues(frame.right_shoulder),
    frame.brightness,
    payload.baseline?.signature,
    payload.baseline?.brightness,
    payload.z_threshold,
    payload.shoulder_threshold,
    payload.round_shoulder_ratio,
    payload.round_shoulder_z_threshold,
    payload.dark_mode,
    payload.dark_abs_threshold,
    payload.dark_relative_ratio,
  ]
    .map(csvValue)
    .join(",");
}

function findDetectedLabels(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDetectedLabels(item, `${prefix}${index}.`));
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    if (
      typeof child === "boolean" &&
      child &&
      !["success", "ok", "valid"].includes(key.toLowerCase())
    ) {
      return [path];
    }
    if (typeof child === "object" && child !== null) {
      return findDetectedLabels(child, `${path}.`);
    }
    return [];
  });
}

export async function appendDetectionResultCsv(
  route: string,
  payload: DetectionLogPayload,
  status: number,
  result: unknown,
) {
  if (!isCsvLoggingEnabled()) return;

  const logDir = path.join(process.cwd(), "logs");
  const csvPath = path.join(logDir, "detected-posture-results.csv");
  const labels = findDetectedLabels(result);
  const row = [
    new Date().toISOString(),
    route,
    payload.id,
    status,
    labels.length > 0,
    labels.join("|"),
    JSON.stringify(result),
  ]
    .map(csvValue)
    .join(",");

  await mkdir(logDir, { recursive: true });
  const content = `${DETECTION_HEADERS.join(",")}\n${row}\n`;

  try {
    await appendFile(csvPath, content, { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
    await appendFile(csvPath, `${row}\n`);
  }

  if (labels.length > 0) {
    console.log(`자세 감지됨: ${labels.join(", ")}`);
  }
}

export async function appendSentPayloadCsv(route: string, payload: SentPayload) {
  if (!isCsvLoggingEnabled()) return;

  const logDir = path.join(process.cwd(), "logs");
  const csvPath = path.join(logDir, "sent-posture-data.csv");
  const frames = payload.frames?.length ? payload.frames : payload.frame ? [payload.frame] : [];
  if (frames.length === 0) return;

  await mkdir(logDir, { recursive: true });
  const rows = frames.map((frame, index) => rowForFrame(route, payload, frame, index));
  const content = `${CSV_HEADERS.join(",")}\n${rows.join("\n")}\n`;

  try {
    await appendFile(csvPath, content, { flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
    await appendFile(csvPath, `${rows.join("\n")}\n`);
  }
}
