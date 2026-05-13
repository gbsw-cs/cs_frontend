"use client";

import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export type LandmarkPoint = {
  x: number;
  y: number;
  z: number;
};

export type PostureFrame = {
  timestamp: string;
  visibility: number;
  nose: LandmarkPoint;
  left_ear: LandmarkPoint;
  right_ear: LandmarkPoint;
  left_shoulder: LandmarkPoint;
  right_shoulder: LandmarkPoint;
  brightness: number;
};

const MISSING_POINT: LandmarkPoint = { x: -2, y: -2, z: -2 };
const Z_SCALE = 0.1;
const WASM_PATH = "/mediapipe/wasm";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

function getPoseLandmarker() {
  poseLandmarkerPromise ??= FilesetResolver.forVisionTasks(WASM_PATH).then((vision) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: POSE_MODEL_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    }),
  );

  return poseLandmarkerPromise;
}

function toPoint(landmark?: NormalizedLandmark): LandmarkPoint {
  if (!landmark) return MISSING_POINT;
  return {
    x: Number(landmark.x.toFixed(6)),
    y: Number(landmark.y.toFixed(6)),
    z: Number((landmark.z * Z_SCALE).toFixed(6)),
  };
}

function visibilityOf(...landmarks: Array<NormalizedLandmark | undefined>) {
  const values = landmarks
    .map((landmark) => landmark?.visibility)
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6));
}

export function captureBrightness(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return 255;

  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 255;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let total = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    total += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  }

  return Math.round(total / (pixels.length / 4));
}

export async function createPostureFrame(video: HTMLVideoElement): Promise<PostureFrame | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  const brightness = captureBrightness(video);
  let landmarks: NormalizedLandmark[] | undefined;

  try {
    const poseLandmarker = await getPoseLandmarker();
    const result = poseLandmarker.detectForVideo(video, performance.now());
    landmarks = result.landmarks[0];
  } catch {
    landmarks = undefined;
  }

  const nose = landmarks?.[0];
  const leftEar = landmarks?.[7];
  const rightEar = landmarks?.[8];
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];

  return {
    timestamp: new Date().toISOString(),
    visibility: visibilityOf(nose, leftEar, rightEar, leftShoulder, rightShoulder),
    nose: toPoint(nose),
    left_ear: toPoint(leftEar),
    right_ear: toPoint(rightEar),
    left_shoulder: toPoint(leftShoulder),
    right_shoulder: toPoint(rightShoulder),
    brightness,
  };
}

export function isUsablePostureFrame(frame: PostureFrame) {
  return (
    frame.visibility >= 0.2 &&
    frame.nose.x !== -2 &&
    frame.left_shoulder.x !== -2 &&
    frame.right_shoulder.x !== -2
  );
}
