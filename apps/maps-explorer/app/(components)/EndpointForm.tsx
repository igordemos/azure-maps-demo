"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ResultTabs from "./ResultTabs";
import History from "./History";
import MapPreview from "./MapPreview";
import type { ApiResponse, HistoryEntry, Param, RequestShape } from "../lib/types";
import {
  buildQueryString,
  hasLatLonParam,
  isBaseUrlSafe,
  isPathSafe,
  isReverseGeocodePath,
  normalizePath,
  paramsToRecord,
} from "../lib/validation";
import { buildCurl } from "../lib/buildCurl";

const HISTORY_KEY = "maps-explorer-history";
const DEFAULT_BASE_URL =
  process.env.NEXT_PUBLIC_AZURE_MAPS_BASE_URL ?? "https://atlas.microsoft.com";
const CONNECTION_KEY = "maps-explorer-connection";
const API_KEY_SESSION = "maps-explorer-api-key";
const TAB_STATE_KEY = "maps-explorer-tab-state";

const presets = [
  {
    id: "geocode",
    label: "Geocode (geocode)",
    path: "geocode",
    params: [
      { key: "api-version", value: "2025-01-01" },
      { key: "query", value: "6301 Owensmouth Ave, Woodland Hills, CA 91367" },
      { key: "limit", value: "1" },
      { key: "countrySet", value: "US" },
    ] as Param[],
  },
  {
    id: "reverse",
    label: "Reverse Geocode (reverseGeocode)",
    path: "reverseGeocode",
    params: [
      { key: "api-version", value: "2025-01-01" },
      { key: "coordinates", value: "-118.60213,34.184559" },
      { key: "resultTypes", value: "Address" },
      { key: "view", value: "auto" },
    ] as Param[],
  },
  {
    id: "autocomplete",
    label: "Autocomplete (geocode:autocomplete)",
    path: "geocode:autocomplete",
    params: [
      { key: "api-version", value: "2025-06-01-preview" },
      { key: "query", value: "6301 Owen" },
      { key: "top", value: "5" },
      { key: "countryRegion", value: "us" },
      { key: "resultTypeGroups", value: "address" },
      { key: "coordinates", value: "-122.13683,47.64228" },
    ] as Param[],
  },
  {
    id: "weather",
    label: "Weather (daily historical)",
    path: "weather/historical/records/daily/json",
    params: [
      { key: "api-version", value: "1.1" },
      { key: "query", value: "-118.60213,34.184559" },
      { key: "startDate", value: "2024-01-01" },
      { key: "endDate", value: "2024-01-07" },
      { key: "unit", value: "metric" },
    ] as Param[],
  },
  {
    id: "geolocation",
    label: "IP Geolocation (IP to Location)",
    path: "geolocation/ip/json",
    params: [
      { key: "api-version", value: "1.0" },
      { key: "ip", value: "8.8.8.8" },
    ] as Param[],
  },
  {
    id: "route",
    label: "Route (directions)",
    path: "route/directions",
    params: [{ key: "api-version", value: "2025-01-01" }] as Param[],
  },
];

const quickParams = [
  { key: "api-version", value: "2025-06-01-preview" },
  { key: "language", value: "en-US" },
  { key: "countrySet", value: "US" },
  { key: "limit", value: "5" },
  { key: "lat", value: "47.6396" },
  { key: "lon", value: "-122.1282" },
  { key: "radius", value: "50" },
];

const toHistoryEntry = (
  request: RequestShape,
  response: ApiResponse
): HistoryEntry => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  request,
  timestamp: Date.now(),
  status: response.meta.status,
  durationMs: response.meta.durationMs,
});

type CheckboxParam = {
  id: string;
  key: string;
  description?: string;
  placeholder?: string;
  value: string;
  enabled: boolean;
  isCustom?: boolean;
};

const geocodeParamTemplate: Omit<CheckboxParam, "id" | "value" | "enabled">[] = [
  {
    key: "api-version",
    description: "API version (required)",
    placeholder: "2025-01-01",
  },
  { key: "query", description: "Freeform address or place" },
  { key: "addressLine", description: "Structured street line" },
  { key: "adminDistrict", description: "State/province (e.g. WA)" },
  { key: "adminDistrict2", description: "County (e.g. King)" },
  { key: "adminDistrict3", description: "Named area" },
  { key: "locality", description: "City or town" },
  { key: "postalCode", description: "Postal code" },
  { key: "countryRegion", description: "ISO 3166-1 Alpha-2 region" },
  { key: "bbox", description: "Bounding box lon1,lat1,lon2,lat2" },
  { key: "coordinates", description: "User location lon,lat" },
  { key: "top", description: "Max results (1-20)" },
  { key: "view", description: "Geopolitical view" },
];

const reverseParamTemplate: Omit<CheckboxParam, "id" | "value" | "enabled">[] = [
  {
    key: "api-version",
    description: "API version (required)",
    placeholder: "2025-01-01",
  },
  {
    key: "coordinates",
    description: "Coordinate to reverse geocode (lon,lat)",
    placeholder: "-122.138681,47.630358",
  },
  {
    key: "resultTypes",
    description: "Entity types (comma separated)",
    placeholder: "Address,Neighborhood",
  },
  {
    key: "view",
    description: "Geopolitical view",
    placeholder: "auto",
  },
];

const weatherParamTemplate: Omit<CheckboxParam, "id" | "value" | "enabled">[] = [
  {
    key: "api-version",
    description: "API version",
    placeholder: "1.1",
  },
  {
    key: "query",
    description: "Coordinates (lat,lon)",
    placeholder: "34.184559,-118.60213",
  },
  {
    key: "startDate",
    description: "Start date (YYYY-MM-DD)",
  },
  {
    key: "endDate",
    description: "End date (YYYY-MM-DD)",
  },
  {
    key: "unit",
    description: "Units (metric/imperial)",
  },
];

export default function EndpointForm() {
  const [path, setPath] = useState(presets[0].path);
  const [params, setParams] = useState<Param[]>(presets[0].params);
  const [selectedPreset, setSelectedPreset] = useState(presets[0].id);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [mapResponse, setMapResponse] = useState<ApiResponse | null>(null);
  const [autocompleteResponse, setAutocompleteResponse] = useState<ApiResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [credentialMissing, setCredentialMissing] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [authMode, setAuthMode] = useState<"entra" | "key">("entra");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [method, setMethod] = useState<
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  >("GET");
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [paramsByPreset, setParamsByPreset] = useState<Record<string, Param[]>>({});
  const [pathByPreset, setPathByPreset] = useState<Record<string, string>>({});
  const [geocodeParams, setGeocodeParams] = useState<CheckboxParam[]>(() =>
    geocodeParamTemplate.map((item) => ({
      id: `geo-${item.key}`,
      ...item,
      value: "",
      enabled: false,
    }))
  );
  const [reverseParams, setReverseParams] = useState<CheckboxParam[]>(() =>
    reverseParamTemplate.map((item) => ({
      id: `rev-${item.key}`,
      ...item,
      value: "",
      enabled: false,
    }))
  );
  const [weatherParams, setWeatherParams] = useState<CheckboxParam[]>(() =>
    weatherParamTemplate.map((item) => ({
      id: `weather-${item.key}`,
      ...item,
      value: "",
      enabled: false,
    }))
  );
  const [autocompleteQuery, setAutocompleteQuery] = useState("");
  const [autocompleteResults, setAutocompleteResults] = useState<string[]>([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState<string>("");
  const [autocompleteDiag, setAutocompleteDiag] = useState<string>("");
  const [showAutocompleteDropdown, setShowAutocompleteDropdown] = useState(false);
  const autocompleteBoxRef = useRef<HTMLDivElement | null>(null);
  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);

  const [weatherQuery, setWeatherQuery] = useState("");
  const [weatherResults, setWeatherResults] = useState<string[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string>("");
  const [showWeatherDropdown, setShowWeatherDropdown] = useState(false);
  const weatherBoxRef = useRef<HTMLDivElement | null>(null);
  const weatherInputRef = useRef<HTMLInputElement | null>(null);
  const [weatherStartDate, setWeatherStartDate] = useState("2024-01-01");
  const [weatherEndDate, setWeatherEndDate] = useState("2024-01-07");
  const [weatherUnit, setWeatherUnit] = useState("metric");
  const [weatherResponse, setWeatherResponse] = useState<ApiResponse | null>(null);
  const [weatherCoord, setWeatherCoord] = useState<{ lat: number; lon: number } | null>(null);

  const [geolocationIp, setGeolocationIp] = useState("8.8.8.8");
  const [geolocationResponse, setGeolocationResponse] = useState<ApiResponse | null>(null);

  const [routeOrigin, setRouteOrigin] = useState("");
  const [routeDestination, setRouteDestination] = useState("");
  const [routeOriginResults, setRouteOriginResults] = useState<string[]>([]);
  const [routeDestinationResults, setRouteDestinationResults] = useState<string[]>([]);
  const [routeOriginLoading, setRouteOriginLoading] = useState(false);
  const [routeDestinationLoading, setRouteDestinationLoading] = useState(false);
  const [routeOriginError, setRouteOriginError] = useState("");
  const [routeDestinationError, setRouteDestinationError] = useState("");
  const [showRouteOriginDropdown, setShowRouteOriginDropdown] = useState(false);
  const [showRouteDestinationDropdown, setShowRouteDestinationDropdown] = useState(false);
  const routeOriginRef = useRef<HTMLDivElement | null>(null);
  const routeDestinationRef = useRef<HTMLDivElement | null>(null);
  const [routeOriginCoord, setRouteOriginCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [routeDestinationCoord, setRouteDestinationCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [routeResponse, setRouteResponse] = useState<ApiResponse | null>(null);
  const [routeError, setRouteError] = useState("");

  const extractCoordinate = (body: unknown) => {
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

    const root = parsed as { results?: unknown; addresses?: unknown; features?: unknown };

    const readPosition = (value: unknown) => {
      if (!value || typeof value !== "object") return null;
      const position = (value as { position?: unknown }).position;
      if (!position || typeof position !== "object") return null;
      const lat = (position as { lat?: unknown }).lat;
      const lon = (position as { lon?: unknown }).lon;
      if (typeof lat !== "number" || typeof lon !== "number") return null;
      return { lat, lon };
    };

    const readGeoJsonPoint = (value: unknown) => {
      if (!value || typeof value !== "object") return null;
      const geometry = (value as { geometry?: unknown }).geometry;
      if (geometry && typeof geometry === "object") {
        const coords = (geometry as { coordinates?: unknown }).coordinates;
        if (Array.isArray(coords) && coords.length >= 2) {
          const lon = coords[0];
          const lat = coords[1];
          if (typeof lat === "number" && typeof lon === "number") return { lat, lon };
        }
      }
      const properties = (value as { properties?: unknown }).properties;
      if (properties && typeof properties === "object") {
        const geocodePoints = (properties as { geocodePoints?: unknown }).geocodePoints;
        if (Array.isArray(geocodePoints) && geocodePoints.length > 0) {
          const first = geocodePoints[0] as { geometry?: { coordinates?: unknown } };
          const coords = first.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            const lon = coords[0];
            const lat = coords[1];
            if (typeof lat === "number" && typeof lon === "number") return { lat, lon };
          }
        }
      }
      return null;
    };

    if (Array.isArray(root.results) && root.results.length > 0) {
      const pos = readPosition(root.results[0]);
      if (pos) return pos;
    }
    if (Array.isArray(root.addresses) && root.addresses.length > 0) {
      const pos = readPosition(root.addresses[0]);
      if (pos) return pos;
    }
    if (Array.isArray(root.features) && root.features.length > 0) {
      const pos = readGeoJsonPoint(root.features[0]);
      if (pos) return pos;
    }
    return null;
  };

  useEffect(() => {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      try {
        setHistory(JSON.parse(stored) as HistoryEntry[]);
      } catch {
        setHistory([]);
      }
    }
    const connectionStored = localStorage.getItem(CONNECTION_KEY);
    if (connectionStored) {
      try {
        const parsed = JSON.parse(connectionStored) as {
          baseUrl?: string;
          authMode?: "entra" | "key";
          clientId?: string;
        };
        if (parsed.baseUrl) setBaseUrl(parsed.baseUrl);
        if (parsed.authMode) setAuthMode(parsed.authMode);
        if (parsed.clientId) setClientId(parsed.clientId);
      } catch {
        // ignore
      }
    }
    const sessionKey = sessionStorage.getItem(API_KEY_SESSION);
    if (sessionKey) setApiKey(sessionKey);
    const tabStateRaw = localStorage.getItem(TAB_STATE_KEY);
    if (tabStateRaw) {
      try {
        const parsed = JSON.parse(tabStateRaw) as {
          pathByPreset?: Record<string, string>;
          paramsByPreset?: Record<string, Param[]>;
          geocodeParams?: CheckboxParam[];
          reverseParams?: CheckboxParam[];
          weatherParams?: CheckboxParam[];
          autocompleteQuery?: string;
          weatherQuery?: string;
          weatherStartDate?: string;
          weatherEndDate?: string;
          weatherUnit?: string;
          weatherCoord?: { lat: number; lon: number } | null;
          geolocationIp?: string;
          routeOrigin?: string;
          routeDestination?: string;
          routeOriginCoord?: { lat: number; lon: number } | null;
          routeDestinationCoord?: { lat: number; lon: number } | null;
        };
        if (parsed.pathByPreset) setPathByPreset(parsed.pathByPreset);
        if (parsed.paramsByPreset) setParamsByPreset(parsed.paramsByPreset);
        if (parsed.geocodeParams) setGeocodeParams(parsed.geocodeParams);
        if (parsed.reverseParams) setReverseParams(parsed.reverseParams);
        if (parsed.weatherParams) setWeatherParams(parsed.weatherParams);
        if (typeof parsed.autocompleteQuery === "string") {
          setAutocompleteQuery(parsed.autocompleteQuery);
        }
        if (typeof parsed.weatherQuery === "string") {
          setWeatherQuery(parsed.weatherQuery);
        }
        if (typeof parsed.weatherStartDate === "string") {
          setWeatherStartDate(parsed.weatherStartDate);
        }
        if (typeof parsed.weatherEndDate === "string") {
          setWeatherEndDate(parsed.weatherEndDate);
        }
        if (typeof parsed.weatherUnit === "string") {
          setWeatherUnit(parsed.weatherUnit);
        }
        if (parsed.weatherCoord) setWeatherCoord(parsed.weatherCoord);
        if (typeof parsed.geolocationIp === "string") {
          setGeolocationIp(parsed.geolocationIp);
        }
        if (typeof parsed.routeOrigin === "string") {
          setRouteOrigin(parsed.routeOrigin);
        }
        if (typeof parsed.routeDestination === "string") {
          setRouteDestination(parsed.routeDestination);
        }
        if (parsed.routeOriginCoord) setRouteOriginCoord(parsed.routeOriginCoord);
        if (parsed.routeDestinationCoord) setRouteDestinationCoord(parsed.routeDestinationCoord);

        if (parsed.pathByPreset?.[presets[0].id]) {
          setPath(parsed.pathByPreset[presets[0].id]);
        }
        if (parsed.paramsByPreset?.[presets[0].id]) {
          setParams(parsed.paramsByPreset[presets[0].id]);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(
      CONNECTION_KEY,
      JSON.stringify({ baseUrl, authMode, clientId })
    );
  }, [baseUrl, authMode, clientId]);

  useEffect(() => {
    localStorage.setItem(
      TAB_STATE_KEY,
      JSON.stringify({
        pathByPreset,
        paramsByPreset,
        geocodeParams,
        reverseParams,
        weatherParams,
        autocompleteQuery,
        weatherQuery,
        weatherStartDate,
        weatherEndDate,
        weatherUnit,
        weatherCoord,
        geolocationIp,
        routeOrigin,
        routeDestination,
        routeOriginCoord,
        routeDestinationCoord,
      })
    );
  }, [
    pathByPreset,
    paramsByPreset,
    geocodeParams,
    reverseParams,
    weatherParams,
    autocompleteQuery,
    weatherQuery,
    weatherStartDate,
    weatherEndDate,
    weatherUnit,
    weatherCoord,
    geolocationIp,
    routeOrigin,
    routeDestination,
    routeOriginCoord,
    routeDestinationCoord,
  ]);

  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem(API_KEY_SESSION, apiKey);
    } else {
      sessionStorage.removeItem(API_KEY_SESSION);
    }
  }, [apiKey]);

  useEffect(() => {
    if (selectedPreset === "geocode" || selectedPreset === "reverse") return;
    setParamsByPreset((prev) => ({ ...prev, [selectedPreset]: params }));
    setPathByPreset((prev) => ({ ...prev, [selectedPreset]: path }));
  }, [params, path, selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "geocode") return;
    setPathByPreset((prev) => ({ ...prev, geocode: path }));
  }, [path, selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "reverse") return;
    setPathByPreset((prev) => ({ ...prev, reverse: path }));
  }, [path, selectedPreset]);

  const recordHistory = useCallback((entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 10));
  }, []);

  const requestShape = useMemo<RequestShape>(
    () => ({
      path,
      params: paramsToRecord(
        selectedPreset === "geocode"
          ? geocodeParams
              .filter((item) => item.enabled)
              .map((item) => ({ key: item.key, value: item.value }))
          : selectedPreset === "reverse"
          ? reverseParams
              .filter((item) => item.enabled)
              .map((item) => ({ key: item.key, value: item.value }))
          : selectedPreset === "weather"
          ? weatherParams
            .filter((item) => item.enabled)
            .map((item) => ({ key: item.key, value: item.value }))
          : params
      ),
      method,
      baseUrl,
      auth:
        authMode === "key"
          ? { apiKey }
          : { clientId: clientId || undefined },
    }),
    [
      apiKey,
      authMode,
      baseUrl,
      clientId,
      method,
      params,
      path,
      selectedPreset,
      geocodeParams,
      reverseParams,
      weatherParams,
    ]
  );

  const queryString = useMemo(
    () => buildQueryString(requestShape.params),
    [requestShape]
  );

  const previewUrl = useMemo(() => {
    const normalized = normalizePath(path);
    return `${baseUrl.replace(/\/$/, "")}/${normalized}${
      queryString ? `?${queryString}` : ""
    }`;
  }, [baseUrl, path, queryString]);

  const reverseMissing = useMemo(() => {
    if (!isReverseGeocodePath(path)) return false;
    return !hasLatLonParam(requestShape.params);
  }, [path, requestShape.params]);

  const isValid = useMemo(
    () => isPathSafe(path) && isBaseUrlSafe(baseUrl),
    [baseUrl, path]
  );

  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    const savedPath = pathByPreset[presetId];
    const savedParams = paramsByPreset[presetId];
    setPath(savedPath ?? preset.path);
    if (presetId !== "geocode" && presetId !== "reverse") {
      setParams(savedParams ?? preset.params);
    }
    setMethod("GET");
    setIsEditingPath(false);
  };

  const updateParam = (index: number, key: string, value: string) => {
    setParams((prev) =>
      prev.map((item, idx) => (idx === index ? { key, value } : item))
    );
  };

  const removeParam = (index: number) => {
    setParams((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addParam = () => setParams((prev) => [...prev, { key: "", value: "" }]);

  const addGeocodeParam = () =>
    setGeocodeParams((prev) => [
      {
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key: "",
        description: "Custom",
        value: "",
        enabled: true,
        isCustom: true,
      },
      ...prev,
    ]);

  const addReverseParam = () =>
    setReverseParams((prev) => [
      {
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key: "",
        description: "Custom",
        value: "",
        enabled: true,
        isCustom: true,
      },
      ...prev,
    ]);

  const addWeatherParam = () =>
    setWeatherParams((prev) => [
      {
        id: `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key: "",
        description: "Custom",
        value: "",
        enabled: true,
        isCustom: true,
      },
      ...prev,
    ]);

  const upsertParam = (key: string, value: string) => {
    setParams((prev) => {
      const existing = prev.findIndex((item) => item.key === key);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { key, value } : item
        );
      }
      return [...prev, { key, value }];
    });
  };

  const runRequest = useCallback(async (request: RequestShape) => {
    if (!isPathSafe(request.path)) return null;
    setIsLoading(true);
    setCredentialMissing(false);
    try {
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      let data: ApiResponse | null = null;
      try {
        data = (await res.json()) as ApiResponse;
      } catch {
        data = {
          meta: {
            status: res.status,
            statusText: res.statusText,
            headers: {},
            durationMs: 0,
            url: "",
          },
          body: { message: "Failed to parse response." },
          raw: "",
          errorCode: "invalid_response",
        };
      }

      setResponse(data);

      if (data.errorCode === "missing_credentials") {
        setCredentialMissing(true);
      }

      if (res.ok) {
        const safeRequest: RequestShape = {
          ...request,
          auth: request.auth?.apiKey ? { clientId: request.auth.clientId } : request.auth,
        };
        recordHistory(toHistoryEntry(safeRequest, data));
      }
      return data;
    } finally {
      setIsLoading(false);
    }
  }, [mockMode, recordHistory]);

  const runRequestForMap = useCallback(async (request: RequestShape) => {
    if (!isPathSafe(request.path)) return null;
    try {
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      setMapResponse(data);
      setResponse(data);
      return data;
    } catch {
      return null;
    }
  }, [mockMode]);

  const parseAutocompleteResults = (body: unknown) => {
    if (!body) return [] as string[];
    let parsed: unknown = body;
    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body);
      } catch {
        return [];
      }
    }
    if (!parsed || typeof parsed !== "object") return [];

    const root = parsed as {
      results?: unknown;
      features?: unknown;
      suggestions?: unknown;
    };

    const toLabel = (value: unknown) => {
      if (!value || typeof value !== "object") return "";
      const item = value as {
        address?: {
          formattedAddress?: string;
          freeformAddress?: string;
          addressLine?: string;
          streetNumber?: string;
          streetName?: string;
          municipality?: string;
          countrySubdivision?: string;
          postalCode?: string;
        };
        displayName?: string;
        name?: string;
        text?: string;
      };
      const address = item.address;
      return (
        address?.formattedAddress ||
        address?.freeformAddress ||
        address?.addressLine ||
        [address?.streetNumber, address?.streetName, address?.municipality, address?.countrySubdivision, address?.postalCode]
          .filter(Boolean)
          .join(" ") ||
        item.displayName ||
        item.name ||
        item.text ||
        ""
      );
    };

    if (Array.isArray(root.results)) {
      return root.results.map(toLabel).filter(Boolean);
    }

    if (Array.isArray(root.features)) {
      return root.features
        .map((item) => {
          const feature = item as { properties?: unknown };
          return toLabel(feature.properties);
        })
        .filter(Boolean);
    }

    if (Array.isArray(root.suggestions)) {
      return root.suggestions.map(toLabel).filter(Boolean);
    }

    return [];
  };

  const fetchAutocompleteForWeather = useCallback(
    async (query: string) => {
      if (!query || query.trim().length < 3) {
        setWeatherResults([]);
        setWeatherError("");
        setShowWeatherDropdown(false);
        return;
      }
      setWeatherLoading(true);
      setWeatherError("");
      try {
        const endpoint = mockMode ? "/api/mock" : "/api/maps";
        const request: RequestShape = {
          path: "geocode:autocomplete",
          params: {
            "api-version": "2025-06-01-preview",
            query: query.trim(),
            top: "5",
            countryRegion: "us",
            resultTypeGroups: "address",
            coordinates: "-122.13683,47.64228",
          },
          method: "GET",
          baseUrl,
          auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const data = (await res.json()) as ApiResponse;

        if (data.meta.status >= 400) {
          const body = data.body as { message?: string; error?: { message?: string } } | undefined;
          const message =
            body?.message || body?.error?.message || data.meta.statusText || "Autocomplete failed.";
          setWeatherResults([]);
          setWeatherError(message);
          return;
        }

        const results = parseAutocompleteResults(data.body);
        setWeatherResults(results);
        if (results.length > 0) {
          setShowWeatherDropdown(true);
        }
        if (results.length === 0) {
          setWeatherError("No suggestions returned.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Autocomplete failed.";
        setWeatherError(message);
      } finally {
        setWeatherLoading(false);
      }
    },
    [apiKey, authMode, baseUrl, clientId, mockMode]
  );

  const fetchWeatherRecords = useCallback(
    async (lat: number, lon: number) => {
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const updatedParams = weatherParams.map((item) => {
        if (item.key === "query") {
          return { ...item, value: `${lat},${lon}`, enabled: true };
        }
        if (item.key === "api-version" && !item.value) {
          return { ...item, value: "1.1", enabled: true };
        }
        return item;
      });
      setWeatherParams(updatedParams);
      const request: RequestShape = {
        path: "weather/historical/records/daily/json",
        params: paramsToRecord(
          updatedParams
            .filter((item) => item.enabled)
            .map((item) => ({ key: item.key, value: item.value }))
        ),
        method: "GET",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      setWeatherResponse(data);
      return data;
    },
    [apiKey, authMode, baseUrl, clientId, mockMode, weatherParams]
  );

  const fetchGeolocation = useCallback(
    async (ip: string) => {
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const request: RequestShape = {
        path: "geolocation/ip/json",
        params: {
          "api-version": "1.0",
          ip: ip.trim(),
        },
        method: "GET",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      setGeolocationResponse(data);
      if (data.meta.status < 400) {
        const body = data.body as
          | { countryRegion?: { isoCode?: string; name?: string }; isoCode?: string }
          | undefined;
        const countryQuery =
          body?.countryRegion?.name ||
          body?.countryRegion?.isoCode ||
          body?.isoCode ||
          "";
        if (countryQuery) {
          const mapRequest: RequestShape = {
            path: "geocode",
            params: {
              "api-version": "2025-01-01",
              query: countryQuery,
              limit: "1",
            },
            method: "GET",
            baseUrl,
            auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
          };
          await runRequestForMap(mapRequest);
        }
      }
      return data;
    },
    [apiKey, authMode, baseUrl, clientId, mockMode, runRequestForMap]
  );

  const fetchRouteAutocomplete = useCallback(
    async (
      query: string,
      setResults: (value: string[]) => void,
      setError: (value: string) => void,
      setLoading: (value: boolean) => void,
      setShow: (value: boolean) => void
    ) => {
      if (!query || query.trim().length < 3) {
        setResults([]);
        setError("");
        setShow(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const endpoint = mockMode ? "/api/mock" : "/api/maps";
        const request: RequestShape = {
          path: "geocode:autocomplete",
          params: {
            "api-version": "2025-06-01-preview",
            query: query.trim(),
            top: "5",
            countryRegion: "us",
            resultTypeGroups: "address",
            coordinates: "-122.13683,47.64228",
          },
          method: "GET",
          baseUrl,
          auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const data = (await res.json()) as ApiResponse;

        if (data.meta.status >= 400) {
          const body = data.body as { message?: string; error?: { message?: string } } | undefined;
          const message =
            body?.message || body?.error?.message || data.meta.statusText || "Autocomplete failed.";
          setResults([]);
          setError(message);
          return;
        }

        const results = parseAutocompleteResults(data.body);
        setResults(results);
        if (results.length > 0) {
          setShow(true);
        }
        if (results.length === 0) {
          setError("No suggestions returned.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Autocomplete failed.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [apiKey, authMode, baseUrl, clientId, mockMode]
  );

  const fetchGeocodeCoordinate = useCallback(
    async (value: string) => {
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const request: RequestShape = {
        path: "geocode",
        params: {
          "api-version": "2025-01-01",
          query: value,
          limit: "1",
        },
        method: "GET",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      return extractCoordinate(data.body);
    },
    [apiKey, authMode, baseUrl, clientId, mockMode]
  );

  const fetchRouteDirections = useCallback(
    async (origin: { lat: number; lon: number }, destination: { lat: number; lon: number }) => {
      setRouteError("");
      const endpoint = mockMode ? "/api/mock" : "/api/maps";
      const request: RequestShape = {
        path: "route/directions",
        params: {
          "api-version": "2025-01-01",
        },
        method: "POST",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
        body: {
          type: "FeatureCollection",
          properties: {},
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [origin.lon, origin.lat],
              },
              properties: {},
            },
            {
              type: "Feature",
              geometry: {
                type: "Point",
                coordinates: [destination.lon, destination.lat],
              },
              properties: {},
            },
          ],
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = (await res.json()) as ApiResponse;
      setRouteResponse(data);
      if (data.meta.status >= 400) {
        const body = data.body as { message?: string; error?: { message?: string } } | undefined;
        setRouteError(body?.message || body?.error?.message || data.meta.statusText || "Route failed.");
      }
      return data;
    },
    [apiKey, authMode, baseUrl, clientId, mockMode]
  );

  const fetchAutocomplete = useCallback(
    async (query: string) => {
      if (!query || query.trim().length < 3) {
        setAutocompleteResults([]);
        setAutocompleteError("");
        setShowAutocompleteDropdown(false);
        return;
      }
      setAutocompleteLoading(true);
      setAutocompleteError("");
      setAutocompleteDiag("");
      try {
        const endpoint = mockMode ? "/api/mock" : "/api/maps";
        const request: RequestShape = {
          path: "geocode:autocomplete",
          params: {
            "api-version": "2025-06-01-preview",
            query: query.trim(),
            top: "5",
            countryRegion: "us",
            resultTypeGroups: "address",
            coordinates: "-122.13683,47.64228",
          },
          method: "GET",
          baseUrl,
          auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        const data = (await res.json()) as ApiResponse;
        setAutocompleteResponse(data);
        setAutocompleteDiag(
          `status:${data.meta.status} url:${data.meta.url || "(proxy)"}`
        );

        if (data.meta.status >= 400) {
          const body = data.body as { message?: string; error?: { message?: string } } | undefined;
          const message =
            body?.message ||
            body?.error?.message ||
            data.meta.statusText ||
            "Autocomplete failed.";
          setAutocompleteResults([]);
          setAutocompleteError(message);
          return;
        }

        const results = parseAutocompleteResults(data.body);
        setAutocompleteResults(results);
        if (results.length > 0) {
          setShowAutocompleteDropdown(true);
        }
        if (results.length === 0) {
          setAutocompleteError("No suggestions returned.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Autocomplete failed.";
        setAutocompleteError(message);
      } finally {
        setAutocompleteLoading(false);
      }
    },
    [apiKey, authMode, baseUrl, clientId, mockMode]
  );

  const handleAutocompletePick = useCallback(
    (value: string) => {
      setAutocompleteQuery(value);
      setShowAutocompleteDropdown(false);
      setAutocompleteResults([]);
      autocompleteInputRef.current?.focus();
      const request: RequestShape = {
        path: "geocode",
        params: {
          "api-version": "2025-06-01-preview",
          query: value,
          limit: "1",
        },
        method: "GET",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
      };
      runRequestForMap(request).then((data) => {
        if (data && extractCoordinate(data.body)) return;
        const fallbackRequest: RequestShape = {
          path: "geocode",
          params: {
            "api-version": "2025-01-01",
            query: value,
            limit: "1",
          },
          method: "GET",
          baseUrl,
          auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
        };
        runRequestForMap(fallbackRequest);
      });
    },
    [apiKey, authMode, baseUrl, clientId, runRequestForMap]
  );

  const handleWeatherPick = useCallback(
    (value: string) => {
      setWeatherQuery(value);
      setShowWeatherDropdown(false);
      setWeatherResults([]);
      weatherInputRef.current?.focus();

      const geocodeRequest: RequestShape = {
        path: "geocode",
        params: {
          "api-version": "2025-01-01",
          query: value,
          limit: "1",
        },
        method: "GET",
        baseUrl,
        auth: authMode === "key" ? { apiKey } : { clientId: clientId || undefined },
      };

      runRequestForMap(geocodeRequest).then((data) => {
        const coordinate = data ? extractCoordinate(data.body) : null;
        if (!coordinate) return;
        setWeatherCoord(coordinate);
        setWeatherParams((prev) =>
          prev.map((item) =>
            item.key === "query"
              ? {
                  ...item,
                  value: `${coordinate.lat},${coordinate.lon}`,
                  enabled: true,
                }
              : item
          )
        );
      });
    },
    [apiKey, authMode, baseUrl, runRequestForMap]
  );

  const handleRouteOriginPick = useCallback(
    (value: string) => {
      setRouteOrigin(value);
      setShowRouteOriginDropdown(false);
      setRouteOriginResults([]);
      fetchGeocodeCoordinate(value).then((coord) => {
        if (coord) setRouteOriginCoord(coord);
      });
    },
    [fetchGeocodeCoordinate]
  );

  const handleRouteDestinationPick = useCallback(
    (value: string) => {
      setRouteDestination(value);
      setShowRouteDestinationDropdown(false);
      setRouteDestinationResults([]);
      fetchGeocodeCoordinate(value).then((coord) => {
        if (coord) setRouteDestinationCoord(coord);
      });
    },
    [fetchGeocodeCoordinate]
  );

  useEffect(() => {
    if (selectedPreset !== "autocomplete") return;
    const handle = window.setTimeout(() => {
      fetchAutocomplete(autocompleteQuery);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [autocompleteQuery, fetchAutocomplete, selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "weather") return;
    const handle = window.setTimeout(() => {
      fetchAutocompleteForWeather(weatherQuery);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [fetchAutocompleteForWeather, selectedPreset, weatherQuery]);

  useEffect(() => {
    setWeatherParams((prev) =>
      prev.map((item) => {
        if (item.key === "startDate") return { ...item, value: weatherStartDate };
        if (item.key === "endDate") return { ...item, value: weatherEndDate };
        if (item.key === "unit") return { ...item, value: weatherUnit };
        return item;
      })
    );
  }, [weatherEndDate, weatherStartDate, weatherUnit]);

  useEffect(() => {
    if (selectedPreset !== "autocomplete") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!autocompleteBoxRef.current?.contains(target)) {
        setShowAutocompleteDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "route") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!routeOriginRef.current?.contains(target)) {
        setShowRouteOriginDropdown(false);
      }
      if (!routeDestinationRef.current?.contains(target)) {
        setShowRouteDestinationDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "route") return;
    if (!routeOriginCoord || !routeDestinationCoord) return;
    fetchRouteDirections(routeOriginCoord, routeDestinationCoord);
  }, [fetchRouteDirections, routeDestinationCoord, routeOriginCoord, selectedPreset]);

  useEffect(() => {
    if (selectedPreset !== "weather") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!weatherBoxRef.current?.contains(target)) {
        setShowWeatherDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [selectedPreset]);

  const renderWeatherTable = (body: unknown) => {
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
    const root = parsed as { records?: unknown; results?: unknown; data?: unknown };
    const records =
      (Array.isArray(root.records) && root.records) ||
      (Array.isArray(root.results) && root.results) ||
      (Array.isArray(root.data) && root.data) ||
      [];
    if (!Array.isArray(records) || records.length === 0) return null;

    const toLabel = (key: string) =>
      key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

    const formatValue = (value: unknown) => {
      if (value === null || value === undefined || value === "") return "—";
      if (typeof value === "number") {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
      }
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const min = obj.min ?? obj.minimum;
        const max = obj.max ?? obj.maximum;
        if (typeof min === "number" || typeof max === "number") {
          return `${min ?? "—"} – ${max ?? "—"}`;
        }
        if (typeof obj.value === "number" || typeof obj.value === "string") {
          return String(obj.value);
        }
        return JSON.stringify(obj);
      }
      return String(value);
    };

    const first = records[0] as Record<string, unknown>;
    const preferred = [
      "date",
      "dateTime",
      "effectiveDate",
      "effectiveDateTime",
      "temperature",
      "temperatureMax",
      "temperatureMin",
      "tempMax",
      "tempMin",
      "precipitation",
      "precip",
      "rain",
      "snow",
      "windSpeed",
      "windGust",
      "windDirection",
      "humidity",
      "cloudCover",
      "pressure",
      "phrase",
      "iconCode",
    ];
    const available = Object.keys(first);
    const columns = [
      ...preferred.filter((key) => available.includes(key)),
      ...available.filter((key) => !preferred.includes(key)),
    ];

    return (
      <div className="overflow-auto rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner">
        <table className="min-w-full text-xs text-slate-700">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-semibold">
                  {toLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row, index) => (
              <tr
                key={index}
                className={index % 2 === 0 ? "border-t border-slate-100" : "border-t border-slate-100 bg-slate-50/40"}
              >
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2 align-top">
                    {formatValue((row as Record<string, unknown>)[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderGeolocationTable = (body: unknown) => {
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
      countryRegion?: { isoCode?: string; name?: string };
      ipAddress?: string;
      isoCode?: string;
    };

    const rows = [
      { label: "IP Address", value: root.ipAddress || root.isoCode || geolocationIp || "—" },
      { label: "Country/Region ISO", value: root.countryRegion?.isoCode || "—" },
      { label: "Country/Region Name", value: root.countryRegion?.name || "—" },
    ];

    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner">
        <table className="min-w-full text-xs text-slate-700">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="w-48 px-4 py-3 text-slate-500">{row.label}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRouteSummary = (body: unknown) => {
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
    const root = parsed as { routes?: unknown; features?: unknown };
    const route = Array.isArray(root.routes) && root.routes.length > 0
      ? (root.routes[0] as {
          summary?: Record<string, unknown>;
          guidance?: { instructions?: Array<Record<string, unknown>> };
          legs?: Array<{ instructions?: Array<Record<string, unknown>> }>;
        })
      : null;
    const summary = route?.summary;

    const formatDistance = (meters?: number) => {
      if (typeof meters !== "number") return "";
      if (meters < 1000) return `${Math.round(meters)} m`;
      return `${(meters / 1000).toFixed(1)} km`;
    };

    const formatDuration = (seconds?: number) => {
      if (typeof seconds !== "number") return "";
      const mins = Math.round(seconds / 60);
      if (mins < 60) return `${mins} min`;
      const hours = Math.floor(mins / 60);
      const rem = mins % 60;
      return `${hours} hr ${rem} min`;
    };

    const instructionList = route
      ? route.guidance?.instructions && route.guidance.instructions.length > 0
        ? route.guidance.instructions
        : route.legs?.flatMap((leg) => leg.instructions ?? []) ?? []
      : [];

    const featureInstructions = Array.isArray(root.features)
      ? root.features
          .map((item) => {
            const props = (item as {
              properties?: {
                type?: string;
                instruction?: { text?: string };
                distanceInMeters?: number;
                durationInSeconds?: number;
              };
            }).properties;
            if (!props?.instruction?.text) return null;
            return {
              text: props.instruction.text,
              distanceInMeters: props.distanceInMeters,
              travelTimeInSeconds: props.durationInSeconds,
            } as Record<string, unknown>;
          })
          .filter(Boolean)
      : [];

    const steps = (instructionList.length > 0 ? instructionList : featureInstructions)
      .map((item) => {
        const instruction = item as {
          message?: string;
          instruction?: { text?: string };
          maneuver?: { instruction?: string };
          text?: string;
          distanceInMeters?: number;
          travelTimeInSeconds?: number;
        };
        const text =
          instruction.text ||
          instruction.message ||
          instruction.instruction?.text ||
          instruction.maneuver?.instruction ||
          "";
        return {
          text,
          distance: formatDistance(instruction.distanceInMeters),
          duration: formatDuration(instruction.travelTimeInSeconds),
        };
      })
      .filter((step) => step.text);
    if (!summary && Array.isArray(root.features)) {
      const routePath = root.features.find((item) => {
        const props = (item as { properties?: { type?: string } }).properties;
        return props?.type === "RoutePath";
      }) as { properties?: Record<string, unknown> } | undefined;
      if (routePath?.properties) {
        const props = routePath.properties;
        const rows = Object.entries(props).map(([key, value]) => ({
          label: key.replace(/([a-z])([A-Z])/g, "$1 $2"),
          value: typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
        }));
        return (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner">
              <table className="min-w-full text-xs text-slate-700">
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label} className="border-t border-slate-100">
                      <td className="w-48 px-4 py-3 text-slate-500">{row.label}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {steps.length > 0 && (
              <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-700 shadow-inner">
                <div className="mb-2 text-xs font-semibold text-slate-500">Route Steps</div>
                <ol className="space-y-2 pl-4">
                  {steps.map((step, index) => (
                    <li key={`${index}-${step.text}`} className="list-decimal">
                      <span className="font-semibold text-slate-800">{step.text}</span>
                      {(step.distance || step.duration) && (
                        <span className="ml-2 text-[11px] text-slate-500">
                          {step.distance && <span>{step.distance}</span>}
                          {step.distance && step.duration && <span> · </span>}
                          {step.duration && <span>{step.duration}</span>}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );
      }
    }
    if (!summary) return null;
    const rows = Object.entries(summary).map(([key, value]) => ({
      label: key.replace(/([a-z])([A-Z])/g, "$1 $2"),
      value: typeof value === "number" ? value.toLocaleString() : String(value ?? ""),
    }));
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-inner">
          <table className="min-w-full text-xs text-slate-700">
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-slate-100">
                  <td className="w-48 px-4 py-3 text-slate-500">{row.label}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {steps.length > 0 && (
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-700 shadow-inner">
            <div className="mb-2 text-xs font-semibold text-slate-500">Route Steps</div>
            <ol className="space-y-2 pl-4">
              {steps.map((step, index) => (
                <li key={`${index}-${step.text}`} className="list-decimal">
                  <span className="font-semibold text-slate-800">{step.text}</span>
                  {(step.distance || step.duration) && (
                    <span className="ml-2 text-[11px] text-slate-500">
                      {step.distance && <span>{step.distance}</span>}
                      {step.distance && step.duration && <span> · </span>}
                      {step.duration && <span>{step.duration}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  };

  const execute = useCallback(async () => {
    if (!isValid) return;
    const data = await runRequest(requestShape);
    if (selectedPreset === "weather" && data) {
      setWeatherResponse(data);
    }
  }, [isValid, requestShape, runRequest, selectedPreset]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        execute();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [execute]);

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <section className="glass rounded-3xl p-6 shadow-xl">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Connection
            </label>
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Base URL</span>
                  <input
                    className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="https://atlas.microsoft.com"
                  />
                  {!isBaseUrlSafe(baseUrl) && (
                    <span className="text-xs text-rose-500">
                      Use an https URL without query or hash.
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Auth Mode</span>
                  <div className="flex gap-2">
                    {(["entra", "key"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAuthMode(mode)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          authMode === mode
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-600"
                        }`}
                      >
                        {mode === "entra" ? "Microsoft Entra" : "API Key"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {authMode === "key" ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">API Key (session only)</span>
                  <input
                    type="password"
                    className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="••••••••••"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-slate-500">Maps Client ID (optional override)</span>
                  <input
                    className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Endpoint Path
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    selectedPreset === preset.id
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {preset.id === "geocode"
                    ? "Geocode"
                    : preset.id === "reverse"
                    ? "Reverse Geocode"
                    : preset.id === "autocomplete"
                    ? "Autocomplete"
                    : preset.id === "weather"
                    ? "Weather"
                    : preset.id === "geolocation"
                    ? "IP Geolocation"
                    : "Route"}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
              <div className="text-xs font-semibold text-slate-500">
                Endpoint Path (editable)
              </div>
              <div className="grid gap-3 md:grid-cols-[140px_1fr]">
                <select
                  className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
                  value={method}
                  onChange={(event) =>
                    setMethod(event.target.value as typeof method)
                  }
                >
                  {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map(
                    (value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    )
                  )}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    required
                    aria-required="true"
                    className={`flex-1 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm transition ${
                      isValid ? "border-slate-200/70 text-slate-800" : "border-rose-300 text-slate-800"
                    } ${!isEditingPath ? "bg-slate-50 text-slate-600" : "bg-white"}`}
                    value={path}
                    readOnly={!isEditingPath}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="search/address/json"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEditingPath((prev) => !prev)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:text-slate-900"
                  >
                    {isEditingPath ? "Done" : "Edit"}
                  </button>
                </div>
              </div>
              {selectedPreset === "autocomplete" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      Autocomplete Query
                    </span>
                    <div className="relative">
                      <div className="mb-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Endpoint: <span className="font-semibold">geocode:autocomplete</span>
                      </div>
                      <input
                        ref={autocompleteInputRef}
                        className="w-full rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                        value={autocompleteQuery}
                        onChange={(event) => {
                          setAutocompleteQuery(event.target.value);
                          setShowAutocompleteDropdown(true);
                        }}
                        onFocus={() => setShowAutocompleteDropdown(true)}
                        placeholder="Start typing an address"
                      />
                      {showAutocompleteDropdown &&
                        (autocompleteResults.length > 0 || autocompleteLoading || autocompleteError) && (
                          <div className="absolute left-0 right-0 z-10 mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            {autocompleteLoading && (
                              <div className="px-2 py-2 text-slate-400">Loading suggestions…</div>
                            )}
                            {!autocompleteLoading && autocompleteError && (
                              <div className="px-2 py-2 text-rose-500">{autocompleteError}</div>
                            )}
                            {!autocompleteLoading && !autocompleteError && autocompleteResults.length === 0 && (
                              <div className="px-2 py-2 text-slate-400">No suggestions yet.</div>
                            )}
                            {autocompleteResults.length > 0 && (
                              <ul className="space-y-1">
                                {autocompleteResults.map((item, index) => (
                                  <li key={`${item}-${index}`}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleAutocompletePick(item);
                                      }}
                                      onClick={() => handleAutocompletePick(item)}
                                      className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                                    >
                                      {item}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Suggestions update as you type (min 3 characters).
                    </span>
                  </div>
                </div>
              ) : selectedPreset === "weather" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      Weather Address
                    </span>
                    <div ref={weatherBoxRef} className="relative">
                      <div className="mb-2 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        Autocomplete: <span className="font-semibold">geocode:autocomplete</span>
                      </div>
                      <input
                        ref={weatherInputRef}
                        className="w-full rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                        value={weatherQuery}
                        onChange={(event) => {
                          setWeatherQuery(event.target.value);
                          setShowWeatherDropdown(true);
                        }}
                        onFocus={() => setShowWeatherDropdown(true)}
                        placeholder="Start typing an address"
                      />
                      {showWeatherDropdown &&
                        (weatherResults.length > 0 || weatherLoading || weatherError) && (
                          <div className="absolute left-0 right-0 z-10 mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            {weatherLoading && (
                              <div className="px-2 py-2 text-slate-400">Loading suggestions…</div>
                            )}
                            {!weatherLoading && weatherError && (
                              <div className="px-2 py-2 text-rose-500">{weatherError}</div>
                            )}
                            {!weatherLoading && !weatherError && weatherResults.length === 0 && (
                              <div className="px-2 py-2 text-slate-400">No suggestions yet.</div>
                            )}
                            {weatherResults.length > 0 && (
                              <ul className="space-y-1">
                                {weatherResults.map((item, index) => (
                                  <li key={`${item}-${index}`}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleWeatherPick(item);
                                      }}
                                      onClick={() => handleWeatherPick(item)}
                                      className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                                    >
                                      {item}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Suggestions update as you type (min 3 characters).
                    </span>
                  </div>
                </div>
              ) : selectedPreset === "geolocation" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">
                      IP Address
                    </span>
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                      Endpoint: <span className="font-semibold">geolocation/ip/json</span>
                    </div>
                    <input
                      className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                      value={geolocationIp}
                      onChange={(event) => setGeolocationIp(event.target.value)}
                      placeholder="8.8.8.8"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fetchGeolocation(geolocationIp)}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                      >
                        Lookup IP
                      </button>
                      <span className="text-[11px] text-slate-400">
                        Returns ISO country/region code for the IP.
                      </span>
                    </div>
                  </div>
                </div>
              ) : selectedPreset === "route" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">Origin</span>
                    <div ref={routeOriginRef} className="relative">
                      <input
                        className="w-full rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                        value={routeOrigin}
                        onChange={(event) => {
                          setRouteOrigin(event.target.value);
                          setShowRouteOriginDropdown(true);
                          fetchRouteAutocomplete(
                            event.target.value,
                            setRouteOriginResults,
                            setRouteOriginError,
                            setRouteOriginLoading,
                            setShowRouteOriginDropdown
                          );
                        }}
                        onFocus={() => setShowRouteOriginDropdown(true)}
                        placeholder="Start typing an origin address"
                      />
                      {showRouteOriginDropdown &&
                        (routeOriginResults.length > 0 || routeOriginLoading || routeOriginError) && (
                          <div className="absolute left-0 right-0 z-10 mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            {routeOriginLoading && (
                              <div className="px-2 py-2 text-slate-400">Loading suggestions…</div>
                            )}
                            {!routeOriginLoading && routeOriginError && (
                              <div className="px-2 py-2 text-rose-500">{routeOriginError}</div>
                            )}
                            {!routeOriginLoading && !routeOriginError && routeOriginResults.length === 0 && (
                              <div className="px-2 py-2 text-slate-400">No suggestions yet.</div>
                            )}
                            {routeOriginResults.length > 0 && (
                              <ul className="space-y-1">
                                {routeOriginResults.map((item, index) => (
                                  <li key={`${item}-${index}`}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleRouteOriginPick(item);
                                      }}
                                      onClick={() => handleRouteOriginPick(item)}
                                      className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                                    >
                                      {item}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">Destination</span>
                    <div ref={routeDestinationRef} className="relative">
                      <input
                        className="w-full rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                        value={routeDestination}
                        onChange={(event) => {
                          setRouteDestination(event.target.value);
                          setShowRouteDestinationDropdown(true);
                          fetchRouteAutocomplete(
                            event.target.value,
                            setRouteDestinationResults,
                            setRouteDestinationError,
                            setRouteDestinationLoading,
                            setShowRouteDestinationDropdown
                          );
                        }}
                        onFocus={() => setShowRouteDestinationDropdown(true)}
                        placeholder="Start typing a destination address"
                      />
                      {showRouteDestinationDropdown &&
                        (routeDestinationResults.length > 0 || routeDestinationLoading || routeDestinationError) && (
                          <div className="absolute left-0 right-0 z-10 mt-2 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-lg">
                            {routeDestinationLoading && (
                              <div className="px-2 py-2 text-slate-400">Loading suggestions…</div>
                            )}
                            {!routeDestinationLoading && routeDestinationError && (
                              <div className="px-2 py-2 text-rose-500">{routeDestinationError}</div>
                            )}
                            {!routeDestinationLoading && !routeDestinationError && routeDestinationResults.length === 0 && (
                              <div className="px-2 py-2 text-slate-400">No suggestions yet.</div>
                            )}
                            {routeDestinationResults.length > 0 && (
                              <ul className="space-y-1">
                                {routeDestinationResults.map((item, index) => (
                                  <li key={`${item}-${index}`}>
                                    <button
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        handleRouteDestinationPick(item);
                                      }}
                                      onClick={() => handleRouteDestinationPick(item)}
                                      className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                                    >
                                      {item}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              ) : (
                !isValid && (
                  <p className="text-xs text-rose-500">
                    Endpoint path is required and must be relative (no protocol or host).
                  </p>
                )
              )}
            </div>
          </div>

          {selectedPreset !== "autocomplete" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    id="query-parameters"
                    className="text-sm font-semibold text-slate-700"
                  >
                    Query Parameters
                  </span>
                  <a
                    href="#reference-values"
                    className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                  >
                    Reference Values
                  </a>
                </div>
                  {selectedPreset === "geocode" ? (
                    <button
                      type="button"
                      onClick={addGeocodeParam}
                      className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:text-slate-800"
                    >
                      + Add Parameter
                    </button>
                  ) : selectedPreset === "reverse" ? (
                    <button
                      type="button"
                      onClick={addReverseParam}
                      className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:text-slate-800"
                    >
                      + Add Parameter
                    </button>
                  ) : selectedPreset === "weather" ? (
                    <button
                      type="button"
                      onClick={addWeatherParam}
                      className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:text-slate-800"
                    >
                      + Add Parameter
                    </button>
                  ) : (
                  <button
                    type="button"
                    onClick={addParam}
                    className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:text-slate-800"
                  >
                    + Add Row
                  </button>
                  )}
              </div>
                {selectedPreset !== "geocode" && selectedPreset !== "reverse" && selectedPreset !== "weather" && (
                <div className="flex flex-wrap gap-2">
                  {quickParams.map((param) => (
                    <button
                      key={param.key}
                      type="button"
                      className="rounded-full border border-slate-200/70 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm transition hover:text-slate-900"
                      onClick={() => upsertParam(param.key, param.value)}
                    >
                      {param.key}
                    </button>
                  ))}
                </div>
              )}
              {selectedPreset === "geocode" ? (
                <div className="space-y-2">
                  {geocodeParams.map((param, index) => (
                    <div
                      key={param.id}
                      className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                    >
                      <label className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={param.enabled}
                          onChange={() =>
                            setGeocodeParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, enabled: !item.enabled }
                                  : item
                              )
                            )
                          }
                        />
                        {param.isCustom ? (
                          <input
                            className="h-8 w-full rounded-md border border-slate-200/70 bg-white px-2 text-xs text-slate-800"
                            placeholder="customParam"
                            value={param.key}
                            onChange={(event) =>
                              setGeocodeParams((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, key: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>{param.key}</span>
                            {param.description && (
                              <span className="text-[11px] font-normal text-slate-400">
                                {param.description}
                              </span>
                            )}
                          </span>
                        )}
                      </label>
                      <input
                        className="h-11 rounded-lg border border-slate-200/70 bg-white px-3 text-sm text-slate-800"
                        placeholder={param.placeholder ?? "Enter value"}
                        value={param.value}
                        onChange={(event) =>
                          setGeocodeParams((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? { ...item, value: event.target.value }
                                : item
                            )
                          )
                        }
                        disabled={!param.enabled}
                      />
                      {param.isCustom && (
                        <button
                          type="button"
                          onClick={() =>
                            setGeocodeParams((prev) =>
                              prev.filter((item) => item.id !== param.id)
                            )
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : selectedPreset === "reverse" ? (
                <div className="space-y-2">
                  {reverseParams.map((param, index) => (
                    <div
                      key={param.id}
                      className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                    >
                      <label className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={param.enabled}
                          onChange={() =>
                            setReverseParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, enabled: !item.enabled }
                                  : item
                              )
                            )
                          }
                        />
                        {param.isCustom ? (
                          <input
                            className="h-8 w-full rounded-md border border-slate-200/70 bg-white px-2 text-xs text-slate-800"
                            placeholder="customParam"
                            value={param.key}
                            onChange={(event) =>
                              setReverseParams((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, key: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>{param.key}</span>
                            {param.description && (
                              <span className="text-[11px] font-normal text-slate-400">
                                {param.description}
                              </span>
                            )}
                          </span>
                        )}
                      </label>
                      <input
                        className="h-11 rounded-lg border border-slate-200/70 bg-white px-3 text-sm text-slate-800"
                        placeholder={param.placeholder ?? "Enter value"}
                        value={param.value}
                        onChange={(event) =>
                          setReverseParams((prev) =>
                            prev.map((item, idx) =>
                              idx === index
                                ? { ...item, value: event.target.value }
                                : item
                            )
                          )
                        }
                        disabled={!param.enabled}
                      />
                      {param.isCustom && (
                        <button
                          type="button"
                          onClick={() =>
                            setReverseParams((prev) =>
                              prev.filter((item) => item.id !== param.id)
                            )
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : selectedPreset === "weather" ? (
                <div className="space-y-2">
                  {weatherParams.map((param, index) => (
                    <div
                      key={param.id}
                      className="grid grid-cols-[minmax(0,1fr)_180px_auto] items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-3 py-2"
                    >
                      <label className="flex items-center gap-3 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={param.enabled}
                          onChange={() =>
                            setWeatherParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, enabled: !item.enabled }
                                  : item
                              )
                            )
                          }
                        />
                        {param.isCustom ? (
                          <input
                            className="h-8 w-full rounded-md border border-slate-200/70 bg-white px-2 text-xs text-slate-800"
                            placeholder="customParam"
                            value={param.key}
                            onChange={(event) =>
                              setWeatherParams((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, key: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>{param.key}</span>
                            {param.description && (
                              <span className="text-[11px] font-normal text-slate-400">
                                {param.description}
                              </span>
                            )}
                          </span>
                        )}
                      </label>
                      {param.key === "startDate" || param.key === "endDate" ? (
                        <input
                          type="date"
                          className="h-11 rounded-lg border border-slate-200/70 bg-white px-3 text-sm text-slate-800"
                          value={param.key === "startDate" ? weatherStartDate : weatherEndDate}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (param.key === "startDate") {
                              setWeatherStartDate(value);
                            } else {
                              setWeatherEndDate(value);
                            }
                            setWeatherParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, value, enabled: true }
                                  : item
                              )
                            );
                          }}
                          disabled={!param.enabled}
                        />
                      ) : param.key === "unit" ? (
                        <select
                          className="h-11 rounded-lg border border-slate-200/70 bg-white px-3 text-sm text-slate-700"
                          value={weatherUnit}
                          onChange={(event) => {
                            const value = event.target.value;
                            setWeatherUnit(value);
                            setWeatherParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, value, enabled: true }
                                  : item
                              )
                            );
                          }}
                          disabled={!param.enabled}
                        >
                          <option value="metric">metric</option>
                          <option value="imperial">imperial</option>
                        </select>
                      ) : (
                        <input
                          className="h-11 rounded-lg border border-slate-200/70 bg-white px-3 text-sm text-slate-800"
                          placeholder={param.placeholder ?? "Enter value"}
                          value={param.value}
                          onChange={(event) =>
                            setWeatherParams((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, value: event.target.value }
                                  : item
                              )
                            )
                          }
                          disabled={!param.enabled}
                        />
                      )}
                      {param.isCustom && (
                        <button
                          type="button"
                          onClick={() =>
                            setWeatherParams((prev) =>
                              prev.filter((item) => item.id !== param.id)
                            )
                          }
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-[11px] font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {params.map((param, index) => (
                    <div
                      key={`${param.key}-${index}`}
                      className="grid grid-cols-[1fr_1fr_auto] gap-2"
                    >
                      <input
                        className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800"
                        placeholder="key"
                        value={param.key}
                        onChange={(event) =>
                          updateParam(index, event.target.value, param.value)
                        }
                      />
                      <input
                        className="rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-800"
                        placeholder="value"
                        value={param.value}
                        onChange={(event) =>
                          updateParam(index, param.key, event.target.value)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeParam(index)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {reverseMissing && (
                <p className="text-xs text-amber-600">
                  Reverse geocode needs lat/lon. Use query="lat,lon" or add lat/lon params.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {selectedPreset !== "autocomplete" && (
              <button
                type="button"
                disabled={!isValid || isLoading}
                onClick={execute}
                className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Sending..." : "Send Request (Ctrl/Cmd+Enter)"}
              </button>
            )}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input
                type="checkbox"
                checked={mockMode}
                onChange={(event) => setMockMode(event.target.checked)}
              />
              Mock Mode
            </label>
            {credentialMissing && !mockMode && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Credentials missing — try Mock Mode
              </span>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-slate-900 p-4 text-slate-100 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">
                Request Preview
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyText(previewUrl)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-brand-400 hover:text-brand-200"
                >
                  Copy URL
                </button>
                <button
                  type="button"
                  onClick={() => copyText(buildCurl(requestShape, baseUrl))}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 transition hover:border-brand-400 hover:text-brand-200"
                >
                  Copy cURL
                </button>
              </div>
            </div>
            <div className="mt-2 break-all text-xs text-slate-300">
              {previewUrl}
            </div>
          </div>
          {selectedPreset === "autocomplete" && autocompleteDiag && (
            <div className="rounded-2xl border border-slate-200/70 bg-emerald-50/80 p-4 text-slate-700 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Autocomplete Request Preview
                </span>
              </div>
              <div className="mt-2 break-all text-xs text-slate-600">
                {autocompleteDiag}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {selectedPreset !== "weather" ? (
            <MapPreview
              response={selectedPreset === "route" ? routeResponse : mapResponse ?? response}
              isLoading={isLoading}
              authMode={authMode}
              apiKey={apiKey}
              clientId={clientId}
              showEmptyState={selectedPreset !== "autocomplete"}
              preferredZoom={selectedPreset === "geolocation" ? 2.8 : undefined}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-slate-700">Weather Results</h2>
              {weatherResponse ? (
                renderWeatherTable(weatherResponse.body) ?? (
                  <div className="min-h-[260px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                    No weather records found.
                  </div>
                )
              ) : (
                <div className="min-h-[260px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                  Pick an address to load weather records.
                </div>
              )}
            </div>
          )}
          {selectedPreset === "geolocation" && (
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-slate-700">IP Geolocation</h2>
              {geolocationResponse ? (
                renderGeolocationTable(geolocationResponse.body) ?? (
                  <div className="min-h-[200px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                    No geolocation data returned.
                  </div>
                )
              ) : (
                <div className="min-h-[200px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                  Enter an IP address to load geolocation data.
                </div>
              )}
            </div>
          )}
          {selectedPreset === "route" && (
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">Route Summary</h2>
              {routeResponse ? (
                renderRouteSummary(routeResponse.body) ?? (
                  <div className="min-h-[200px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                    No route summary returned.
                  </div>
                )
              ) : (
                <div className="min-h-[200px] rounded-2xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-400 shadow-inner">
                  Pick origin and destination to load the route.
                </div>
              )}
              {routeError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {routeError}
                </div>
              )}
            </div>
          )}
          {selectedPreset === "autocomplete" ? (
            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  Autocomplete Response
                </h3>
                <ResultTabs response={autocompleteResponse ?? response} isLoading={isLoading} />
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  Geocode Response
                </h3>
                <ResultTabs response={mapResponse} isLoading={isLoading} />
              </div>
            </div>
          ) : selectedPreset === "weather" ? (
            <ResultTabs response={weatherResponse} isLoading={isLoading} />
          ) : selectedPreset === "geolocation" ? (
            <ResultTabs response={geolocationResponse} isLoading={isLoading} />
          ) : selectedPreset === "route" ? (
            <ResultTabs response={routeResponse} isLoading={isLoading} />
          ) : (
            <ResultTabs response={response} isLoading={isLoading} />
          )}
          <History
            entries={history}
            onDelete={(id) =>
              setHistory((prev) => prev.filter((entry) => entry.id !== id))
            }
            onCopyCurl={(entry) => copyText(buildCurl(entry.request, baseUrl))}
            onRerun={(entry) => {
              setPath(entry.request.path);
              setParams(
                Object.entries(entry.request.params).map(([key, value]) => ({
                  key,
                  value,
                }))
              );
              const match = presets.find((preset) => preset.path === entry.request.path);
              setSelectedPreset(match?.id ?? "custom");
              if (entry.request.baseUrl) {
                setBaseUrl(entry.request.baseUrl);
              }
              runRequest(entry.request);
            }}
          />
        </div>
      </div>
    </section>
  );
}
