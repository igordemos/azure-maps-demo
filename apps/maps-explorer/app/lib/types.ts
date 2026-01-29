export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Param = {
  key: string;
  value: string;
};

export type RequestShape = {
  path: string;
  params: Record<string, string>;
  method: HttpMethod;
  baseUrl?: string;
  body?: unknown;
  auth?: {
    apiKey?: string;
    clientId?: string;
  };
};

export type ApiResponseMeta = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  durationMs: number;
  url: string;
};

export type ApiResponse<T = unknown> = {
  meta: ApiResponseMeta;
  body: T;
  raw: string;
  errorCode?: string;
};

export type HistoryEntry = {
  id: string;
  request: RequestShape;
  timestamp: number;
  status: number;
  durationMs: number;
};
