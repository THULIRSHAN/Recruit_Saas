import type { PaginatedResponse, PublicJob } from './types';

// Server-side only (used from RSC page components) -- talks to the backend
// directly, no browser CORS/cookie concerns since there's no user session
// involved for these public, unauthenticated endpoints.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function searchPublicJobs(params: {
  keyword?: string;
  location?: string;
  employmentType?: string;
}): Promise<PaginatedResponse<PublicJob>> {
  const url = new URL('/api/v1/jobs/search', API_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set('pageSize', '50');

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    return { data: [], meta: { page: 1, pageSize: 50, total: 0 } };
  }
  return res.json();
}

export async function getPublicJob(id: string): Promise<PublicJob | null> {
  const res = await fetch(new URL(`/api/v1/jobs/public/${id}`, API_BASE), {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}
