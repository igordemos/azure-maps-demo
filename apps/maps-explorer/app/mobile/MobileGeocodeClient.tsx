"use client";

import { useEffect, useMemo, useState } from "react";
import MapPreview from "../(components)/MapPreview";
import type { ApiResponse, RequestShape } from "../lib/types";

const DEFAULT_QUERY = "6301 Owensmouth Ave, Woodland Hills, CA 91367";
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_AZURE_MAPS_BASE_URL ?? "https://atlas.microsoft.com";

export default function MobileGeocodeClient() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [limit, setLimit] = useState("1");
  const [apiKey, setApiKey] = useState("");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mapHeight, setMapHeight] = useState(520);

  useEffect(() => {
    const stored = sessionStorage.getItem("maps-explorer-api-key");
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem("maps-explorer-api-key", apiKey);
    } else {
      sessionStorage.removeItem("maps-explorer-api-key");
    }
  }, [apiKey]);

  useEffect(() => {
    const updateHeight = () => {
      const height = Math.max(360, window.innerHeight - 260);
      setMapHeight(height);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  const isReady = useMemo(() => query.trim().length > 0, [query]);

  const runGeocode = async () => {
    if (!isReady) return;
    setIsLoading(true);
    try {
      const request: RequestShape = {
        path: "geocode",
        params: {
          "api-version": "2025-01-01",
          query: query.trim(),
          limit: limit || "1",
          countrySet: "US",
        },
        method: "GET",
        baseUrl: DEFAULT_BASE_URL,
        auth: apiKey ? { apiKey } : undefined,
      };

      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      setResponse(data);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh flex-col gap-4 px-4 pb-6 pt-4">
      <header className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Mobile Geocode
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Find certified locations fast
        </h1>
      </header>

      <section className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <label className="text-[11px] font-semibold text-slate-500">
            Address
          </label>
          <input
            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter an address"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runGeocode}
              disabled={!isReady || isLoading}
              className="rounded-2xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Searching…" : "Search"}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Limit</span>
              <select
                className="rounded-lg border border-slate-200/70 bg-white px-2 py-1 text-xs text-slate-700"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold text-slate-500">
              API Key (optional)
            </label>
            <input
              type="password"
              className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-xs text-slate-800 shadow-sm"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="Use server default if empty"
            />
          </div>
        </div>
      </section>

      <section className="flex-1 rounded-3xl border border-slate-200/70 bg-white/80 p-2 shadow-inner">
        <MapPreview
          response={response}
          isLoading={isLoading}
          authMode="key"
          apiKey={apiKey}
          clientId=""
          mapHeight={mapHeight}
          showEmptyState
        />
      </section>
    </div>
  );
}
