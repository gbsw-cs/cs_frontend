import { NextRequest, NextResponse } from "next/server";
import { buildAiHeaders } from "../../../../api/ai/auth";
import { appendDetectionResultCsv, appendSentPayloadCsv } from "../../../_lib/csvLog";

export const runtime = "nodejs";

function getPostureBatchUrl() {
  const base = process.env.AI_API_BASE_URL ?? "http://localhost:8000";
  return `${base.replace(/\/$/, "")}/v1/posture/detect/batch`;
}

function getPostureResult(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const result = (data as { data?: { result?: unknown } }).data?.result;
  if (!result || typeof result !== "object") return null;
  return result as { detected?: boolean; message?: string };
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  if (!payload?.id || !payload?.frame || !payload?.baseline || !Array.isArray(payload.frames)) {
    return NextResponse.json(
      { message: "posture batch 요청 데이터가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await appendSentPayloadCsv("posture_detect_batch", payload);
    const response = await fetch(getPostureBatchUrl(), {
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
  } catch {
    return NextResponse.json(
      { message: "posture detect 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
