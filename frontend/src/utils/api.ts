import { API_BASE } from './config';

/** 动态媒体类型。 */
export type MediaType = 'image' | 'gif' | 'video' | 'live';

/** 单条媒体（图片 / 动图 / 视频 / 实况）。 */
export interface MediaItem {
  type: MediaType;
  /** 主资源地址（/img/... 或 http(s)）。 */
  url: string;
  /** 视频 / 实况 的封面（/img/... 或 http(s)），可选。 */
  poster_url?: string;
}

export interface PostDTO {
  id: string;
  content: string;
  /** 兼容旧客户端：所有媒体主 url 平铺数组。 */
  images: string[];
  /** 带类型的媒体列表。 */
  media: MediaItem[];
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
  cover_image_url: string;
}

/** Themable color tokens. Empty string means "use default CSS variable". */
export interface ThemeColors {
  bg: string; // 页面背景
  card: string; // 卡片背景
  card_2: string; // 次级表面（输入框/骨架）
  line: string; // 边框 / 分割线
  fg: string; // 主文本
  fg_soft: string; // 正文文本
  fg_muted: string; // 次要文本（时间/弱文字）
  accent: string; // 强调色（链接/按钮）
  bio: string; // 个性签名
}

/** Site-wide interface background + theme colors. */
export interface SiteSettingsDTO {
  bg_type: 'none' | 'image' | 'video';
  bg_url: string;
  colors: ThemeColors;
}

export interface SidebarItemDTO {
  id: string;
  type: 'image' | 'text' | 'markdown';
  title: string;
  content: string;
  /** 可选：与文本同存的图片（已裁剪，宽度贴合列宽） */
  image_url: string;
  /** 图片相对文本的位置 */
  image_position: 'above' | 'below';
  position: number;
  placement: 'left' | 'main' | 'right';
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
  data: { content: string; media?: MediaItem[] },
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
  data: { content: string; media?: MediaItem[] },
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

/* ---------- Site settings (interface background) ---------- */

/** GET /api/settings (public) */
export function getSettings() {
  return apiFetch<SiteSettingsDTO>('/api/settings');
}

/** PUT /api/settings (author only) */
export function updateSettings(
  token: string,
  data: { bg_type: 'none' | 'image' | 'video'; bg_url: string; colors: ThemeColors },
) {
  return apiFetch<SiteSettingsDTO>('/api/settings', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** POST /api/upload (author only, multipart)
 *  kind: 'post' (image/gif/video, default) | 'bg' (image or video, larger limit)
 *  onProgress: 0-100 上传进度回调（基于 XHR upload，仅浏览器环境有效）
 *  返回 { url, media_type } —— media_type 为服务器识别的类型（image/gif/video）。 */
export function uploadMedia(
  token: string,
  file: File,
  kind: 'post' | 'bg' = 'post',
  onProgress?: (percent: number) => void,
): Promise<{ url: string; media_type?: 'image' | 'gif' | 'video' }> {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE}/api/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e: ProgressEvent) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      try {
        const body = JSON.parse(
          xhr.responseText,
        ) as ApiResponse<{ url: string; media_type?: 'image' | 'gif' | 'video' }>;
        if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.data) {
          resolve(body.data);
        } else {
          reject(new Error(body.error?.message ?? `上传失败 (${xhr.status})`));
        }
      } catch {
        reject(new Error(`上传失败 (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('网络错误，上传失败'));
    xhr.onabort = () => reject(new Error('上传已取消'));

    xhr.send(formData);
  });
}

/** Post image upload (alias). */
export function uploadImage(
  token: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ url: string }> {
  return uploadMedia(token, file, 'post', onProgress);
}

/** 判断 URL 是否指向视频（按扩展名；用于封面等只有 URL、无 type 字段的场景）。 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(url);
}

/* ---------- Sidebar (author only) ---------- */

/** GET /api/sidebar (public) */
export function fetchSidebar() {
  return apiFetch<SidebarItemDTO[]>('/api/sidebar');
}

/** POST /api/sidebar (author only) */
export function createSidebarItem(
  token: string,
  data: {
    type: 'image' | 'text' | 'markdown';
    title: string;
    content: string;
    image_url?: string;
    image_position?: 'above' | 'below';
    position?: number;
    placement?: 'left' | 'main' | 'right';
  },
) {
  return apiFetch<SidebarItemDTO>('/api/sidebar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}

/** DELETE /api/sidebar/:id (author only) */
export function deleteSidebarItem(token: string, id: string) {
  return apiFetch<{ deleted: boolean }>(`/api/sidebar/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
