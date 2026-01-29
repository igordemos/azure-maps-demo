import type { RequestShape } from "./types";
import { buildQueryString, normalizePath } from "./validation";

export const buildCurl = (
  request: RequestShape,
  baseUrl = "https://atlas.microsoft.com",
  tokenPlaceholder = "Bearer ***"
) => {
  const path = normalizePath(request.path);
  const query = buildQueryString(request.params);
  const url = `${baseUrl.replace(/\/$/, "")}/${path}${
    query ? `?${query}` : ""
  }`;

  const authHeader = request.auth?.apiKey
    ? "subscription-key: ***"
    : `Authorization: ${tokenPlaceholder}`;

  const body = request.body ? JSON.stringify(request.body) : "";
  const bodyArg = body ? ` -H "content-type: application/json" -d '${body}'` : "";

  return `curl -X ${request.method} "${url}" -H "${authHeader}"${bodyArg}`;
};
