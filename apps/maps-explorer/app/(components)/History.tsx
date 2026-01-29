"use client";

import type { HistoryEntry } from "../lib/types";

type Props = {
  entries: HistoryEntry[];
  onRerun: (entry: HistoryEntry) => void;
  onCopyCurl: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
};

export default function History({ entries, onRerun, onCopyCurl, onDelete }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">History</h2>
        <span className="text-xs text-slate-500">Last 10</span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200/70 bg-white/60 p-4 text-xs text-slate-400">
          Run a request to capture history.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-xs text-slate-600 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-700">
                    {entry.request.path}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(entry.timestamp).toLocaleTimeString()} · {entry.status} · {entry.durationMs}ms
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onRerun(entry)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    Re-run
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyCurl(entry)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
                  >
                    cURL
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
