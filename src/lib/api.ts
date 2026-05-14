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

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const isApiConfigured = Boolean(baseUrl);

const buildUrl = (path: string) => {
  if (!baseUrl) {
    throw new ApiError(
      "Missing VITE_API_BASE_URL. Point the frontend to your API Gateway endpoint.",
      0,
    );
  }

  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
};

const request = async <T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      "content-type": "application/json",
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
