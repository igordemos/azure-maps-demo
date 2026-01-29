import { NextResponse } from "next/server";
import { getMapsAccessToken } from "@/app/lib/auth/token";

const DEFAULT_BASE_URL =
  process.env.AZURE_MAPS_BASE_URL ?? "https://atlas.microsoft.com";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const toNumber = (value: string | null) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getSafeBaseUrl = (value?: string) => {
  const candidate = value ?? DEFAULT_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") throw new Error("invalid_base_url");
    if (parsed.search || parsed.hash) throw new Error("invalid_base_url");
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
};

type MapRequestBody = {
  lat?: number;
  lon?: number;
  zoom?: number;
  width?: number;
  height?: number;
  baseUrl?: string;
  auth?: {
    apiKey?: string;
    clientId?: string;
  };
};

const buildMapResponse = async (input: {
  lat: number | null;
  lon: number | null;
  zoomRaw: number;
  widthRaw: number;
  heightRaw: number;
  baseUrl?: string;
  auth?: MapRequestBody["auth"];
}) => {
  const { lat, lon, zoomRaw, widthRaw, heightRaw, baseUrl, auth } = input;

  if (lat === null || lon === null) {
    return NextResponse.json(
      { message: "lat and lon query params are required." },
      { status: 400 }
    );
  }

  const zoom = clamp(Math.round(zoomRaw), 1, 20);
  const width = clamp(Math.round(widthRaw), 240, 1280);
  const height = clamp(Math.round(heightRaw), 160, 960);

  const safeBaseUrl = getSafeBaseUrl(baseUrl);
  if (!safeBaseUrl) {
    return NextResponse.json(
      { message: "AZURE_MAPS_BASE_URL must be a valid https URL." },
      { status: 500 }
    );
  }

  const mapUrl = new URL(`${safeBaseUrl}/map/static/png`);
  mapUrl.searchParams.set("api-version", "2022-08-01");
  mapUrl.searchParams.set("format", "png");
  mapUrl.searchParams.set("center", `${lon},${lat}`);
  mapUrl.searchParams.set("zoom", String(zoom));
  mapUrl.searchParams.set("layer", "basic");
  mapUrl.searchParams.set("style", "main");
  mapUrl.searchParams.set("width", String(width));
  mapUrl.searchParams.set("height", String(height));

  const mapsKey = auth?.apiKey ?? process.env.AZURE_MAPS_KEY;
  const mapsClientId = auth?.clientId ?? process.env.AZURE_MAPS_CLIENT_ID;

  let authHeaders: Record<string, string> = {};
  if (mapsKey) {
    authHeaders = { "subscription-key": mapsKey };
  } else {
    if (!mapsClientId) {
      return NextResponse.json(
        { message: "AZURE_MAPS_CLIENT_ID is not set." },
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
        { message },
        { status: 500 }
      );
    }
  }

  const upstream = await fetch(mapUrl.toString(), {
    method: "GET",
    headers: {
      ...authHeaders,
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return NextResponse.json(
      { message: "Failed to fetch map image.", details: text },
      { status: upstream.status }
    );
  }

  const buffer = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "image/png";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=60",
    },
  });
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = toNumber(searchParams.get("lat"));
  const lon = toNumber(searchParams.get("lon"));
  const zoomRaw = toNumber(searchParams.get("zoom")) ?? 14;
  const widthRaw = toNumber(searchParams.get("width")) ?? 640;
  const heightRaw = toNumber(searchParams.get("height")) ?? 320;

  return buildMapResponse({
    lat,
    lon,
    zoomRaw,
    widthRaw,
    heightRaw,
  });
}

export async function POST(request: Request) {
  let payload: MapRequestBody | null = null;
  try {
    payload = (await request.json()) as MapRequestBody;
  } catch {
    payload = null;
  }

  const lat = typeof payload?.lat === "number" ? payload.lat : null;
  const lon = typeof payload?.lon === "number" ? payload.lon : null;
  const zoomRaw = typeof payload?.zoom === "number" ? payload.zoom : 14;
  const widthRaw = typeof payload?.width === "number" ? payload.width : 640;
  const heightRaw = typeof payload?.height === "number" ? payload.height : 320;

  return buildMapResponse({
    lat,
    lon,
    zoomRaw,
    widthRaw,
    heightRaw,
    baseUrl: payload?.baseUrl,
    auth: payload?.auth,
  });
}
