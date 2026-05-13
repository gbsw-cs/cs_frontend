import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../auth";

function getHealthScoreUrl() {
  const base = process.env.AI_API_BASE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/v1/health/score`;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ message: "요청 데이터가 없습니다." }, { status: 400 });
  }

  try {
    const response = await fetch(getHealthScoreUrl(), {
      method: "POST",
      headers: buildAiHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();
    let data: unknown = {};
    if (text) {
      try { data = JSON.parse(text); } catch { data = { message: text }; }
    }

    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ message: "AI 서버에 연결할 수 없습니다." }, { status: 502 });
  }
}
