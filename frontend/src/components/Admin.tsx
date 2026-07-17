'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import {
  exchangeSession,
  createPost,
  editPost,
  deletePost,
  uploadImage,
  fetchPosts,
  getProfile,
  updateProfile,
  fetchSidebar,
  createSidebarItem,
  deleteSidebarItem,
  type PostDTO,
  type ProfileDTO,
  type SidebarItemDTO,
} from '../utils/api';
import { formatRelative } from '../utils/time';
import { Warning, Image } from '@phosphor-icons/react';

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
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
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
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [modalUploading, setModalUploading] = useState(false);
  const [modalSaving, setModalSaving] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; content: string } | null>(null);

  // Sidebar state
  const [sidebarItems, setSidebarItems] = useState<SidebarItemDTO[]>([]);
  const [sidebarFormOpen, setSidebarFormOpen] = useState(false);
  const [sidebarDraft, setSidebarDraft] = useState({
    type: 'image' as 'image' | 'text' | 'markdown',
    title: '',
    content: '',
  });
  const [sidebarSaving, setSidebarSaving] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const profilePromise = getProfile().catch(() => null);
      const sidebarPromise = fetchSidebar().catch(() => []);
      const [postsRes, statsRes, profileRes, sidebarRes] = await Promise.all([
        fetchPosts({ limit: 50, visitorId: null }),
        fetch(`${import.meta.env.PUBLIC_API_BASE ?? ''}/api/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
        profilePromise,
        sidebarPromise,
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
      try {
        const { url } = await uploadImage(token, file);
        setProfileDraft((d) => ({ ...d, avatar_url: url }));
      } catch (err) {
        alert(err instanceof Error ? err.message : '头像上传失败');
      } finally {
        setUploadingAvatar(false);
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
      try {
        const { url } = await uploadImage(token, file);
        setProfileDraft((d) => ({ ...d, cover_image_url: url }));
      } catch (err) {
        alert(err instanceof Error ? err.message : '背景图上传失败');
      } finally {
        setUploadingCover(false);
        e.target.value = '';
      }
    },
    [token],
  );

  const handleModalImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setModalUploading(true);
      try {
        for (const file of Array.from(files)) {
          if (modalImages.length >= 9) break;
          const { url } = await uploadImage(token, file);
          setModalImages((prev) => [...prev, url]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : '图片上传失败');
      } finally {
        setModalUploading(false);
        e.target.value = '';
      }
    },
    [token, modalImages.length],
  );

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
    setModalImages([]);
    setEditModalOpen(true);
  }, []);

  const openEditModal = useCallback((post: PostDTO) => {
    setEditingPost(post);
    setModalContent(post.content);
    setModalImages(post.images);
    setEditModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setEditModalOpen(false);
    setEditingPost(null);
    setModalContent('');
    setModalImages([]);
  }, []);

  /* ---------- Save post from modal ---------- */
  const handleSavePost = useCallback(async () => {
    if (!modalContent.trim()) return;
    setModalSaving(true);
    try {
      if (editingPost) {
        await editPost(token, editingPost.id, { content: modalContent, image_urls: modalImages });
      } else {
        await createPost(token, { content: modalContent, image_urls: modalImages });
      }
      closeModal();
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存失败');
    } finally {
      setModalSaving(false);
    }
  }, [token, modalContent, modalImages, editingPost, closeModal, loadData]);

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

  /* ---------- Sidebar CRUD ---------- */

  const handleAddSidebar = useCallback(async () => {
    if (!sidebarDraft.content.trim()) return;
    setSidebarSaving(true);
    try {
      const item = await createSidebarItem(token, {
        type: sidebarDraft.type,
        title: sidebarDraft.title,
        content: sidebarDraft.content,
        position: sidebarItems.length,
      });
      setSidebarItems((prev) => [...prev, item]);
      setSidebarDraft({ type: 'image', title: '', content: '' });
      setSidebarFormOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSidebarSaving(false);
    }
  }, [token, sidebarDraft, sidebarItems.length]);

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
                className="w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]"
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
                className="w-full resize-none rounded-xl border p-3.5 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
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
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors ${
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
                    className="hidden"
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
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors ${
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
                    className="hidden"
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
                  {post.images.length > 0 && (
                    <span>{post.images.length} 张图</span>
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

      {/* ====== 侧边栏管理 ====== */}
      <div className="mt-8 m-card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: 'var(--fg-muted)' }}
          >
            侧边栏管理
          </h2>
          <button
            type="button"
            onClick={() => setSidebarFormOpen(!sidebarFormOpen)}
            className="rounded-lg px-3 py-1.5 text-sm transition-colors"
            style={{
              color: 'var(--color-accent)',
              backgroundColor: 'var(--color-accent-soft)',
            }}
          >
            {sidebarFormOpen ? '取消' : '+ 添加内容'}
          </button>
        </div>

        {sidebarFormOpen && (
          <motion.div
            className="space-y-3 rounded-xl border p-4"
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              borderColor: 'var(--line)',
              backgroundColor: 'var(--color-surface-2)',
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              {(['image', 'text', 'markdown'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSidebarDraft((d) => ({ ...d, type: t }))}
                  className="rounded-lg border py-2 text-xs font-medium transition-colors"
                  style={{
                    borderColor:
                      sidebarDraft.type === t ? 'var(--color-accent)' : 'var(--line)',
                    backgroundColor:
                      sidebarDraft.type === t ? 'var(--color-accent-soft)' : 'transparent',
                    color:
                      sidebarDraft.type === t ? 'var(--color-accent)' : 'var(--fg-muted)',
                  }}
                >
                  {t === 'image' ? '图片' : t === 'text' ? '文本' : 'Markdown'}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                标题（可选）
              </label>
              <input
                type="text"
                value={sidebarDraft.title}
                onChange={(e) => setSidebarDraft((d) => ({ ...d, title: e.target.value }))}
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

            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--fg-muted)' }}>
                内容
                {sidebarDraft.type === 'image' ? '（图片 URL）' : ''}
              </label>
              {sidebarDraft.type === 'image' ? (
                <input
                  type="url"
                  value={sidebarDraft.content}
                  onChange={(e) => setSidebarDraft((d) => ({ ...d, content: e.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--line)',
                    color: 'var(--fg)',
                  }}
                  placeholder="https://... 图片地址"
                />
              ) : (
                <textarea
                  value={sidebarDraft.content}
                  onChange={(e) => setSidebarDraft((d) => ({ ...d, content: e.target.value }))}
                  rows={sidebarDraft.type === 'markdown' ? 6 : 3}
                  className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--line)',
                    color: 'var(--fg)',
                  }}
                  placeholder={
                    sidebarDraft.type === 'markdown'
                      ? '支持 **Markdown** 语法...'
                      : '输入文本内容...'
                  }
                />
              )}
            </div>

            <button
              type="button"
              onClick={handleAddSidebar}
              disabled={sidebarSaving || !sidebarDraft.content.trim()}
              className="m-btn-primary w-full py-2 text-sm disabled:opacity-50"
            >
              {sidebarSaving ? '添加中...' : '添加到侧边栏'}
            </button>
          </motion.div>
        )}

        {/* Existing sidebar items list */}
        {sidebarItems.length > 0 ? (
          <div className="space-y-2">
            {sidebarItems.map((item) => (
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
                  {item.type === 'image' ? '图' : item.type === 'markdown' ? 'MD' : '文'}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: 'var(--fg)' }}
                  >
                    {item.title || item.content.slice(0, 40)}
                  </p>
                  <span className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {item.type} · 位置 #{item.position}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSidebar(item.id)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[var(--color-accent-soft)]"
                  style={{ color: 'var(--color-accent)' }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm" style={{ color: 'var(--fg-muted)' }}>
            侧边栏还没有内容，点击上方按钮添加~
          </p>
        )}
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
              className="fixed left-1/2 top-8 z-50 w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-2xl"
              style={{ backgroundColor: 'var(--card)', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}
              initial={reduce ? false : { opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
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
                  className="w-full resize-none rounded-xl border p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-[var(--color-accent)]"
                  style={{
                    backgroundColor: 'var(--color-surface-2)',
                    borderColor: 'var(--line)',
                    color: 'var(--fg)',
                  }}
                  autoFocus
                />

                {/* Image previews in modal */}
                {modalImages.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {modalImages.map((url, i) => (
                      <div key={url} className="group relative aspect-square overflow-hidden rounded-lg">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setModalImages((prev) => prev.filter((_, j) => j !== i))}
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between border-t p-5" style={{ borderColor: 'var(--line)' }}>
                <label
                  className="flex cursor-pointer items-center gap-1.5 text-sm transition-colors"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleModalImageUpload}
                    className="hidden"
                    disabled={modalUploading || modalImages.length >= 9}
                  />
                  <Image size={18} />
                  {modalUploading ? '上传中...' : `添加图片 (${modalImages.length}/9)`}
                </label>

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
              className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-6"
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
                  className="rounded-xl px-5 py-2 text-sm transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors"
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
