'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import Avatar from './Avatar';
import { apiFetch } from '@/lib/api-client';
import { encodeAvatar } from '@/lib/avatar-encode';
import { MAX_AVATAR_BYTES } from '@/lib/avatar';

/** 选文件时先按这个挡一道。真正的上限在压缩之后,由服务端再卡一次 */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/**
 * "我的"页里的换头像控件。
 *
 * 流程:选图 → 浏览器里居中裁方 + 缩到 256 → 本地预览 → 确认后把压好的字节 POST 上去。
 * 没有拖拽/缩放的裁剪框 —— 居中裁方对头像来说够用,那一套交互的代码量比这里其余部分加起来还多。
 */
export default function AvatarUploader() {
  const { user, setAvatarUrl } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 预览用的是 createObjectURL,换一张或离开页面时必须还回去,否则这张图会一直占着内存
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.previewUrl); }, [pending]);

  if (!user) return null;

  function replacePending(next: { blob: Blob; previewUrl: string } | null) {
    setPending((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return next;
    });
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (file.size > MAX_SOURCE_BYTES) {
      setError('这张图太大了,请选 12MB 以内的');
      return;
    }
    setBusy(true);
    try {
      replacePending(await encodeAvatar(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '这张图处理不了,换一张试试');
    } finally {
      setBusy(false);
      // 清掉 input 的值,否则连着选同一个文件不会触发 change
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function upload() {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/avatar', {
        method: 'POST',
        // 直接发图片字节。Content-Type 只是给服务端做参考,那边认的是文件魔数
        headers: { 'Content-Type': pending.blob.type },
        body: pending.blob,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? '上传失败,请重试');
        return;
      }
      setAvatarUrl(data.avatarUrl ?? null);
      replacePending(null);
    } catch {
      setError('网络不太好，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/avatar', { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? '删除失败,请重试');
        return;
      }
      setAvatarUrl(null);
      replacePending(null);
    } catch {
      setError('网络不太好，请重试');
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = pending?.previewUrl ?? user.avatarUrl ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar
          emoji={user.avatar}
          url={previewUrl}
          alt={pending ? '新头像预览' : '我的头像'}
          className="size-20 rounded-[1.6rem] border-4 border-white/70 bg-white text-4xl shadow-lg"
        />
        <div className="min-w-0 space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl bg-white/25 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            <Camera size={16} />{user.avatarUrl || pending ? '换一张' : '上传头像'}
          </button>
          <p className="text-[11px] font-bold leading-relaxed text-white/75">
            会自动居中裁成方形,压到 256×256({Math.floor(MAX_AVATAR_BYTES / 1024)}KB 以内)
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => { void pickFile(event.target.files?.[0]); }}
      />

      {error && <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-bold text-white">{error}</p>}

      {pending && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { void upload(); }}
            disabled={busy}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-4 text-sm font-black text-emerald-600 disabled:opacity-60"
          >
            {busy ? <><Loader2 size={16} className="animate-spin" />上传中…</> : '确认使用'}
          </button>
          <button
            type="button"
            onClick={() => { replacePending(null); setError(''); }}
            disabled={busy}
            className="min-h-10 rounded-2xl bg-white/20 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            取消
          </button>
        </div>
      )}

      {!pending && user.avatarUrl && (
        <button
          type="button"
          onClick={() => { void removeAvatar(); }}
          disabled={busy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-white/15 px-3 text-xs font-black text-white/90 disabled:opacity-60"
        >
          <Trash2 size={14} />恢复默认头像
        </button>
      )}
    </div>
  );
}
