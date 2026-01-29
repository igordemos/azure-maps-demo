"use client";

import { useMemo, useState } from "react";
import type { ApiResponse } from "../lib/types";

const tabs = ["Body", "Raw", "Headers", "Status/Timing"] as const;

type Props = {
  response: ApiResponse | null;
  isLoading: boolean;
};

export default function ResultTabs({ response, isLoading }: Props) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Body");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  const prettyBody = useMemo(() => {
    if (!response) return "No response yet.";
    if (typeof response.body === "string") {
      try {
        const parsed = JSON.parse(response.body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return response.body;
      }
    }
    try {
      return JSON.stringify(response.body, null, 2);
    } catch {
      return String(response.body);
    }
  }, [response]);

  const headerText = useMemo(() => {
    if (!response) return "";
    return Object.entries(response.meta.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  }, [response]);

  const activeText = useMemo(() => {
    if (!response) return "";
    if (active === "Body") return prettyBody;
    if (active === "Raw") return response.raw || "";
    if (active === "Headers") return headerText;
    if (active === "Status/Timing") {
      return `Status: ${response.meta.status} ${response.meta.statusText}\nDuration: ${response.meta.durationMs}ms\nURL: ${response.meta.url}`;
    }
    return "";
  }, [active, headerText, prettyBody, response]);

  const handleCopy = async () => {
    if (!activeText) return;
    try {
      await navigator.clipboard.writeText(activeText);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 1500);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 1500);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Results</h2>
        <div className="flex items-center gap-3">
          {isLoading && (
            <span className="text-xs font-semibold text-slate-500">Loading…</span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!response || !activeText}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copyStatus === "copied"
              ? "Copied"
              : copyStatus === "error"
              ? "Copy failed"
              : "Copy"}
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              active === tab
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="min-h-[260px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-700 shadow-inner">
        {!response && !isLoading ? (
          <div className="text-slate-400">
            Run a request to see response details.
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words">{activeText}</pre>
        )}
      </div>
    </div>
  );
}
