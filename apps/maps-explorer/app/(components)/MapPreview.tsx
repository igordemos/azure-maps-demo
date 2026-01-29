"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiResponse } from "../lib/types";

type Props = {
  response: ApiResponse | null;
  isLoading: boolean;
  authMode: "entra" | "key";
  apiKey: string;
  clientId: string;
  showEmptyState?: boolean;
  preferredZoom?: number;
};

type Coordinate = { lat: number; lon: number };

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readPosition = (value: unknown): Coordinate | null => {
  if (!value || typeof value !== "object") return null;
  const position = (value as { position?: unknown }).position;
  if (!position || typeof position !== "object") return null;
  const lat = toNumber((position as { lat?: unknown }).lat);
  const lon = toNumber((position as { lon?: unknown }).lon);
  if (lat === null || lon === null) return null;
  return { lat, lon };
};

const readGeoJsonPoint = (value: unknown): Coordinate | null => {
  if (!value || typeof value !== "object") return null;
  const geometry = (value as { geometry?: unknown }).geometry;
  if (geometry && typeof geometry === "object") {
    const coords = (geometry as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = toNumber(coords[0]);
      const lat = toNumber(coords[1]);
      if (lat !== null && lon !== null) return { lat, lon };
    }
  }

  const properties = (value as { properties?: unknown }).properties;
  if (properties && typeof properties === "object") {
    const propGeometry = (properties as { geometry?: unknown }).geometry;
    if (propGeometry && typeof propGeometry === "object") {
      const coords = (propGeometry as { coordinates?: unknown }).coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const lon = toNumber(coords[0]);
        const lat = toNumber(coords[1]);
        if (lat !== null && lon !== null) return { lat, lon };
      }
    }

    const propPosition = (properties as { position?: unknown }).position;
    if (propPosition && typeof propPosition === "object") {
      const lat = toNumber((propPosition as { lat?: unknown }).lat);
      const lon = toNumber((propPosition as { lon?: unknown }).lon);
      if (lat !== null && lon !== null) return { lat, lon };
    }

    const geocodePoints = (properties as { geocodePoints?: unknown }).geocodePoints;
    if (Array.isArray(geocodePoints) && geocodePoints.length > 0) {
      const first = geocodePoints[0] as { geometry?: { coordinates?: unknown } };
      const coords = first.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const lon = toNumber(coords[0]);
        const lat = toNumber(coords[1]);
        if (lat !== null && lon !== null) return { lat, lon };
      }
    }
  }

  return null;
};

const extractCoordinate = (body: unknown): Coordinate | null => {
  if (!body) return null;
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as {
    position?: unknown;
    results?: unknown;
    addresses?: unknown;
    features?: unknown;
  };

  const direct = readPosition(root);
  if (direct) return direct;

  if (Array.isArray(root.results) && root.results.length > 0) {
    const resultPos = readPosition(root.results[0]);
    if (resultPos) return resultPos;
  }

  if (Array.isArray(root.addresses) && root.addresses.length > 0) {
    const addressPos = readPosition(root.addresses[0]);
    if (addressPos) return addressPos;
  }

  if (Array.isArray(root.features) && root.features.length > 0) {
    const featurePos = readGeoJsonPoint(root.features[0]);
    if (featurePos) return featurePos;
  }

  return null;
};

const extractLabel = (body: unknown) => {
  if (!body) return "";
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return "";
    }
  }
  if (!parsed || typeof parsed !== "object") return "";

  const root = parsed as {
    results?: unknown;
    addresses?: unknown;
    features?: unknown;
  };

  if (Array.isArray(root.results) && root.results.length > 0) {
    const first = root.results[0] as {
      address?: { freeformAddress?: string; formattedAddress?: string; addressLine?: string };
      poi?: { name?: string };
    };
    return (
      first.poi?.name ||
      first.address?.freeformAddress ||
      first.address?.formattedAddress ||
      first.address?.addressLine ||
      ""
    );
  }

  if (Array.isArray(root.addresses) && root.addresses.length > 0) {
    const first = root.addresses[0] as {
      address?: { freeformAddress?: string; formattedAddress?: string; addressLine?: string };
      poi?: { name?: string };
    };
    return (
      first.poi?.name ||
      first.address?.freeformAddress ||
      first.address?.formattedAddress ||
      first.address?.addressLine ||
      ""
    );
  }

  if (Array.isArray(root.features) && root.features.length > 0) {
    const first = root.features[0] as {
      properties?: {
        name?: string;
        address?: { formattedAddress?: string; addressLine?: string };
      };
    };
    return (
      first.properties?.name ||
      first.properties?.address?.formattedAddress ||
      first.properties?.address?.addressLine ||
      ""
    );
  }

  return "";
};

const extractRouteLine = (body: unknown) => {
  if (!body) return null as [number, number][] | null;
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;

  const root = parsed as {
    features?: unknown;
    routes?: unknown;
  };

  if (Array.isArray(root.features) && root.features.length > 0) {
    for (const item of root.features) {
      const feature = item as { geometry?: { type?: string; coordinates?: unknown } };
      if (feature.geometry?.type === "LineString" && Array.isArray(feature.geometry.coordinates)) {
        return feature.geometry.coordinates as [number, number][];
      }
      if (feature.geometry?.type === "MultiLineString" && Array.isArray(feature.geometry.coordinates)) {
        const first = feature.geometry.coordinates[0] as [number, number][] | undefined;
        if (Array.isArray(first) && first.length > 0) return first;
      }
    }

    const points = root.features
      .map((item) => {
        const feature = item as {
          geometry?: { type?: string; coordinates?: unknown };
          properties?: { routePathPoint?: { pointIndex?: number } };
        };
        if (feature.geometry?.type !== "Point") return null;
        if (feature.properties?.routePathPoint?.pointIndex === undefined) return null;
        const coords = feature.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const index = feature.properties.routePathPoint.pointIndex;
        return { coords: coords as [number, number], index };
      })
      .filter(Boolean) as { coords: [number, number]; index: number }[];

    if (points.length > 1) {
      points.sort((a, b) => a.index - b.index);
      return points.map((item) => item.coords);
    }
  }

  if (Array.isArray(root.routes) && root.routes.length > 0) {
    const route = root.routes[0] as { legs?: unknown };
    const legs = Array.isArray(route.legs) ? route.legs : [];
    for (const leg of legs) {
      const points = (leg as { points?: unknown }).points;
      if (Array.isArray(points) && points.length > 0) {
        const coords: [number, number][] = [];
        for (const point of points) {
          const p = point as { latitude?: number; longitude?: number; lat?: number; lon?: number };
          const lat = typeof p.latitude === "number" ? p.latitude : p.lat;
          const lon = typeof p.longitude === "number" ? p.longitude : p.lon;
          if (typeof lat === "number" && typeof lon === "number") {
            coords.push([lon, lat]);
          }
        }
        if (coords.length > 1) return coords;
      }
    }
  }

  return null;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildDirectionsUrl = (labelText: string) => {
  const query = encodeURIComponent(labelText || "");
  return `https://www.bing.com/maps?rtp=~adr.${query}`;
};

const buildPopupContent = (labelText: string) => {
  const safeLabel = escapeHtml(labelText || "Selected location");
  const directionsUrl = buildDirectionsUrl(labelText || "");
  return `
    <div style=\"padding:10px 12px;max-width:240px;\">
      <div style=\"font-size:12px;color:#0f172a;margin-bottom:8px;\">${safeLabel}</div>
      <a href=\"${directionsUrl}\" target=\"_blank\" rel=\"noreferrer\" style=\"display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#0f172a;color:#fff;font-size:12px;text-decoration:none;\">Directions To</a>
    </div>
  `;
};

export default function MapPreview({
  response,
  isLoading,
  authMode,
  apiKey,
  clientId,
  showEmptyState = true,
  preferredZoom,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const pinOverlayRef = useRef<HTMLDivElement | null>(null);
  const pinElementRef = useRef<HTMLDivElement | null>(null);
  const popupElementRef = useRef<HTMLDivElement | null>(null);
  const atlasRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const dataSourceRef = useRef<any>(null);
  const routeSourceRef = useRef<any>(null);
  const routeMarkerSourceRef = useRef<any>(null);
  const popupRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [mapError, setMapError] = useState<string>("");
  const [mapReady, setMapReady] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [showPopup, setShowPopup] = useState(false);

  const coordinate = useMemo(
    () => extractCoordinate(response?.body ?? null),
    [response]
  );
  const label = useMemo(() => extractLabel(response?.body ?? null), [response]);
  const routeLine = useMemo(() => extractRouteLine(response?.body ?? null), [response]);

  const authOptions = useMemo(() => {
    if (authMode === "key" && apiKey) {
      return { mode: "key" as const, apiKey };
    }
    if (authMode === "entra" && clientId) {
      return { mode: "entra" as const, clientId };
    }
    return null;
  }, [apiKey, authMode, clientId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapContainerRef.current) return;
    if (!authOptions) {
      setMapError("Provide an API key or Microsoft Entra client ID to render the map.");
      return;
    }
    if (mapRef.current) return;

    let disposed = false;
    let readyFired = false;
    let loadingTimer: number | null = null;

    const initMap = async () => {
      const module = await import("azure-maps-control");
      const atlas = module.default ?? module;
      atlasRef.current = atlas;

      if (disposed || !mapContainerRef.current) return;

      setMapError("");
      const atlasAuthOptions =
        authOptions.mode === "key"
          ? {
              authType: atlas.AuthenticationType.subscriptionKey,
              subscriptionKey: authOptions.apiKey,
            }
          : {
              authType: atlas.AuthenticationType.aad,
              clientId: authOptions.clientId,
              getToken: async (
                resolve: (token: string) => void,
                reject: (error: string) => void
              ) => {
                try {
                  const res = await fetch("/api/maps/token");
                  if (!res.ok) {
                    const payload = (await res.json()) as { message?: string };
                    reject(payload?.message || "Failed to fetch token.");
                    return;
                  }
                  const payload = (await res.json()) as { token: string };
                  resolve(payload.token);
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : "Failed to fetch token.";
                  reject(message);
                }
              },
            };

      const map = new atlas.Map(mapContainerRef.current, {
        zoom: 3,
        center: [-98.5795, 39.8283],
        view: "Auto",
        authOptions: atlasAuthOptions,
      });

      mapRef.current = map;

      map.events.add("ready", () => {
        if (disposed) return;
        readyFired = true;
        map.resize();
        setMapReady(true);
        setMapError("");

        const dataSource = new atlas.source.DataSource("result-source");
        dataSourceRef.current = dataSource;
        map.sources.add(dataSource);

        const routeSource = new atlas.source.DataSource("route-source");
        routeSourceRef.current = routeSource;
        map.sources.add(routeSource);

        const routeMarkerSource = new atlas.source.DataSource("route-marker-source");
        routeMarkerSourceRef.current = routeMarkerSource;
        map.sources.add(routeMarkerSource);

        if (!map.imageSprite.hasImage("result-pin-icon")) {
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.beginPath();
            ctx.arc(16, 12, 7, 0, Math.PI * 2);
            ctx.fillStyle = "#0f172a";
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#ffffff";
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(16, 29);
            ctx.lineTo(10, 17);
            ctx.lineTo(22, 17);
            ctx.closePath();
            ctx.fillStyle = "#0f172a";
            ctx.fill();
            ctx.stroke();
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            map.imageSprite.add("result-pin-icon", imageData);
          }
        }

        const bubbleLayer = new atlas.layer.BubbleLayer(dataSource, "result-pin-bubble", {
          radius: 22,
          color: "#ef4444",
          strokeColor: "#ffffff",
          strokeWidth: 3,
          opacity: 0.95,
        });
        map.layers.add(bubbleLayer);

        const pinLayer = new atlas.layer.SymbolLayer(dataSource, "result-pin", {
          iconOptions: {
            image: "result-pin-icon",
            anchor: "bottom",
            allowOverlap: true,
            ignorePlacement: true,
          },
          textOptions: {
            textField: ["get", "label"],
            offset: [0, 1.4],
            color: "#0f172a",
            font: ["Segoe UI", "sans-serif"],
            allowOverlap: true,
            ignorePlacement: true,
          },
        });
        map.layers.add(pinLayer);

        const routeLineLayer = new atlas.layer.LineLayer(routeSource, "route-line", {
          strokeColor: "#0f172a",
          strokeWidth: 4,
          lineJoin: "round",
          lineCap: "round",
        });
        map.layers.add(routeLineLayer);

        const routeMarkerLayer = new atlas.layer.SymbolLayer(
          routeMarkerSource,
          "route-markers",
          {
            iconOptions: {
              image: "pin-round-darkblue",
              anchor: "center",
              allowOverlap: true,
              ignorePlacement: true,
              color: ["get", "color"],
            },
            textOptions: {
              textField: ["get", "label"],
              offset: [0, 1.2],
              color: "#0f172a",
              font: ["Segoe UI", "sans-serif"],
              allowOverlap: true,
              ignorePlacement: true,
            },
          }
        );
        map.layers.add(routeMarkerLayer);

        const popup = new atlas.Popup({ closeButton: true });
        popupRef.current = popup;
        map.events.add("click", bubbleLayer, (event) => {
          const shape = event.shapes?.[0];
          if (!shape || !(shape instanceof atlas.Shape)) return;
          const props = shape.getProperties() as { label?: string };
          const coords = shape.getCoordinates() as [number, number];
          popup.setOptions({
            position: coords,
            content: buildPopupContent(props.label || "Selected location"),
          });
          popup.open(map);
        });

        map.events.add("click", routeMarkerLayer, (event) => {
          const shape = event.shapes?.[0];
          if (!shape || !(shape instanceof atlas.Shape)) return;
          const props = shape.getProperties() as { label?: string };
          const coords = shape.getCoordinates() as [number, number];
          popup.setOptions({
            position: coords,
            content: buildPopupContent(props.label || "Route point"),
          });
          popup.open(map);
        });

        map.events.add("click", (event) => {
          if (!event.shapes || event.shapes.length === 0) {
            popup.close();
          }
        });

        try {
          const controls = [] as any[];
          if (atlas.control?.ZoomControl) controls.push(new atlas.control.ZoomControl());
          if (atlas.control?.CompassControl) controls.push(new atlas.control.CompassControl());
          if (atlas.control?.PitchControl) controls.push(new atlas.control.PitchControl());
          if (atlas.control?.StyleControl) controls.push(new atlas.control.StyleControl());
          if (controls.length > 0) {
            map.controls.add(controls, { position: atlas.ControlPosition.TopRight });
          }
        } catch {
          // Ignore control errors.
        }
      });

      map.events.add("error", (err) => {
        if (disposed) return;
        if (readyFired) return;
        const message = typeof err === "string" ? err : "Map failed to initialize.";
        setMapError(message);
      });
    };

    initMap();

    loadingTimer = window.setTimeout(() => {
      if (!disposed && !readyFired) {
        setMapError("Map is still loading. Check credentials and network access.");
      }
    }, 8000);

    return () => {
      disposed = true;
      if (loadingTimer) window.clearTimeout(loadingTimer);
      if (mapRef.current) mapRef.current.dispose();
      mapRef.current = null;
      dataSourceRef.current = null;
      routeSourceRef.current = null;
      routeMarkerSourceRef.current = null;
      popupRef.current = null;
      markerRef.current = null;
      setMapReady(false);
    };
  }, [authOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!mapReady || !mapRef.current || !mapContainerRef.current) return;
    const map = mapRef.current;
    const container = mapContainerRef.current;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !coordinate || !mapRef.current || !dataSourceRef.current || !atlasRef.current)
      return;
    const atlas = atlasRef.current;
    const map = mapRef.current;
    const source = dataSourceRef.current;

    if (!routeLine && routeSourceRef.current) {
      try {
        routeSourceRef.current.clear();
        routeMarkerSourceRef.current?.clear();
      } catch {
        // ignore
      }
    }

    if (!map.sources.getById("result-source")) map.sources.add(source);
    source.clear();
    const feature = new atlas.data.Feature(
      new atlas.data.Point([coordinate.lon, coordinate.lat]),
      { label: label || "Selected location" }
    );
    source.add(feature);
    map.setCamera({
      center: [coordinate.lon, coordinate.lat],
      zoom: preferredZoom ?? 14,
      type: "ease",
      duration: 800,
    });

    if (popupRef.current && !routeLine) {
      popupRef.current.setOptions({
        position: [coordinate.lon, coordinate.lat],
        content: buildPopupContent(label || "Selected location"),
      });
      popupRef.current.open(map);
    }

    try {
      const featureCount =
        typeof source.getShapes === "function" ? source.getShapes().length : 0;
      const hasSource = Boolean(map.sources.getById("result-source"));
      setDebugInfo(`source:${hasSource} features:${featureCount}`);
    } catch {
      setDebugInfo("");
    }
  }, [coordinate, label, mapReady, routeLine, preferredZoom]);

  useEffect(() => {
    if (!mapReady || routeLine || !routeSourceRef.current) return;
    try {
      routeSourceRef.current.clear();
      routeMarkerSourceRef.current?.clear();
    } catch {
      // ignore
    }
  }, [mapReady, routeLine, response]);

  useEffect(() => {
    if (!mapReady || !routeLine || !mapRef.current || !routeSourceRef.current || !atlasRef.current)
      return;
    setShowPopup(false);
    const atlas = atlasRef.current;
    const map = mapRef.current;
    const routeSource = routeSourceRef.current;
    const routeMarkerSource = routeMarkerSourceRef.current;
    routeSource.clear();
    routeSource.add(new atlas.data.Feature(new atlas.data.LineString(routeLine)));

    if (routeMarkerSource) {
      routeMarkerSource.clear();
      const start = routeLine[0];
      const end = routeLine[routeLine.length - 1];
      routeMarkerSource.add(
        new atlas.data.Feature(new atlas.data.Point(start), {
          label: "Origin",
          color: "#dc2626",
        })
      );
      routeMarkerSource.add(
        new atlas.data.Feature(new atlas.data.Point(end), {
          label: "Destination",
          color: "#16a34a",
        })
      );
    }

    const bounds = atlas.data.BoundingBox.fromPositions(routeLine);
    map.setCamera({
      bounds,
      padding: 40,
      type: "ease",
      duration: 800,
    });
  }, [mapReady, routeLine]);

  useEffect(() => {
    if (!mapReady || !coordinate || !mapRef.current || !pinElementRef.current) return;
    if (routeLine) return;
    const map = mapRef.current;
    const pinEl = pinElementRef.current;
    const popupEl = popupElementRef.current;

    const updatePin = () => {
      try {
        const pixels = map.positionsToPixels([[coordinate.lon, coordinate.lat]]);
        const point = pixels?.[0];
        if (!point) return;
        pinEl.style.opacity = "1";
        pinEl.style.transform = `translate(${point[0]}px, ${point[1]}px) translate(-50%, -100%)`;
        if (popupEl) {
          popupEl.style.opacity = showPopup ? "1" : "0";
          popupEl.style.transform = `translate(${point[0]}px, ${point[1] - 12}px) translate(-50%, -100%)`;
        }
      } catch {
        // ignore
      }
    };

    updatePin();
    map.events.add("move", updatePin);
    map.events.add("zoom", updatePin);
    map.events.add("moveend", updatePin);

    const handlePinClick = () => {
      setShowPopup(true);
      if (!popupRef.current) return;
      popupRef.current.setOptions({
        position: [coordinate.lon, coordinate.lat],
        content: buildPopupContent(label || "Selected location"),
      });
      popupRef.current.open(map);
    };
    pinEl.addEventListener("click", handlePinClick);

    const handleMapClick = (event: any) => {
      if (!event?.shapes || event.shapes.length === 0) {
        setShowPopup(false);
        if (popupRef.current) popupRef.current.close();
      }
    };
    map.events.add("click", handleMapClick);

    return () => {
      map.events.remove("move", updatePin);
      map.events.remove("zoom", updatePin);
      map.events.remove("moveend", updatePin);
      pinEl.removeEventListener("click", handlePinClick);
      map.events.remove("click", handleMapClick);
    };
  }, [coordinate, label, mapReady, routeLine, showPopup]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Map Preview</h2>
        {isLoading && (
          <span className="text-xs font-semibold text-slate-500">Loading…</span>
        )}
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner"
        aria-busy={isLoading}
      >
        {!response && !isLoading && showEmptyState && (
          <div className="flex min-h-[260px] items-center justify-center px-6 text-xs text-slate-400">
            Run a request to render a map.
          </div>
        )}
        {response && !coordinate && !isLoading && showEmptyState && (
          <div className="flex min-h-[260px] items-center justify-center px-6 text-xs text-slate-400">
            No coordinates found in the response.
          </div>
        )}
        {mapError && (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 px-6 text-xs text-rose-500">
            <div>Map failed to load.</div>
            <div className="text-slate-400">{mapError}</div>
          </div>
        )}
        <div ref={mapContainerRef} className="h-[320px] w-full" />
        {!mapReady && !mapError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
            Loading map…
          </div>
        )}
        {!routeLine && (
          <div ref={pinOverlayRef} className="absolute inset-0" aria-hidden="true">
            <div
              ref={pinElementRef}
              className="absolute h-6 w-6 rounded-full border-2 border-white bg-rose-500 shadow-lg"
              style={{
                opacity: 0,
                transform: "translate(-50%, -100%)",
                pointerEvents: "auto",
                cursor: "pointer",
              }}
            />
            <div
              ref={popupElementRef}
              className="absolute max-w-[240px] rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-[12px] text-slate-700 shadow-lg"
              style={{
                opacity: showPopup ? 1 : 0,
                transform: "translate(-50%, -100%)",
                pointerEvents: showPopup ? "auto" : "none",
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 text-slate-800">{label || "Selected location"}</div>
              <a
                href={buildDirectionsUrl(label || "")}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  window.open(buildDirectionsUrl(label || ""), "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white"
              >
                Directions To
              </a>
            </div>
          </div>
        )}
      </div>
      {label && !routeLine && (
        <div className="text-xs text-slate-500">
          Pinned: <span className="font-semibold text-slate-700">{label}</span>
        </div>
      )}
      {debugInfo && (
        <div className="text-[11px] text-slate-400">Map debug: {debugInfo}</div>
      )}
    </div>
  );
}
