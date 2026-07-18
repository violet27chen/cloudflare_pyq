'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import {
  exchangeSession,
  createPost,
  editPost,
  deletePost,
  uploadImage,
  uploadMedia,
  fetchPosts,
  getProfile,
  updateProfile,
  getSettings,
  updateSettings,
  fetchSidebar,
  createSidebarItem,
  deleteSidebarItem,
  type PostDTO,
  type ProfileDTO,
  type SidebarItemDTO,
  type ThemeColors,
  type MediaType,
  type MediaItem,
} from '../utils/api';
import { formatRelative } from '../utils/time';
import { Warning, Image, VideoCamera, Play, FilmStrip } from '@phosphor-icons/react';
import { ImageCropper } from './ImageCropper';

/** 写动态模态框中正在编辑的媒体项（含本地预览与上传状态）。 */
interface DraftMedia {
  id: string;
  type: MediaType;
  /** 主资源地址：上传后为 /img/...，上传中为本地的 object URL 预览。 */
  url: string;
  /** 视频 / 实况 的封面（/img/...）。 */
  poster_url?: string;
  uploading?: boolean;
}

/** 从视频文件抓取第一帧作为实况封面（返回 dataURL）。失败返回 null。 */
async function extractPoster(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const objectUrl = URL.createObjectURL(file);
    v.src = objectUrl;
    let done = false;
    const finish = (url: string | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(objectUrl);
      resolve(url);
    };
    const capture = () => {
      try {
        const w = v.videoWidth || 1280;
        const h = v.videoHeight || 720;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(v, 0, 0, w, h);
        finish(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        finish(null);
      }
    };
    v.addEventListener('loadeddata', () => {
      try {
        if (v.duration > 0.05) v.currentTime = Math.min(0.1, v.duration * 0.1);
        else capture();
      } catch {
        capture();
      }
    });
    v.addEventListener('seeked', capture);
    v.addEventListener('error', () => finish(null));
    // 兜底超时，避免某些格式无法解码时一直挂着
    setTimeout(() => finish(null), 8000);
  });
}

/** dataURL -> File（用于把抓取的封面作为图片上传）。 */
async function dataURLtoFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: 'image/jpeg' });
}

/* 上传进度条：percent 为 0-100；传 null 时不显示。 */
function UploadProgress({ percent }: { percent: number | null }) {
  if (percent === null || percent === undefined) return null;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="mt-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--card-2)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${clamped}%`, backgroundColor: 'var(--color-accent)' }}
        />
      </div>
      <p
        className="mt-1 text-right text-[10px] tabular-nums"
        style={{ color: 'var(--fg-muted)' }}
      >
        {clamped}%
      </p>
    </div>
  );
}

/* 主题颜色字段：顺序即展示顺序。defaultHex 用于取色器初始显示（留空=默认）。 */
const COLOR_FIELDS: { key: keyof ThemeColors; label: string; defaultHex: string }[] = [
  { key: 'bg', label: '页面背景', defaultHex: '#ededed' },
  { key: 'card', label: '卡片背景', defaultHex: '#ffffff' },
  { key: 'card_2', label: '次级表面', defaultHex: '#f7f7f7' },
  { key: 'line', label: '边框 / 分割线', defaultHex: '#e3e3e3' },
  { key: 'fg', label: '主文本', defaultHex: '#1a1a1a' },
  { key: 'fg_soft', label: '正文文本', defaultHex: '#4a4a4a' },
  { key: 'fg_muted', label: '次要文本', defaultHex: '#8a8a8a' },
  { key: 'accent', label: '强调色', defaultHex: '#07c160' },
  { key: 'bio', label: '个性签名', defaultHex: '#8a8a8a' },
];

/* ============================================================
 * Admin panel - /admin
 *
 * 功能：
 *   - 密码登录
 *   - 个人信息编辑（昵称、签名、头像上传、背景图上传）
 *   - 发帖 / 编辑帖子（模态框）
 *   - 删除帖子（二次确认）
 *   - 侧边栏管理（图片/文本/Markdown）
 *   - 统计概览
 * ============================================================ */

interface AdminState {
  sessionToken: string | null;
  password: string;
  loading: boolean;
  error: string | null;
}

export function Admin() {
  const reduce = useReducedMotion();
  const [state, setState] = useState<AdminState>({
    sessionToken: null,
    password: '',
    loading: false,
    error: null,
  });

  // Check for existing session on mount.
  useEffect(() => {
    const stored = sessionStorage.getItem('moments_admin_token');
    if (stored) {
      setState((s) => ({ ...s, sessionToken: stored }));
    }
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { token } = await exchangeSession(state.password);
      sessionStorage.setItem('moments_admin_token', token);
      setState((s) => ({ ...s, sessionToken: token, loading: false, password: '' }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : '登录失败',
      }));
    }
  }, [state.password]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('moments_admin_token');
    setState((s) => ({ ...s, sessionToken: null, password: '' }));
  }, []);

  // --- 登录表单 ---
  if (!state.sessionToken) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-[400px] flex-col items-center justify-center px-6">
        <motion.div
          className="m-card w-full p-8"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ color: 'var(--fg)' }}
          >
            管理员登录
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
            Moments 管理后台
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="admin-password"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--fg)' }}
              >
                管理密码
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={state.password}
                onChange={(e) =>
                  setState((s) => ({ ...s, password: e.target.value }))
                }
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--line)',
                  color: 'var(--fg)',
                }}
                placeholder="输入管理密码"
              />
            </div>

            {state.error && (
              <p className="text-sm" style={{ color: 'var(--color-accent)' }}>
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={state.loading}
              className="m-btn-primary w-full py-2.5 text-[15px] disabled:opacity-50"
            >
              {state.loading ? '登录中...' : '登 录'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <AdminDashboard
      token={state.sessionToken}
      onLogout={handleLogout}
    />
  );
}

/* ============================================================
 * Dashboard (after login)
 * ============================================================ */

interface DashboardProps {
  token: string;
  onLogout: () => void;
}

function AdminDashboard({ token, onLogout }: DashboardProps) {
  const reduce = useReducedMotion();
  const [posts, setPosts] = useState<PostDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    total_posts: number;
    total_likes: number;
  } | null>(null);

  // Profile state
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [profileDraft, setProfileDraft] = useState({
    display_name: '',
    bio: '',
    avatar_url: '',
    cover_image_url: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PostDTO | null>(null);
  const [modalContent, setModalContent] = useState('');
  const [modalMedia, setModalMedia] = useState<DraftMedia[]>([]);
  const [modalUploading, setModalUploading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; content: string } | null>(null);

  // Sidebar state
  const [sidebarItems, setSidebarItems] = useState<SidebarItemDTO[]>([]);
  const [sidebarSaving, setSidebarSaving] = useState(false);

  // Interface background state (whole-page image or video)
  const [bgDraft, setBgDraft] = useState<{
    type: 'none' | 'image' | 'video';
    url: string;
  }>({ type: 'none', url: '' });
  const [uploadingBg, setUploadingBg] = useState(false);

  // Theme colors (customizable). Empty string = use default CSS.
  const EMPTY_COLORS: ThemeColors = {
    bg: '',
    card: '',
    card_2: '',
    line: '',
    fg: '',
    fg_soft: '',
    fg_muted: '',
    accent: '',
    bio: '',
  };
  const [themeDraft, setThemeDraft] = useState<ThemeColors>(EMPTY_COLORS);

  /* 上传进度（0-100 / null 表示无上传中）。分别跟踪各上传点。 */
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const [coverProgress, setCoverProgress] = useState<number | null>(null);
  const [modalProgress, setModalProgress] = useState<number | null>(null);
  const [modalDragging, setModalDragging] = useState(false);
  const dragDepth = useRef(0);
  const [bgProgress, setBgProgress] = useState<number | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profilePromise = getProfile().catch(() => null);
      const sidebarPromise = fetchSidebar().catch(() => []);
      const settingsPromise = getSettings().catch(() => null);
      const [postsRes, statsRes, profileRes, sidebarRes, settingsRes] =
        await Promise.all([
          fetchPosts({ limit: 50, visitorId: null }),
          fetch(`${import.meta.env.PUBLIC_API_BASE ?? ''}/api/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => r.json()),
          profilePromise,
          sidebarPromise,
          settingsPromise,
        ]);
      setPosts(postsRes.items);
      if (statsRes.ok) setStats(statsRes.data);
      if (profileRes) {
        setProfile(profileRes);
        setProfileDraft({
          display_name: profileRes.display_name,
          bio: profileRes.bio,
          avatar_url: profileRes.avatar_url,
          cover_image_url: profileRes.cover_image_url,
        });
      }
      if (Array.isArray(sidebarRes)) {
        setSidebarItems(sidebarRes);
      }
      if (settingsRes) {
        setBgDraft({ type: settingsRes.bg_type, url: settingsRes.bg_url });
        if (settingsRes.colors) {
          setThemeDraft({ ...EMPTY_COLORS, ...settingsRes.colors });
        }
      }
    } catch {
      // Silently fail; user can refresh.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ---------- Image upload helpers ---------- */

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingAvatar(true);
      setAvatarProgress(0);
      try {
        const { url } = await uploadImage(token, file, setAvatarProgress);
        setProfileDraft((d) => ({ ...d, avatar_url: url }));
      } catch (err) {
        alert(err instanceof Error ? err.message : '头像上传失败');
      } finally {
        setUploadingAvatar(false);
        setAvatarProgress(null);
        e.target.value = '';
      }
    },
    [token],
  );

  const handleCoverUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingCover(true);
      setCoverProgress(0);
      try {
        const { url } = await uploadImage(token, file, setCoverProgress);
        setProfileDraft((d) => ({ ...d, cover_image_url: url }));
      } catch (err) {
        alert(err instanceof Error ? err.message : '背景图上传失败');
      } finally {
        setUploadingCover(false);
        setCoverProgress(null);
        e.target.value = '';
      }
    },
    [token],
  );

  /* 根据文件 MIME 推断媒体类型（用于粘贴 / 拖拽，用户未显式选按钮时）。
   * 粘贴/拖入的视频按「实况」处理（自动抓封面，获得微信实况的播放效果）。 */
  const inferMediaType = useCallback((file: File): MediaType => {
    if (file.type === 'image/gif') return 'gif';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'live';
    return 'image';
  }, []);

  /* 上传单个文件：先放本地乐观预览，上传完成后替换为服务器地址。 */
  const uploadOneMedia = useCallback(
    async (type: MediaType, file: File) => {
      const id = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setModalMedia((prev) => [...prev, { id, type, url: previewUrl, uploading: true }]);
      try {
        let posterUrl: string | undefined;
        if (type === 'live') {
          const dataUrl = await extractPoster(file);
          if (dataUrl) {
            const posterFile = await dataURLtoFile(dataUrl, `${id}.jpg`);
            posterUrl = (await uploadMedia(token, posterFile, 'post', setModalProgress)).url;
          }
        }
        const res = await uploadMedia(token, file, 'post', setModalProgress);
        // 以客户端选定的类型为准（服务器对视频统一回 video，不能用来覆盖「实况」）。
        setModalMedia((prev) =>
          prev.map((d) =>
            d.id === id
              ? { id, type, url: res.url, poster_url: posterUrl, uploading: false }
              : d,
          ),
        );
      } catch (err) {
        setModalMedia((prev) => prev.filter((d) => d.id !== id));
        URL.revokeObjectURL(previewUrl);
        throw err;
      }
    },
    [token],
  );

  /* 批量添加文件。forceType 来自四个显式按钮；粘贴/拖拽不传则按 MIME 推断。 */
  const addFiles = useCallback(
    async (files: File[], forceType?: MediaType) => {
      const start = modalMedia.length;
      const remaining = Math.max(0, 9 - start);
      const toAdd = files.slice(0, remaining);
      if (toAdd.length === 0) return;

      setModalUploading(true);
      setModalProgress(0);
      try {
        for (const file of toAdd) {
          const type = forceType ?? inferMediaType(file);
          await uploadOneMedia(type, file);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : '媒体上传失败');
      } finally {
        setModalUploading(false);
        setModalProgress(null);
      }
    },
    [modalMedia.length, uploadOneMedia, inferMediaType],
  );

  /* 文件选择（四个显式按钮）：clear value 允许重复选同一文件。 */
  const handleAddMedia = useCallback(
    (type: MediaType, e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      e.target.value = '';
      if (!files || files.length === 0) return;
      addFiles(Array.from(files), type);
    },
    [addFiles],
  );

  /* 粘贴上传：从剪贴板提取图片/动图/视频文件。 */
  const handleModalPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const dt = e.clipboardData;
      if (!dt) return;
      const files: File[] = [];
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );

  /* 拖拽上传：用计数避免子元素冒泡导致的 flicker。 */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setModalDragging(true);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setModalDragging(false);
    }
  }, []);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setModalDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) addFiles(Array.from(files));
    },
    [addFiles],
  );

  const handleRemoveMedia = useCallback((id: string) => {
    setModalMedia((prev) => prev.filter((d) => d.id !== id));
  }, []);

  /* ---------- Interface background upload/save ---------- */

  const handleBgUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadingBg(true);
      setBgProgress(0);
      try {
        const { url } = await uploadMedia(token, file, 'bg', setBgProgress);
        setBgDraft((d) => ({ ...d, url }));
      } catch (err) {
        alert(err instanceof Error ? err.message : '背景上传失败');
      } finally {
        setUploadingBg(false);
        setBgProgress(null);
        e.target.value = '';
      }
    },
    [token],
  );

  // 保存界面背景 + 主题颜色（一次提交完整 settings）
  const handleSaveSettings = useCallback(async () => {
    try {
      const updated = await updateSettings(token, {
        bg_type: bgDraft.type,
        bg_url: bgDraft.type === 'none' ? '' : bgDraft.url,
        colors: themeDraft,
      });
      setBgDraft({ type: updated.bg_type, url: updated.bg_url });
      if (updated.colors) setThemeDraft({ ...EMPTY_COLORS, ...updated.colors });
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    }
  }, [token, bgDraft, themeDraft]);

  /* ---------- Profile save ---------- */
  const handleSaveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      const updated = await updateProfile(token, profileDraft);
      setProfile(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSavingProfile(false);
    }
  }, [token, profileDraft]);

  /* ---------- Post modal open/close ---------- */

  const openCreateModal = useCallback(() => {
    setEditingPost(null);
    setModalContent('');
    setModalMedia([]);
    setEditModalOpen(true);
  }, []);

  const openEditModal = useCallback((post: PostDTO) => {
    setEditingPost(post);
    setModalContent(post.content);
    const base: MediaItem[] =
      post.media && post.media.length > 0
        ? post.media
        : (post.images || []).map((url) => ({ type: 'image' as MediaType, url }));
    setModalMedia(base.map((m) => ({ id: crypto.randomUUID(), ...m })));
    setEditModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setEditModalOpen(false);
    setEditingPost(null);
    setModalContent('');
    setModalMedia([]);
  }, []);

  /* ---------- Save post from modal ---------- */
  const handleSavePost = useCallback(async () => {
    const media = modalMedia
      .filter((m) => !m.uploading)
      .map((m) => ({
        type: m.type,
        url: m.url,
        ...(m.poster_url ? { poster_url: m.poster_url } : {}),
      }));
    if (!modalContent.trim() && media.length === 0) return;
    setModalSaving(true);
    try {
      if (editingPost) {
        await editPost(token, editingPost.id, { content: modalContent, media });
      } else {
        await createPost(token, { content: modalContent, media });
      }
      closeModal();
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setModalSaving(false);
    }
  }, [token, modalContent, modalMedia, editingPost, closeModal, loadData]);

  /* ---------- Delete post ---------- */

  const requestDelete = useCallback((post: PostDTO) => {
    setDeleteConfirm({ id: post.id, content: post.content.slice(0, 60) });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await deletePost(token, deleteConfirm.id);
      setDeleteConfirm(null);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    }
  }, [token, deleteConfirm, loadData]);

  /* ---------- Sidebar CRUD (three columns) ---------- */

  const handleAddSidebar = useCallback(
    async (data: {
      type: 'text' | 'markdown';
      title: string;
      content: string;
      image_url: string;
      image_position: 'above' | 'below';
      placement: 'left' | 'main' | 'right';
    }) => {
      // 图片和文本至少填一项
      if (!data.content.trim() && !data.image_url) return;
      setSidebarSaving(true);
      try {
        const sameColCount = sidebarItems.filter(
          (i) => i.placement === data.placement,
        ).length;
        const item = await createSidebarItem(token, {
          type: data.type,
          title: data.title,
          content: data.content,
          image_url: data.image_url,
          image_position: data.image_position,
          position: sameColCount,
          placement: data.placement,
        });
        setSidebarItems((prev) => [...prev, item]);
      } catch (err) {
        alert(err instanceof Error ? err.message : '添加失败');
      } finally {
        setSidebarSaving(false);
      }
    },
    [token, sidebarItems],
  );

  const handleDeleteSidebar = useCallback(
    async (id: string) => {
      try {
        await deleteSidebarItem(token, id);
        setSidebarItems((prev) => prev.filter((i) => i.id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : '删除失败');
      }
    },
    [token],
  );

  /* ======================== RENDER ======================== */

  return (
    <div className="mx-auto max-w-[960px] px-4 pb-16 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: 'var(--fg)' }}
        >
          Moments 管理
        </h1>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
          style={{ color: 'var(--fg-muted)' }}
        >
          退出登录
        </button>
      </div>

      {/* ====== 统计概览 ====== */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="动态总数" value={stats.total_posts} />
          <StatCard label="获赞总数" value={stats.total_likes} accent />
          <StatCard label="侧边栏" value={sidebarItems.length} />
          <StatCard
            label="今日操作"
            value={
              posts.filter(
                (p) =>
                  new Date(p.created_at).toDateString() === new Date().toDateString(),
              ).length
            }
          />
        </div>
      )}

      {/* ====== 个人信息编辑 ====== */}
      {profile && (
        <div className="m-card mb-6 space-y-4 p-5">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--fg-muted)' }}
          >
            个人信息
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* 昵称 */}
            <div>
              <label
                htmlFor="profile-name"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--fg)' }}
              >
                昵称
              </label>
              <input
                id="profile-name"
                type="text"
                value={profileDraft.display_name}
                maxLength={60}
                onChange={(e) =>
                  setProfileDraft((p) => ({ ...p, display_name: e.target.value }))
                }
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--line)',
                  color: 'var(--fg)',
                }}
                placeholder="你的昵称"
              />
            </div>

            {/* 个性签名 */}
            <div className="sm:col-span-2">
              <label
                htmlFor="profile-bio"
                className="mb-1.5 block text-sm font-medium"
                style={{ color: 'var(--fg)' }}
              >
                个性签名
              </label>
              <textarea
                id="profile-bio"
                value={profileDraft.bio}
                maxLength={280}
                rows={2}
                onChange={(e) =>
                  setProfileDraft((p) => ({ ...p, bio: e.target.value }))
                }
                className="w-full resize-none rounded-md border p-3.5 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--line)',
                  color: 'var(--fg)',
                }}
                placeholder="写点什么介绍自己..."
              />
            </div>
          </div>

          {/* 头像 */}
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: 'var(--fg)' }}
            >
              头像
            </label>
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border text-lg font-bold"
                style={{
                  borderColor: 'var(--line)',
                  backgroundColor: 'var(--color-surface-2)',
                  color: 'var(--fg-muted)',
                }}
              >
                {profileDraft.avatar_url ? (
                  <img
                    src={profileDraft.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (profileDraft.display_name || '?').charAt(0)
                )}
              </div>
              <div className="flex-1">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    uploadingAvatar ? 'opacity-50' : ''
                  }`}
                  style={{
                    borderColor: 'var(--line)',
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--fg-soft)',
                  }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarUpload}
                    className="v-hidden"
                    disabled={uploadingAvatar}
                  />
                  {uploadingAvatar ? '上传中...' : '上传头像'}
                </label>
                {profileDraft.avatar_url && (
                  <button
                    type="button"
                    onClick={() => setProfileDraft((p) => ({ ...p, avatar_url: '' }))}
                    className="ml-2 text-xs transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    清除
                  </button>
                )}
                <UploadProgress percent={avatarProgress} />
              </div>
            </div>
            <input
              type="url"
              value={profileDraft.avatar_url}
              placeholder="或输入图片 URL"
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, avatar_url: e.target.value }))
              }
              className="mt-2 w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--line)',
                color: 'var(--fg-muted)',
              }}
            />
          </div>

          {/* 背景封面图 */}
          <div>
            <label
              className="mb-1.5 block text-sm font-medium"
              style={{ color: 'var(--fg)' }}
            >
              背景封面图
            </label>
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-24 overflow-hidden rounded-lg border bg-cover bg-center"
                style={{
                  borderColor: 'var(--line)',
                  backgroundImage: profileDraft.cover_image_url
                    ? `url(${profileDraft.cover_image_url})`
                    : undefined,
                  backgroundColor: 'var(--color-surface-2)',
                }}
              >
                {!profileDraft.cover_image_url && (
                  <div className="flex h-full w-full items-center justify-center text-xs" style={{ color: 'var(--fg-muted)' }}>
                    无封面
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    uploadingCover ? 'opacity-50' : ''
                  }`}
                  style={{
                    borderColor: 'var(--line)',
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--fg-soft)',
                  }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleCoverUpload}
                    className="v-hidden"
                    disabled={uploadingCover}
                  />
                  {uploadingCover ? '上传中...' : '上传封面'}
                </label>
                {profileDraft.cover_image_url && (
                  <button
                    type="button"
                    onClick={() => setProfileDraft((p) => ({ ...p, cover_image_url: '' }))}
                    className="ml-2 text-xs transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    清除
                  </button>
                )}
                <UploadProgress percent={coverProgress} />
              </div>
            </div>
            <input
              type="url"
              value={profileDraft.cover_image_url}
              placeholder="或输入图片 URL"
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, cover_image_url: e.target.value }))
              }
              className="mt-2 w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--line)',
                color: 'var(--fg-muted)',
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="m-btn-primary mt-2 px-6 py-2.5 text-sm disabled:opacity-50"
          >
            {savingProfile ? '保存中...' : '保存个人信息'}
          </button>
        </div>
      )}

      {/* ====== 界面背景（整站图片/视频） ====== */}
      <div className="m-card mb-6 space-y-4 p-5">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: 'var(--fg-muted)' }}
        >
          界面背景
        </h2>

        {/* 类型选择 */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['none', '无'],
              ['image', '图片'],
              ['video', '视频'],
            ] as const
          ).map(([v, label]) => {
            const active = bgDraft.type === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setBgDraft((d) => ({ ...d, type: v }))}
                className="rounded-lg border px-4 py-2 text-sm transition-colors"
                style={{
                  borderColor: active ? 'var(--color-accent)' : 'var(--line)',
                  backgroundColor: active
                    ? 'var(--color-accent-soft)'
                    : 'transparent',
                  color: active ? 'var(--color-accent)' : 'var(--fg-muted)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {bgDraft.type !== 'none' && (
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-24 overflow-hidden rounded-lg border bg-cover bg-center"
                style={{
                  borderColor: 'var(--line)',
                  backgroundImage: bgDraft.url
                    ? `url(${bgDraft.url})`
                    : undefined,
                  backgroundColor: 'var(--color-surface-2)',
                }}
              >
                {!bgDraft.url && (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    无背景
                  </div>
                )}
              </div>
              <div className="flex-1">
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    uploadingBg ? 'opacity-50' : ''
                  }`}
                  style={{
                    borderColor: 'var(--line)',
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--fg-soft)',
                  }}
                >
                  <input
                    type="file"
                    accept={
                      bgDraft.type === 'video'
                        ? 'video/mp4,video/webm'
                        : 'image/jpeg,image/png,image/webp'
                    }
                    onChange={handleBgUpload}
                    className="v-hidden"
                    disabled={uploadingBg}
                  />
                  {uploadingBg
                    ? '上传中...'
                    : `上传${bgDraft.type === 'video' ? '视频' : '图片'}`}
                </label>
                {bgDraft.url && (
                  <button
                    type="button"
                    onClick={() => setBgDraft((d) => ({ ...d, url: '' }))}
                    className="ml-2 text-xs transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
            <input
              type="url"
              value={bgDraft.url}
              placeholder="或输入背景地址（图片/视频 URL，或以 /img/ 开头）"
              onChange={(e) =>
                setBgDraft((d) => ({ ...d, url: e.target.value }))
              }
              className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--line)',
                color: 'var(--fg-muted)',
              }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleSaveSettings}
          className="m-btn-primary mt-2 px-6 py-2.5 text-sm"
        >
          保存背景
        </button>
        <UploadProgress percent={bgProgress} />
      </div>

      {/* ====== 主题颜色（所有区域背景与文本可自定义） ====== */}
      <div className="m-card mb-6 space-y-4 p-5">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: 'var(--fg-muted)' }}
        >
          主题颜色
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-muted)' }}>
          自定义页面背景、卡片、文本与强调色；留空则使用默认配色。个性签名颜色单独设置。保存后立即全站生效（含首页与后台）。
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLOR_FIELDS.map((f) => (
            <label
              key={f.key}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-2"
              style={{ borderColor: 'var(--line)', backgroundColor: 'var(--card-2)' }}
            >
              <input
                type="color"
                value={themeDraft[f.key] || f.defaultHex}
                onChange={(e) =>
                  setThemeDraft((d) => ({ ...d, [f.key]: e.target.value }))
                }
                className="h-7 w-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={f.label}
              />
              <span
                className="min-w-0 flex-1 truncate text-xs"
                style={{ color: 'var(--fg-soft)' }}
              >
                {f.label}
                {themeDraft[f.key] ? (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                    {themeDraft[f.key]}
                  </span>
                ) : (
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--fg-muted)' }}>
                    默认
                  </span>
                )}
              </span>
              {themeDraft[f.key] && (
                <button
                  type="button"
                  onClick={() => setThemeDraft((d) => ({ ...d, [f.key]: '' }))}
                  className="shrink-0 text-[10px] transition-colors hover:opacity-70"
                  style={{ color: 'var(--color-accent)' }}
                  aria-label={`重置${f.label}`}
                >
                  重置
                </button>
              )}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSaveSettings}
            className="m-btn-primary px-6 py-2.5 text-sm"
          >
            保存颜色
          </button>
          <button
            type="button"
            onClick={() => setThemeDraft(EMPTY_COLORS)}
            className="m-btn-ghost px-5 py-2.5 text-sm"
          >
            全部恢复默认
          </button>
        </div>
      </div>

      {/* ====== 发帖按钮 ====== */}
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={openCreateModal}
          className="m-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          写新动态
        </button>
      </div>

      {/* ====== 帖子列表 ====== */}
      <div className="space-y-3">
        <h2 className="m-meta mb-2 flex items-center gap-2">
          动态列表
        </h2>
        {loading ? (
          <div className="m-card p-6 text-center">
            <span className="m-meta">加载中...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="m-card p-6 text-center">
            <span className="m-meta">还没有发布任何动态</span>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="m-card flex items-start gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="line-clamp-2 text-[15px] leading-relaxed"
                  style={{ color: 'var(--fg)' }}
                >
                  {post.content}
                </p>
                <div className="m-meta mt-1.5 flex items-center gap-3">
                  <span>{formatRelative(post.created_at)}</span>
                  <span>{post.like_count} 赞</span>
                  {((post.media?.length ?? 0) || post.images.length) > 0 && (
                    <span>{(post.media?.length ?? 0) || post.images.length} 个媒体</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => openEditModal(post)}
                  className="rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => requestDelete(post)}
                  className="rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--color-accent-soft)]"
                  style={{ color: 'var(--color-accent)' }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ====== 两列内容管理（左 / 右）— 中间为主区域即动态内容，不单独设置 ====== */}
      <div className="mt-8 grid gap-6">
        <ColumnManager
          placement="left"
          label="左侧列"
          token={token}
          items={sidebarItems.filter((i) => i.placement === 'left')}
          saving={sidebarSaving}
          onAdd={handleAddSidebar}
          onDelete={handleDeleteSidebar}
        />
        <ColumnManager
          placement="right"
          label="右侧列"
          token={token}
          items={sidebarItems.filter((i) => i.placement === 'right')}
          saving={sidebarSaving}
          onAdd={handleAddSidebar}
          onDelete={handleDeleteSidebar}
        />
      </div>

      {/* ==================== MODAL: 编辑/新建帖子 ==================== */}
      <AnimatePresence>
        {editModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
            />

            {/* Modal */}
            <motion.div
              className="fixed left-1/2 top-8 z-50 w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-lg"
              style={{ backgroundColor: 'var(--card)', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
              initial={reduce ? false : { opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onPaste={handleModalPaste}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* 拖拽上传高亮遮罩 */}
              {modalDragging && (
                <div
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}
                >
                  <div
                    className="rounded-lg border-2 border-dashed px-6 py-4 text-sm font-medium"
                    style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                  >
                    松开以上传（图片 / 动图 / 视频 / 实况）
                  </div>
                </div>
              )}
              {/* Modal header */}
              <div className="flex items-center justify-between border-b p-5" style={{ borderColor: 'var(--line)' }}>
                <h3 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>
                  {editingPost ? '编辑动态' : '写新动态'}
                </h3>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  ×
                </button>
              </div>

              {/* Modal body */}
              <div className="p-5">
                <textarea
                  value={modalContent}
                  onChange={(e) => setModalContent(e.target.value)}
                  placeholder="分享你的想法... （支持 Markdown）"
                  rows={6}
                  maxLength={5000}
                  className="w-full resize-none rounded-md border p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: 'var(--color-surface-2)',
                    borderColor: 'var(--line)',
                    color: 'var(--fg)',
                  }}
                  autoFocus
                />

                {/* 媒体预览（图片 / 动图 / 视频 / 实况） */}
                {modalMedia.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {modalMedia.map((m) => {
                      const videoLike = m.type === 'video' || m.type === 'live';
                      return (
                        <div
                          key={m.id}
                          className="group relative aspect-square overflow-hidden rounded-lg"
                          style={{ border: '1px solid var(--line)' }}
                        >
                          {videoLike ? (
                            <video
                              src={m.url}
                              poster={m.poster_url}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <img src={m.url} alt="" className="h-full w-full object-cover" />
                          )}
                          {m.type === 'live' && (
                            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[10px] text-white">
                              实况
                            </span>
                          )}
                          {m.uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
                              上传中…
                            </div>
                          )}
                          {!m.uploading && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMedia(m.id)}
                              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                              aria-label="删除"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between border-t p-5" style={{ borderColor: 'var(--line)' }}>
                <div className="flex flex-wrap items-center gap-1 text-sm" style={{ color: 'var(--fg-muted)' }}>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-[var(--color-surface-2)]">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={(e) => handleAddMedia('image', e)}
                      className="v-hidden"
                      disabled={modalUploading || modalMedia.length >= 9}
                    />
                    <Image size={16} />
                    图片
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-[var(--color-surface-2)]">
                    <input
                      type="file"
                      accept="image/gif"
                      multiple
                      onChange={(e) => handleAddMedia('gif', e)}
                      className="v-hidden"
                      disabled={modalUploading || modalMedia.length >= 9}
                    />
                    <FilmStrip size={16} />
                    动图
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-[var(--color-surface-2)]">
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      multiple
                      onChange={(e) => handleAddMedia('video', e)}
                      className="v-hidden"
                      disabled={modalUploading || modalMedia.length >= 9}
                    />
                    <VideoCamera size={16} />
                    视频
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-[var(--color-surface-2)]">
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime"
                      multiple
                      onChange={(e) => handleAddMedia('live', e)}
                      className="v-hidden"
                      disabled={modalUploading || modalMedia.length >= 9}
                    />
                    <Play size={16} />
                    实况
                  </label>
                  <span className="ml-1 text-xs opacity-70">
                    {modalUploading ? '上传中…' : `${modalMedia.length}/9`}
                  </span>
                </div>
                <UploadProgress percent={modalProgress} />

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePost}
                    disabled={modalSaving || !modalContent.trim()}
                    className="m-btn-primary px-5 py-2 text-sm disabled:opacity-50"
                  >
                    {modalSaving ? '保存中...' : editingPost ? '更新动态' : '发布动态'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ==================== CONFIRM DIALOG: 删除确认 ==================== */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
            />
            <motion.div
              className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg p-6"
              style={{ backgroundColor: 'var(--card)', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
              initial={reduce ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
                  style={{ backgroundColor: 'var(--color-accent-soft)' }}
                >
                  <Warning size={24} weight="fill" className="text-[var(--color-accent)]" />
                </div>
                <div className="flex-1">
                  <h3
                    className="text-base font-semibold"
                    style={{ color: 'var(--fg)' }}
                  >
                    确定要删除这条动态吗？
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: 'var(--fg-muted)' }}
                  >
                    「{deleteConfirm.content}」
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    此操作不可撤销！
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="rounded-md px-5 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-md px-5 py-2.5 text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: 'var(--color-accent)' }}
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ========== Column content manager (left / main / right) ========== */

function ColumnManager({
  placement,
  label,
  token,
  items,
  saving,
  onAdd,
  onDelete,
}: {
  placement: 'left' | 'main' | 'right';
  label: string;
  token: string;
  items: SidebarItemDTO[];
  saving: boolean;
  onAdd: (data: {
    type: 'text' | 'markdown';
    title: string;
    content: string;
    image_url: string;
    image_position: 'above' | 'below';
    placement: 'left' | 'main' | 'right';
  }) => void;
  onDelete: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [textFormat, setTextFormat] = useState<'text' | 'markdown'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePosition, setImagePosition] = useState<'above' | 'below'>('above');

  // 裁剪流程
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropProgress, setCropProgress] = useState<number | null>(null);

  const reset = () => {
    setTextFormat('text');
    setTitle('');
    setContent('');
    setImageUrl('');
    setImagePosition('above');
    setCropFile(null);
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCropFile(file); // 打开裁剪器
  };

  const handleCropped = async (cropped: File) => {
    setCropFile(null);
    setUploading(true);
    setCropProgress(0);
    try {
      const { url } = await uploadMedia(token, cropped, 'post', setCropProgress);
      setImageUrl(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片上传失败');
    } finally {
      setUploading(false);
      setCropProgress(null);
    }
  };

  const handleAdd = async () => {
    if (!content.trim() && !imageUrl) return;
    await onAdd({
      type: textFormat,
      title,
      content,
      image_url: imageUrl,
      image_position: imagePosition,
      placement,
    });
    reset();
    setOpen(false);
  };

  return (
    <div className="m-card space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: 'var(--fg-muted)' }}
        >
          {label}
        </h2>
        <button
          type="button"
          onClick={() => {
            if (open) reset();
            setOpen(!open);
          }}
          className="rounded-lg px-3 py-1.5 text-sm transition-colors"
          style={{
            color: 'var(--color-accent)',
            backgroundColor: 'var(--color-accent-soft)',
          }}
        >
          {open ? '取消' : '+ 添加内容'}
        </button>
      </div>

      {open && (
        <motion.div
          className="space-y-4 rounded-md border p-4"
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{
            borderColor: 'var(--line)',
            backgroundColor: 'var(--color-surface-2)',
          }}
        >
          {/* 标题 */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--fg-muted)' }}
            >
              标题（可选）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--line)',
                color: 'var(--fg)',
              }}
              placeholder="标题..."
              maxLength={100}
            />
          </div>

          {/* 图片（上传 + 裁剪，宽度贴合列宽） */}
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: 'var(--fg-muted)' }}
            >
              图片（可选，上传后可裁剪高度）
            </label>
            {imageUrl ? (
              <div className="space-y-2">
                <div
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <img src={imageUrl} alt="" className="w-full object-cover" />
                </div>
                <div className="flex gap-2">
                  <label
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                    style={{
                      borderColor: 'var(--line)',
                      backgroundColor: 'var(--card)',
                      color: 'var(--fg-soft)',
                    }}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePickImage}
                      className="v-hidden"
                    />
                    重新选择
                  </label>
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="rounded-md px-3 py-1.5 text-xs transition-colors"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    移除图片
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ${
                    uploading ? 'opacity-50' : ''
                  }`}
                  style={{
                    borderColor: 'var(--line)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--fg-soft)',
                  }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePickImage}
                    className="v-hidden"
                    disabled={uploading}
                  />
                  <Image size={16} />
                  {uploading ? '上传中...' : '上传并裁剪图片'}
                </label>
                <UploadProgress percent={cropProgress} />
              </>
            )}
          </div>

          {/* 文本 / Markdown */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                className="block text-xs font-medium"
                style={{ color: 'var(--fg-muted)' }}
              >
                文本内容（可选）
              </label>
              <div className="flex gap-1">
                {(['text', 'markdown'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTextFormat(t)}
                    className="rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
                    style={{
                      borderColor:
                        textFormat === t ? 'var(--color-accent)' : 'var(--line)',
                      backgroundColor:
                        textFormat === t
                          ? 'var(--color-accent-soft)'
                          : 'transparent',
                      color:
                        textFormat === t
                          ? 'var(--color-accent)'
                          : 'var(--fg-muted)',
                    }}
                  >
                    {t === 'text' ? '纯文本' : 'Markdown'}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={textFormat === 'markdown' ? 5 : 3}
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{
                backgroundColor: 'var(--card)',
                borderColor: 'var(--line)',
                color: 'var(--fg)',
              }}
              placeholder={
                textFormat === 'markdown'
                  ? '支持 **Markdown** 语法...'
                  : '输入文本内容...'
              }
            />
          </div>

          {/* 图片位置（仅在同时有图片和文本时有意义） */}
          {imageUrl && content.trim() && (
            <div>
              <label
                className="mb-1 block text-xs font-medium"
                style={{ color: 'var(--fg-muted)' }}
              >
                图片位置
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['above', '图片在文本上方'],
                    ['below', '图片在文本下方'],
                  ] as const
                ).map(([v, lb]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setImagePosition(v)}
                    className="rounded-lg border py-2 text-xs font-medium transition-colors"
                    style={{
                      borderColor:
                        imagePosition === v
                          ? 'var(--color-accent)'
                          : 'var(--line)',
                      backgroundColor:
                        imagePosition === v
                          ? 'var(--color-accent-soft)'
                          : 'transparent',
                      color:
                        imagePosition === v
                          ? 'var(--color-accent)'
                          : 'var(--fg-muted)',
                    }}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || uploading || (!content.trim() && !imageUrl)}
            className="m-btn-primary w-full py-2 text-sm disabled:opacity-50"
          >
            {saving ? '添加中...' : `添加到${label}`}
          </button>
        </motion.div>
      )}

      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const hasImage = !!item.image_url || item.type === 'image';
            const hasText = item.type !== 'image' && !!item.content;
            const badge =
              hasImage && hasText
                ? '图文'
                : hasImage
                  ? '图'
                  : item.type === 'markdown'
                    ? 'MD'
                    : '文';
            const preview =
              item.title ||
              (hasText ? item.content.slice(0, 40) : '图片');
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border p-3"
                style={{ borderColor: 'var(--line)' }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                  style={{
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--fg-muted)',
                  }}
                >
                  {badge}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: 'var(--fg)' }}
                  >
                    {preview}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    位置 #{item.position}
                    {hasImage && hasText
                      ? ` · 图片在${item.image_position === 'below' ? '下' : '上'}`
                      : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-accent-soft)]"
                  style={{ color: 'var(--color-accent)' }}
                >
                  删除
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
          还没有内容，点击上方按钮添加~
        </p>
      )}

      {/* 裁剪弹窗 */}
      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropped}
        />
      )}
    </div>
  );
}

/* ========== Mini stat card ========== */
function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="m-card p-4 text-center">
      <div
        className="text-2xl font-bold"
        style={{ color: accent ? 'var(--color-accent)' : 'var(--fg)' }}
      >
        {value}
      </div>
      <div className="m-meta mt-0.5">{label}</div>
    </div>
  );
}
