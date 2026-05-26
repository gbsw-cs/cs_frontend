import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../../api/ai/auth";
import { appendSentPayloadCsv } from "../../_lib/csvLog";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 10_000;

function getBaselineUrl() {
  const base = process.env.AI_API_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/v1/baseline/cal`;
  if (process.env.AI_API_URL) {
    return process.env.AI_API_URL
      .replace(/\/v1\/posture\/detect\/?$/, "/v1/baseline/cal")
      .replace(/\/posture\/detect\/?$/, "/baseline/cal");
  }
  const fallbackBase = "http://3.38.108.207/ai";
  return `${fallbackBase}/v1/baseline/cal`;
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
  const baselineUrl = getBaselineUrl();
  const payload = await request.json().catch(() => null);
  if (!payload?.id || !Array.isArray(payload.frames)) {
    return NextResponse.json(
      { message: "baseline 요청 데이터가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await appendSentPayloadCsv("baseline_cal", payload);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const response = await fetch(baselineUrl, {
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
      console.error("[baseline/cal] AI server error", response.status, data);
    }
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    console.error("[baseline/cal] fetch failed:", err);
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "AI baseline 서버 응답 시간이 초과되었습니다."
        : "AI baseline 서버에 연결할 수 없습니다.";
    return NextResponse.json(
      { message, code: "AI_BASELINE_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
