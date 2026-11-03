export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: FieldErrors };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "We couldn't reach Storiva. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => ({}))) as { data?: T } & ErrorBody;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? "UNKNOWN",
      payload.error?.message ?? "Something went wrong. Please try again.",
      payload.error?.fields,
    );
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: (path: string) => request<undefined>("DELETE", path),
};

export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
