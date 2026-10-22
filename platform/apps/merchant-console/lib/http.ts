import { NextResponse } from "next/server";
import { MerchantIdentityError } from "./identity.js";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new HttpError(403, "ORIGIN_REQUIRED");
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new HttpError(403, "ORIGIN_DENIED"); }
  const expectedOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (!expectedOrigin || parsed.origin !== new URL(expectedOrigin).origin) throw new HttpError(403, "ORIGIN_DENIED");
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}

export function routeErrorResponse(error: unknown): NextResponse {
  if (error instanceof KnowledgeError) {
    const status = error.code.includes("NOT_FOUND") ? 404
      : error.code.includes("CROSS_WORKSPACE") ? 403
        : error.code.includes("CONFLICT") || error.code.includes("EXISTS") ? 409 : 400;
    return NextResponse.json({ error: error.code }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof MerchantIdentityError) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : 403;
    return NextResponse.json({ error: error.code }, { status, headers: { "Cache-Control": "no-store" } });
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  if (typeof error === "object" && error !== null && "status" in error && "code" in error
    && typeof error.status === "number" && typeof error.code === "string") {
    return NextResponse.json({ error: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  process.stderr.write(`${JSON.stringify({ level: "error", event: "merchant_api.request_failed", name: error instanceof Error ? error.name : "UnknownError" })}\n`);
  return NextResponse.json({ error: "REQUEST_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLocaleLowerCase("en-US").startsWith("application/json")) {
    throw new HttpError(415, "JSON_CONTENT_TYPE_REQUIRED");
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new HttpError(413, "REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new HttpError(400, "REQUEST_BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, 30_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "REQUEST_TOO_LARGE"); }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "REQUEST_BODY_INVALID");
  } finally {
    clearTimeout(timeout);
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "JSON_BODY_INVALID");
  }
}

export async function parseBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new HttpError(413, "REQUEST_TOO_LARGE");
  }
  if (!request.body) throw new HttpError(400, "REQUEST_BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, 30_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "REQUEST_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error: unknown) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "REQUEST_BODY_INVALID");
  } finally {
    clearTimeout(timeout);
  }
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLocaleLowerCase("en-US").startsWith("multipart/form-data; boundary=")) {
    throw new HttpError(415, "MULTIPART_FORM_DATA_REQUIRED");
  }
  const buffer = new ArrayBuffer(size);
  const boundedBytes = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    boundedBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const blob = new Blob([buffer], { type: contentType });
  try {
    return await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: blob }).formData();
  } catch {
    throw new HttpError(400, "MULTIPART_FORM_DATA_INVALID");
  }
}

export function assertKnownFields(formData: FormData, allowed: readonly string[]): void {
  for (const key of formData.keys()) {
    if (!allowed.includes(key) || formData.getAll(key).length !== 1) throw new HttpError(400, "INVALID_FORM_FIELDS");
  }
}
