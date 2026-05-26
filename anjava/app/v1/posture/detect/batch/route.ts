import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../../../api/ai/auth";
import { appendDetectionResultCsv, appendSentPayloadCsv } from "../../../_lib/csvLog";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 10_000;

function getPostureBatchUrl() {
  const base = process.env.AI_API_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/v1/posture/detect/batch`;
  if (process.env.AI_API_URL) {
    return process.env.AI_API_URL
      .replace(/\/v1\/posture\/detect\/?$/, "/v1/posture/detect/batch")
      .replace(/\/posture\/detect\/?$/, "/posture/detect/batch");
  }
  const fallbackBase = "http://3.38.108.207/ai";
  return `${fallbackBase}/v1/posture/detect/batch`;
}

function getPostureResult(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const result = (data as { data?: { result?: unknown } }).data?.result;
  if (!result || typeof result !== "object") return null;
  return result as { detected?: boolean; message?: string };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: NextRequest) {
  const postureBatchUrl = getPostureBatchUrl();
  const payload = await request.json().catch(() => null);
  if (!payload?.id || !Array.isArray(payload.frames)) {
    return NextResponse.json(
      { message: "posture batch 요청 데이터가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await appendSentPayloadCsv("posture_detect_batch", payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(postureBatchUrl, {
      method: "POST",
      headers: buildAiHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const text = await response.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      console.error("FastAPI posture batch failed", response.status, data);
    } else {
      const result = getPostureResult(data);
      if (result?.detected) {
        console.log(`자세 감지됨: ${result.message ?? "자세 이상이 감지되었습니다."}`);
      } else if (result?.message) {
        console.log(`자세 정상: ${result.message}`);
      } else {
        console.log("자세 분석 완료", data);
      }
      await appendDetectionResultCsv("posture_detect_batch", payload, response.status, data);
    }

    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[posture/detect/batch] fetch failed:", err);
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "AI posture detect 서버 응답 시간이 초과되었습니다."
        : "AI posture detect 서버에 연결할 수 없습니다.";
    return NextResponse.json(
      { message, code: "AI_POSTURE_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
