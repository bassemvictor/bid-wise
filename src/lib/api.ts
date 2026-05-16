import { fetchAuthSession } from "aws-amplify/auth";

import outputs from "../../amplify_outputs.json";

export class ApiError extends Error {
  status: number;

  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type AmplifyOutputs = {
  custom?: {
    API?: {
      alimexTenderPricingApi?: {
        endpoint?: string;
      };
    };
  };
};

const configuredApiEndpoint =
  (outputs as AmplifyOutputs).custom?.API?.alimexTenderPricingApi?.endpoint ?? "";

const baseUrl = (configuredApiEndpoint || import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const isApiConfigured = Boolean(baseUrl);

const buildUrl = (path: string) => {
  if (!baseUrl) {
    throw new ApiError(
      "Missing API base URL. Regenerate amplify_outputs.json or set VITE_API_BASE_URL.",
      0,
    );
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

const getActorHeaders = () => {
  if (typeof window === "undefined") {
    return {};
  }

  const actorId =
    window.localStorage.getItem("alimex.actorId") ??
    window.localStorage.getItem("alimexActorId") ??
    "";
  const actorName =
    window.localStorage.getItem("alimex.actorName") ??
    window.localStorage.getItem("alimexActorName") ??
    "";
  const actorEmail =
    window.localStorage.getItem("alimex.actorEmail") ??
    window.localStorage.getItem("alimexActorEmail") ??
    "";

  return {
    ...(actorId ? { "x-user-id": actorId } : {}),
    ...(actorName ? { "x-user-name": actorName } : {}),
    ...(actorEmail ? { "x-user-email": actorEmail } : {}),
  };
};

const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken;
    const accessToken = session.tokens?.accessToken;
    const authorizationToken = idToken?.toString() ?? accessToken?.toString() ?? "";
    const payload = idToken?.payload ?? accessToken?.payload ?? {};

    return {
      ...(authorizationToken ? { authorization: `Bearer ${authorizationToken}` } : {}),
      ...(typeof payload.sub === "string" ? { "x-user-id": payload.sub } : {}),
      ...(typeof payload.name === "string" ? { "x-user-name": payload.name } : {}),
      ...(typeof payload.email === "string" ? { "x-user-email": payload.email } : {}),
    };
  } catch {
    return {};
  }
};

const request = async <T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> => {
  const authHeaders = await getAuthHeaders();
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      "content-type": "application/json",
      ...getActorHeaders(),
      ...authHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
};

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
