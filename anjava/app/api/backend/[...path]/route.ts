import { NextRequest, NextResponse } from "next/server";

function getBackendBase() {
  const configured = process.env.BACKEND_API_URL || "http://cs-backend.p-e.kr/api";
  const url = new URL(configured);
  if (url.hostname === "cs-backend.p-e.kr") {
    url.protocol = "http:";
    url.pathname = "/api";
    url.search = "";
    url.hash = "";
  }
  return url.toString().replace(/\/$/, "");
}

const BACKEND = getBackendBase();
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
] as const;
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "location",
  "set-cookie",
] as const;

type Context = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Context) {
  const { path } = await ctx.params;
  const url = new URL(`${BACKEND}/${path.join("/")}`);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const reqHeaders = new Headers();
  for (const header of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers.get(header);
    if (value) reqHeaders.set(header, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await req.text() : undefined;

  const res = await fetch(url.toString(), {
    method: req.method,
    headers: reqHeaders,
    body: body || undefined,
    redirect: "manual",
  });

  const resHeaders = new Headers();
  for (const header of FORWARDED_RESPONSE_HEADERS) {
    const value = res.headers.get(header);
    if (value) resHeaders.set(header, value);
  }

  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
