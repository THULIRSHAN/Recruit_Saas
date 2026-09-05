const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Kept in memory only, never in localStorage/sessionStorage -- the refresh
// token (httpOnly cookie) is the only thing that survives a reload;
// AuthProvider re-mints an access token from it on mount (see auth-context).
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

async function rawFetch(path: string, options: RequestInit) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (options.body && !isFormData(options.body) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
}

let refreshPromise: Promise<boolean> | null = null;

// Deduplicates concurrent refresh attempts -- several requests can 401 at
// once (e.g. a dashboard firing several fetches in parallel after the access
// token expires) and must not each spend the single-use refresh token.
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await rawFetch('/auth/refresh', { method: 'POST' });
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

const NO_RETRY_PATHS = new Set(['/auth/refresh', '/auth/login', '/auth/register']);

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, options);

  if (res.status === 401 && !NO_RETRY_PATHS.has(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, options);
    }
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const message =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: unknown }).message
        : undefined;
    throw new ApiError(
      res.status,
      body,
      Array.isArray(message) ? message.join(', ') : (message as string | undefined),
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function toQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) =>
    apiRequest<T>(`${path}${toQueryString(params)}`),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, form: FormData) =>
    apiRequest<T>(path, { method: 'POST', body: form }),
};
