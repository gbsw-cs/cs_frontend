import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../auth";

const AI_API_URL =
  process.env.AI_API_URL ?? "http://127.0.0.1:8000/v1/posture/detect";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload?.image) {
    return NextResponse.json(
      { message: "분석할 이미지가 없습니다." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(AI_API_URL, {
      method: "POST",
      headers: buildAiHeaders(),
      body: JSON.stringify(payload),
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
      { message: "AI 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
