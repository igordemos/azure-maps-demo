import type { Param } from "./types";

export const normalizePath = (path: string) => path.trim().replace(/^\/+/, "");

export const isPathSafe = (path: string) => {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (normalized.startsWith("http") || normalized.includes("://")) return false;
  if (normalized.includes("..")) return false;
  return true;
};

export const paramsToRecord = (params: Param[]) =>
  params.reduce<Record<string, string>>((acc, param) => {
    const key = param.key.trim();
    if (!key) return acc;
    acc[key] = param.value;
    return acc;
  }, {});

export const buildQueryString = (params: Record<string, string>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.set(key, String(value));
  });
  return search.toString();
};

export const isBaseUrlSafe = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.search || url.hash) return false;
    return true;
  } catch {
    return false;
  }
};

export const isReverseGeocodePath = (path: string) =>
  normalizePath(path).includes("search/address/reverse");

export const hasLatLonParam = (params: Record<string, string>) => {
  if (params.query && params.query.includes(",")) return true;
  const hasLat = Object.keys(params).some((key) => key.toLowerCase() === "lat");
  const hasLon = Object.keys(params).some((key) => key.toLowerCase() === "lon");
  return hasLat && hasLon;
};
