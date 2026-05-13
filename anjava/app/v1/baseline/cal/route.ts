import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../../api/ai/auth";
import { appendSentPayloadCsv } from "../../_lib/csvLog";

export const runtime = "nodejs";

function getBaselineUrl() {
  const base = process.env.AI_API_BASE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/v1/baseline/cal`;
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload?.id || !Array.isArray(payload.frames)) {
    return NextResponse.json(
      { message: "baseline 요청 데이터가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await appendSentPayloadCsv("baseline_cal", payload);
    const response = await fetch(getBaselineUrl(), {
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
      { message: "baseline 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
