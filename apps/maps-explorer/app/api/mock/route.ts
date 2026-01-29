import { NextResponse } from "next/server";
import type { ApiResponse, RequestShape } from "@/app/lib/types";
import { normalizePath } from "@/app/lib/validation";

const sampleGeocode = {
  summary: {
    query: "1 Microsoft Way, Redmond, WA",
    type: "Geocode",
    numResults: 1,
    offset: 0,
    totalResults: 1,
    fuzzyLevel: 1,
  },
  results: [
    {
      type: "Point Address",
      position: {
        lat: 47.6396,
        lon: -122.1282,
      },
      address: {
        streetNumber: "1",
        streetName: "Microsoft Way",
        municipality: "Redmond",
        countrySubdivision: "WA",
        postalCode: "98052",
        countryCode: "US",
        country: "United States",
      },
    },
  ],
};

const sampleReverse = {
  summary: {
    query: "47.6396,-122.1282",
    type: "Reverse Geocode",
    numResults: 1,
    offset: 0,
    totalResults: 1,
  },
  addresses: [
    {
      address: {
        streetNumber: "1",
        streetName: "Microsoft Way",
        municipality: "Redmond",
        countrySubdivision: "WA",
        postalCode: "98052",
        countryCode: "US",
        country: "United States",
      },
      position: {
        lat: 47.6396,
        lon: -122.1282,
      },
    },
  ],
};

export async function POST(request: Request) {
  let payload: RequestShape | null = null;
  try {
    payload = (await request.json()) as RequestShape;
  } catch {
    payload = null;
  }

  const path = normalizePath(payload?.path ?? "");
  const isReverse = path.includes("reverse");
  const start = Date.now();

  const body = isReverse ? sampleReverse : sampleGeocode;

  return NextResponse.json(
    {
      meta: {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        durationMs: Date.now() - start,
        url: `mock://${path || "search/address/json"}`,
      },
      body,
      raw: JSON.stringify(body, null, 2),
    } satisfies ApiResponse,
    { status: 200 }
  );
}
