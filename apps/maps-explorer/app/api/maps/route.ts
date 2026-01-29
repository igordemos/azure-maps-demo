import { NextResponse } from "next/server";
import { getMapsAccessToken } from "@/app/lib/auth/token";
import { buildQueryString, isPathSafe, normalizePath } from "@/app/lib/validation";
import type { ApiResponse, RequestShape } from "@/app/lib/types";

const SAFE_HEADERS = [
  "content-type",
  "x-ms-request-id",
  "x-ms-correlation-request-id",
  "x-ms-azuremaps-tracking-id",
];

export async function POST(request: Request) {
  let payload: RequestShape | null = null;
  try {
    payload = (await request.json()) as RequestShape;
  } catch {
    return NextResponse.json(
      {
        meta: {
          status: 400,
          statusText: "Bad Request",
          headers: {},
          durationMs: 0,
          url: "",
        },
        body: { message: "Invalid JSON body." },
        raw: "",
        errorCode: "invalid_json",
      } satisfies ApiResponse,
      { status: 400 }
    );
  }

  const path = normalizePath(payload.path || "");
  if (!isPathSafe(path)) {
    return NextResponse.json(
      {
        meta: {
          status: 400,
          statusText: "Invalid Path",
          headers: {},
          durationMs: 0,
          url: "",
        },
        body: { message: "Endpoint path is invalid." },
        raw: "",
        errorCode: "invalid_path",
      } satisfies ApiResponse,
      { status: 400 }
    );
  }

  const query = buildQueryString(payload.params || {});
  const method = (payload.method || "GET").toUpperCase();
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
  if (!allowedMethods.includes(method as (typeof allowedMethods)[number])) {
    return NextResponse.json(
      {
        meta: {
          status: 400,
          statusText: "Invalid Method",
          headers: {},
          durationMs: 0,
          url: "",
        },
        body: { message: "Unsupported HTTP method." },
        raw: "",
        errorCode: "invalid_method",
      } satisfies ApiResponse,
      { status: 400 }
    );
  }
  const baseUrl = payload.baseUrl ?? process.env.AZURE_MAPS_BASE_URL ?? "https://atlas.microsoft.com";
  let normalizedBase = "";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") {
      throw new Error("invalid_base_url");
    }
    if (parsed.search || parsed.hash) {
      throw new Error("invalid_base_url");
    }
    normalizedBase = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return NextResponse.json(
      {
        meta: {
          status: 400,
          statusText: "Invalid Base URL",
          headers: {},
          durationMs: 0,
          url: "",
        },
        body: { message: "Base URL must be a valid https URL without query or hash." },
        raw: "",
        errorCode: "invalid_base_url",
      } satisfies ApiResponse,
      { status: 400 }
    );
  }

  const url = `${normalizedBase}/${path}${query ? `?${query}` : ""}`;

  const mapsKey = payload.auth?.apiKey ?? process.env.AZURE_MAPS_KEY;
  const mapsClientId = payload.auth?.clientId ?? process.env.AZURE_MAPS_CLIENT_ID;

  let authHeaders: Record<string, string> = {};
  if (mapsKey) {
    authHeaders = { "subscription-key": mapsKey };
  } else {
    if (!mapsClientId) {
      return NextResponse.json(
        {
          meta: {
            status: 500,
            statusText: "Missing Azure Maps Client ID",
            headers: {},
            durationMs: 0,
            url,
          },
          body: { message: "AZURE_MAPS_CLIENT_ID is not set." },
          raw: "",
          errorCode: "missing_maps_client_id",
        } satisfies ApiResponse,
        { status: 500 }
      );
    }

    try {
      const token = await getMapsAccessToken();
      authHeaders = {
        Authorization: `Bearer ${token}`,
        "x-ms-client-id": mapsClientId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "token_error";
      return NextResponse.json(
        {
          meta: {
            status: 500,
            statusText: "Token Error",
            headers: {},
            durationMs: 0,
            url,
          },
          body: { message },
          raw: "",
          errorCode: message.startsWith("missing_") ? "missing_credentials" : "token_error",
        } satisfies ApiResponse,
        { status: 500 }
      );
    }
  }

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  const requestBody = payload.body ? JSON.stringify(payload.body) : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...authHeaders,
        ...(requestBody ? { "content-type": "application/json" } : {}),
      },
      body: requestBody,
      signal: controller.signal,
      cache: "no-store",
    });

    const durationMs = Date.now() - start;
    const rawText = await response.text();

    let body: unknown = rawText;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = rawText;
      }
    }

    const headers = SAFE_HEADERS.reduce<Record<string, string>>((acc, key) => {
      const value = response.headers.get(key);
      if (value) acc[key] = value;
      return acc;
    }, {});

    return NextResponse.json(
      {
        meta: {
          status: response.status,
          statusText: response.statusText,
          headers,
          durationMs,
          url,
        },
        body,
        raw: rawText,
      } satisfies ApiResponse,
      { status: response.status }
    );
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : "request_failed";
    return NextResponse.json(
      {
        meta: {
          status: 502,
          statusText: "Request Failed",
          headers: {},
          durationMs,
          url,
        },
        body: { message },
        raw: "",
        errorCode: "request_failed",
      } satisfies ApiResponse,
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
