import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../auth";

export const runtime = "nodejs";

function getBaselineUrl() {
  if (process.env.AI_API_BASE_URL) {
    return `${process.env.AI_API_BASE_URL.replace(/\/$/, "")}/baseline/cal`;
  }
  if (process.env.AI_API_URL) {
    return process.env.AI_API_URL.replace(/\/detect\/?$/, "/baseline/cal");
  }
  return null;
}

export async function POST(request: NextRequest) {
  const baselineUrl = getBaselineUrl();
  if (!baselineUrl) {
    return NextResponse.json(
      { message: "AI_API_BASE_URL 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const payload = await request.json().catch(() => ({}));

  try {
    const response = await fetch(baselineUrl, {
      method: "POST",
      headers: buildAiHeaders(),
      body: JSON.stringify({ durationSec: 10, ...payload }),
      cache: "no-store",
    });

    const text = await response.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "AI baseline 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
