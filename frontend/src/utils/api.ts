import { API_BASE } from './config';

export interface PostDTO {
  id: string;
  content: string;
  images: string[];
  created_at: string;
  updated_at: string;
  like_count: number;
  liked: boolean;
}

export interface ListResult<T> {
  items: T[];
  next_cursor: string | null;
}

export interface ProfileDTO {
  display_name: string;
  bio: string;
  avatar_url: string;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/**
 * Typed fetch helper. Throws on non-ok or API error envelope.
 */
async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await res.text();

  // Guard against the common dev misconfiguration where the request hits
  // the dev server and returns HTML instead of JSON.
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      `API returned HTML (status ${res.status}). ` +
        `Check that PUBLIC_API_BASE points to the Worker (e.g. http://localhost:8787).`,
    );
  }

  let body: ApiResponse<T>;
  try {
    body = JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new Error(`API returned invalid JSON: ${text.slice(0, 100)}`);
  }

  if (!body.ok || !body.data) {
    const msg = body.error?.message ?? res.statusText;
    const err = new Error(msg) as Error & { code?: string };
    err.code = body.error?.code;
    throw err;
  }
  return body.data;
}

/** GET /api/posts?cursor=&limit=&visitor= */
export function fetchPosts(opts: {
  cursor?: string | null;
  limit?: number;
  visitorId: string | null;
}) {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.visitorId) params.set('visitor', opts.visitorId);
  return apiFetch<ListResult<PostDTO>>(
    `/api/posts?${params.toString()}`,
  );
}

/** POST /api/posts/:id/like */
export function likePost(postId: string, visitorId: string) {
  return apiFetch<{ liked: boolean; like_count: number }>(
    `/api/posts/${postId}/like`,
    {
      method: 'POST',
      body: JSON.stringify({ visitor_id: visitorId }),
    },
  );
}

/** DELETE /api/posts/:id/like?visitor_id= */
export function unlikePost(postId: string, visitorId: string) {
  return apiFetch<{ liked: boolean; like_count: number }>(
    `/api/posts/${postId}/like?visitor_id=${encodeURIComponent(visitorId)}`,
    { method: 'DELETE' },
  );
}

/** POST /api/posts (author only) */
export function createPost(
  token: string,
  data: { content: string; image_urls?: string[] },
) {
  return apiFetch<PostDTO>('/api/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** PATCH /api/posts/:id (author only) */
export function editPost(
  token: string,
  postId: string,
  data: { content: string; image_urls?: string[] },
) {
  return apiFetch<PostDTO>(`/api/posts/${postId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** DELETE /api/posts/:id (author only) */
export function deletePost(token: string, postId: string) {
  return apiFetch<{ deleted: boolean }>(`/api/posts/${postId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** POST /api/auth/session  { password } -> { token, expires_in } */
export function exchangeSession(password: string) {
  return apiFetch<{ token: string; expires_in: number }>(
    '/api/auth/session',
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  );
}

/** GET /api/profile (public) */
export function getProfile() {
  return apiFetch<ProfileDTO>('/api/profile');
}

/** PUT /api/profile (author only) */
export function updateProfile(
  token: string,
  data: Partial<ProfileDTO>,
) {
  return apiFetch<ProfileDTO>('/api/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** POST /api/upload (author only, multipart) */
export async function uploadImage(
  token: string,
  file: File,
): Promise<{ url: string }> {
  const url = `${API_BASE}/api/upload`;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = (await res.json()) as ApiResponse<{ url: string }>;
  if (!body.ok || !body.data) {
    throw new Error(body.error?.message ?? 'Upload failed.');
  }
  return body.data;
}
