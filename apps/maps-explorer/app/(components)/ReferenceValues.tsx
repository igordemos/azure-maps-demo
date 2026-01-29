"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const referenceUrl =
  "https://learn.microsoft.com/en-us/rest/api/maps/?view=rest-maps-2025-01-01";

type CopyState = {
  value: string;
  timestamp: number;
} | null;

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState<CopyState>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied({ value, timestamp: Date.now() });
    } catch {
      setCopied({ value: "", timestamp: Date.now() });
    }
  }, [value]);

  useEffect(() => {
    if (!copied) return;
    const handle = window.setTimeout(() => setCopied(null), 1400);
    return () => window.clearTimeout(handle);
  }, [copied]);

  const labelText = copied?.value === value ? "Copied" : label;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:text-slate-900"
      aria-label={`Copy ${label}`}
    >
      {labelText}
    </button>
  );
}

export default function ReferenceValues() {
  const testAddresses = useMemo(
    () => [
      {
        label: "Farmers Insurance",
        value: "6301 Owensmouth Ave, Woodland Hills, CA 91367",
      },
      {
        label: "Farmers Insurance (Misspelled)",
        value: "6301 Owesmonth , Wodland Hill, California 91367",
      },
      {
        label: "Farmers Insurance Coordinates",
        value: "-118.60213,34.184559",
      },
      {
        label: "Farmers Insurance Group",
        value: "6301 Owensmouth Ave Woodland Hills, CA 91367 USA",
      },
      {
        label: "Zurich North America",
        value: "1400 American Ln # 20, Schaumburg, Illinois",
      },
      {
        label: "Empire State Building",
        value: "20 W 34th St New York, NY 10001 USA",
      },
      {
        label: "Willis Tower",
        value: "233 S Wacker Dr Chicago, IL 60606 USA",
      },
      {
        label: "Space Center Houston",
        value: "1601 E NASA Pkwy Houston, TX 77058 USA",
      },
      {
        label: "Space Needle",
        value: "400 Broad St Seattle, WA 98109 USA",
      },
    ],
    []
  );

  const testIps = useMemo(
    () => [
      {
        label: "8.8.8.8 (Google Public DNS)",
        value: "8.8.8.8",
        note: "Commonly resolves to US in public geo DBs",
      },
      {
        label: "8.8.4.4 (Google Public DNS)",
        value: "8.8.4.4",
        note: "Commonly resolves to US",
      },
      {
        label: "1.1.1.1 (Cloudflare DNS)",
        value: "1.1.1.1",
        note: "Example lookup shown as AU (Brisbane)",
      },
      {
        label: "9.9.9.9 (Quad9 DNS)",
        value: "9.9.9.9",
        note: "Example lookup shown as US",
      },
      {
        label: "208.67.222.222 (OpenDNS)",
        value: "208.67.222.222",
        note: "Example lookup shown as US",
      },
    ],
    []
  );

  const countryIps = useMemo(
    () => [
      {
        country: "Japan (JP)",
        items: [
          "52.69.212.18",
          "139.162.68.146",
          "202.224.39.11",
          "153.223.200.3",
          "118.243.126.205",
        ],
      },
      {
        country: "Brazil (BR)",
        items: [
          "69.6.213.74",
          "187.85.20.143",
          "177.12.168.69",
          "201.75.48.195",
          "186.227.207.247",
          "191.233.200.14",
          "191.234.144.16",
          "191.234.152.3",
        ],
      },
      {
        country: "Switzerland (CH)",
        items: [
          "82.197.168.86",
          "212.25.27.121",
          "213.3.210.43",
          "213.230.56.25",
          "82.220.12.52",
        ],
      },
    ],
    []
  );

  return (
    <section
      id="reference-values"
      className="flex flex-col gap-6 rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-sm"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-900">Reference Values</h2>
          <a
            href="#query-parameters"
            className="text-xs font-semibold text-sky-600 hover:text-sky-700"
          >
            Back to Query Parameters
          </a>
        </div>
        <p className="text-sm text-slate-600">Copy and paste these samples during demos.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-inner">
          <h3 className="text-sm font-semibold text-slate-700">Azure Maps Reference Documentation</h3>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
              <div>
                <div className="text-xs font-semibold text-slate-500">API Version</div>
                <div className="font-semibold text-slate-800">2025-01-01</div>
              </div>
              <CopyButton value="2025-01-01" label="Copy" />
            </div>
            <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">Documentation</span>
                <CopyButton value={referenceUrl} label="Copy URL" />
              </div>
              <a
                className="break-all text-sm text-sky-600 hover:text-sky-700"
                href={referenceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {referenceUrl}
              </a>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-inner">
          <h3 className="text-sm font-semibold text-slate-700">Test Addresses</h3>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            {testAddresses.map((item) => (
              <li
                key={item.label}
                className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                  <CopyButton value={item.value} label="Copy" />
                </div>
                <div className="font-semibold text-slate-800">{item.value}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-inner">
        <h3 className="text-sm font-semibold text-slate-700">Test IP Addresses</h3>
        <p className="mt-2 text-xs text-slate-500">
          Known public IPs for general testing plus country-specific samples for validating ISO
          country/region codes.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {testIps.map((item) => (
              <div key={item.value} className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                  <CopyButton value={item.value} label="Copy" />
                </div>
                <div className="font-semibold text-slate-800">{item.value}</div>
                {item.note && <div className="text-[11px] text-slate-500">{item.note}</div>}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {countryIps.map((group) => (
              <div key={group.country} className="rounded-xl bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-500">{group.country}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-3">
                  {group.items.map((ip) => (
                    <div key={ip} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1">
                      <span className="font-semibold text-slate-800">{ip}</span>
                      <CopyButton value={ip} label="Copy" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
