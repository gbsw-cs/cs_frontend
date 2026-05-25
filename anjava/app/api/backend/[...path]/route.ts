import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_API_URL || "http://cs-backend.p-e.kr/api";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Context) {
  const { path } = await ctx.params;
  const url = new URL(`${BACKEND}/${path.join("/")}`);
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete("host");

  const res = await fetch(url, {
    method: req.method,
    headers: reqHeaders,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
  });

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");

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
