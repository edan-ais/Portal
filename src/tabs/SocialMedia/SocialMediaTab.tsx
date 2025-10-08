import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Share2,
  Plus,
  Trash2,
  Folder,
  FolderArchive,
  UploadCloud,
  FileText,
  MoveRight,
  ShieldCheck,
  RefreshCcw,
  Eye,
  Printer,
  Save,
  PlayCircle,
  Lock,
  ChevronLeft,
  Pencil,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

type UUID = string;

interface SocialFolder {
  id: UUID;
  name: string;
  slug: string;
  folder_path: string; // e.g., "events/"
  created_at?: string;
}

interface FileItem {
  name: string;      // filename.pdf
  path: string;      // folderSlug/filename.pdf, or folderSlug/archive/filename.pdf
  signedUrl?: string;
  isArchive?: boolean;
  mimeType?: string;
  created_at?: string;
  size?: number;
}

interface Profile {
  id: UUID;
  role?: string | null;
}

interface DeletedItem {
  id: string;
  kind: 'file' | 'folder';
  product_id: string | null;       // reused column name from existing schema
  original_path: string | null;
  trash_path: string | null;
  product_snapshot: any | null;    // reused to carry folder snapshot
  deleted_at: string;
}

interface VideoStatusMeta {
  is_video_creating?: boolean;
  processing?: boolean;
  status?: string; // e.g. "creating" | "idle"
  last_run?: string | null;
  cooldown_seconds?: number;
  started_at?: string | null;
  eta_seconds?: number | null;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

const SOCIAL_BUCKET = 'social';
const ARCHIVE_DIR = 'archive';
const TRASH_PREFIX = '_trash/';
const LAST_UPLOAD_KEY = 'social_last_upload_at';
const AUTO_CREATE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ---------- Helpers ----------
function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function formatDate(d?: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(ms: number) {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------- Component ----------
export default function SocialMediaTab() {
  // Global state
  const [loading, setLoading] = useState(true);
  const [heartbeatOk, setHeartbeatOk] = useState<boolean | null>(null);
  const [heartbeatAt, setHeartbeatAt] = useState<Date | null>(null);
  const [videoStatus, setVideoStatus] = useState<VideoStatusMeta | null>(null);

  const [folders, setFolders] = useState<SocialFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<UUID | null>(null);  // null => grid
  const [editingFolderId, setEditingFolderId] = useState<UUID | null>(null);    // inline rename

  const [isAdmin, setIsAdmin] = useState(false);

  // Edits + saving
  const [editBuffer, setEditBuffer] = useState<Record<UUID, { name: string }>>({});
  const [autoSaving, setAutoSaving] = useState(false);
  const [manualSaveDirty, setManualSaveDirty] = useState(false);
  const debounceTimers = useRef<Record<UUID, any>>({});

  // Files in current folder
  const [files, setFiles] = useState<FileItem[]>([]);
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  // Notification system
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const addNotification = (type: 'success' | 'error' | 'info', message: string, duration = 5000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setNotifications((prev) => [...prev, { id, type, message, duration }]);
  };
  const removeNotification = (id: string) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  // Trash modal
  const [trashOpen, setTrashOpen] = useState(false);
  const [recentlyDeleted, setRecentlyDeleted] = useState<DeletedItem[]>([]);

  // Debug
  const [showDebug, setShowDebug] = useState(false);

  // Video creation countdown
  const [nowTick, setNowTick] = useState<number>(Date.now()); // rerender per second
  const [lastUploadAt, setLastUploadAt] = useState<number | null>(() => {
    const v = localStorage.getItem(LAST_UPLOAD_KEY);
    return v ? Number(v) : null;
  });
  const isCreating = !!(
    videoStatus?.is_video_creating ||
    videoStatus?.processing ||
    (videoStatus?.status && videoStatus.status.toLowerCase().includes('creat'))
  );

  // ------ Bootstrap ------
  useEffect(() => {
    (async () => {
      setLoading(true);
      // Admin detection
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes?.session?.user;
      let admin = false;
      if (user?.app_metadata && (user.app_metadata as any)?.role === 'admin') admin = true;
      else if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', user.id)
          .maybeSingle<Profile>();
        if (profile?.role === 'admin') admin = true;
      }
      setIsAdmin(admin);

      try {
        const { error: bucketError } = await supabase.storage.from(SOCIAL_BUCKET).list('', { limit: 1 });
        if (bucketError) {
          if (bucketError.message.includes('not found')) {
            console.warn('[Social] Bucket "social" does not exist. Please create it in Supabase Dashboard.');
          } else {
            console.error('[Social] Storage access error:', bucketError.message);
          }
        } else {
          console.log('[Social] Bucket found');
        }
      } catch (e) {
        console.error('[Social] Error checking bucket:', e);
      }

      // Folders
      const { data: fold } = await supabase.from('social_folders').select('*').order('created_at', { ascending: true });
      let list: SocialFolder[] = (fold || []) as SocialFolder[];

      if (!list || list.length === 0) {
        // seed defaults (idempotent)
        const seed = [
          { name: 'Events', slug: 'events', folder_path: 'events/' },
          { name: 'In-Store', slug: 'in-store', folder_path: 'in-store/' },
          { name: 'Podcast', slug: 'podcast', folder_path: 'podcast/' }
        ];
        const { data: inserted } = await supabase.from('social_folders').insert(seed).select('*');
        list = (inserted || []) as SocialFolder[];
      }
      setFolders(list);

      await pingHeartbeat();
      await fetchVideoStatus();
      const hb = setInterval(pingHeartbeat, 30_000);
      const vs = setInterval(fetchVideoStatus, 10_000);
      const tick = setInterval(() => setNowTick(Date.now()), 1000);
      setLoading(false);
      return () => {
        clearInterval(hb);
        clearInterval(vs);
        clearInterval(tick);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When entering a folder, load files
  useEffect(() => {
    (async () => {
      if (!selectedFolderId) {
        setFiles([]);
        return;
      }
      const f = folders.find((x) => x.id === selectedFolderId);
      if (!f) return;
      await ensureFolderPlaceholders(f);
      await loadFiles(f);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, folders.length]);

  // ------ Monitor & Video Service ------
  const serviceUrl = import.meta.env.VITE_SOCIAL_VIDEO_URL as string | undefined;
  const serviceSecret = import.meta.env.VITE_SOCIAL_VIDEO_SECRET as string | undefined;

  const pingHeartbeat = async () => {
    if (!serviceUrl) {
      setHeartbeatOk(null);
      return;
    }
    try {
      const res = await fetch(`${serviceUrl}/`, { method: 'GET' });
      setHeartbeatOk(res.ok);
      setHeartbeatAt(new Date());
    } catch {
      setHeartbeatOk(false);
      addNotification('error', 'Status check failed');
    }
  };

  const fetchVideoStatus = async () => {
    if (!serviceUrl) return;
    try {
      const res = await fetch(`${serviceUrl}/api/status`, { method: 'GET' });
      if (!res.ok) return;
      const data: VideoStatusMeta = await res.json();
      setVideoStatus(data || null);
    } catch {
      /* noop */
    }
  };

  const triggerVideoCreate = async () => {
    if (!serviceUrl) {
      addNotification('error', 'Video service URL not configured');
      return;
    }
    try {
      const res = await fetch(`${serviceUrl}/api/run`, {
        method: 'POST',
        headers: serviceSecret ? { Authorization: `Bearer ${serviceSecret}` } : {}
      });
      if (!res.ok) throw new Error('failed to trigger video creation');
      await fetchVideoStatus();
      addNotification('success', 'Video creation started');
    } catch (e) {
      console.error(e);
      addNotification('error', 'Failed to start video creation. Check configuration.');
    }
  };

  // ------ Storage helpers ------
  async function ensureFolderPlaceholders(folder: SocialFolder) {
    const keepMain = `${folder.folder_path}.keep`;
    const keepArchive = `${folder.folder_path}${ARCHIVE_DIR}/.keep`;
    try {
      const listMain = await supabase.storage.from(SOCIAL_BUCKET).list(folder.folder_path, { limit: 1 });
      if (!listMain.data || listMain.data.length === 0) {
        await supabase.storage.from(SOCIAL_BUCKET).upload(keepMain, new Blob([''], { type: 'text/plain' }), {
          upsert: true
        });
      }
    } catch (_) {}
    try {
      const listArc = await supabase.storage.from(SOCIAL_BUCKET).list(`${folder.folder_path}${ARCHIVE_DIR}`, {
        limit: 1
      });
      if (!listArc.data || listArc.data.length === 0) {
        await supabase.storage.from(SOCIAL_BUCKET).upload(keepArchive, new Blob([''], { type: 'text/plain' }), {
          upsert: true
        });
      }
    } catch (_) {}
  }

  async function loadFiles(folder: SocialFolder) {
    const { data: dbFiles, error } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', folder.id)
      .eq('is_trashed', false)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Social] Error loading files:', error);
      return;
    }
    const fileItems: FileItem[] = (dbFiles || []).map((f: any) => ({
      name: f.name,
      path: f.file_path,
      created_at: f.created_at,
      size: f.file_size,
      mimeType: f.mime_type,
      isArchive: f.file_path.includes(`/${ARCHIVE_DIR}/`)
    }));
    setFiles(fileItems);
  }

  async function signUrl(path: string) {
    const { data, error } = await supabase.storage.from(SOCIAL_BUCKET).createSignedUrl(path, 60 * 10);
    if (error) return null;
    return data?.signedUrl || null;
  }

  // ------ File actions ------
  async function openFile(file: FileItem) {
    const url = await signUrl(file.path);
    if (!url) return;
    setPreviewFile({ ...file, signedUrl: url });
    setPreviewOpen(true);
  }

  async function printFile(file: FileItem) {
    const url = await signUrl(file.path);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function moveToArchive(file: FileItem) {
    if (file.isArchive) return;
    const f = folders.find((x) => x.id === selectedFolderId);
    if (!f) return;
    const dest = `${f.folder_path}${ARCHIVE_DIR}/${file.name}`;
    await supabase.storage.from(SOCIAL_BUCKET).move(file.path, dest);
    await supabase.from('files').update({ file_path: dest }).eq('file_path', file.path);
    await loadFiles(f);
  }

  // Soft delete: move to TRASH_PREFIX and record in deleted_items
  async function softDeleteFile(file: FileItem) {
    const f = folders.find((x) => x.id === selectedFolderId);
    if (!f) return;
    const stamp = Date.now();
    const trashPath = `${TRASH_PREFIX}${file.path}.${stamp}`;
    await supabase.storage.from(SOCIAL_BUCKET).move(file.path, trashPath);
    await supabase.from('files').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('file_path', file.path);
    await supabase.from('deleted_items').insert({
      kind: 'file',
      product_id: f.id,
      original_path: file.path,
      trash_path: trashPath
    });
    await loadFiles(f);
    if (previewFile && previewFile.path === file.path) {
      setPreviewOpen(false);
      setPreviewFile(null);
    }
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload || !selectedFolderId) return;
    const f = folders.find((x) => x.id === selectedFolderId);
    if (!f) return;

    setUploading(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id || null;
      let successCount = 0;
      let errorCount = 0;

      for (const file of Array.from(filesToUpload)) {
        const dest = `${f.folder_path}${file.name}`;
        const { error: uploadError } = await supabase.storage.from(SOCIAL_BUCKET).upload(dest, file, {
          upsert: true,
          contentType: file.type
        });
        if (uploadError) {
          console.error('[Social] Storage upload error for', file.name, uploadError);
          errorCount++;
          continue;
        }

        const { data: existingFile, error: queryError } = await supabase
          .from('files')
          .select('id')
          .eq('file_path', dest)
          .maybeSingle();
        if (queryError) {
          console.error('[Social] Query error for', file.name, queryError);
          errorCount++;
          continue;
        }
        if (existingFile) {
          const { error: updateError } = await supabase
            .from('files')
            .update({
              file_size: file.size,
              mime_type: file.type || 'application/octet-stream',
              updated_at: new Date().toISOString()
            })
            .eq('id', existingFile.id);
          if (updateError) {
            console.error('[Social] Update error for', file.name, updateError);
            errorCount++;
          } else {
            successCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('files')
            .insert({
              folder_id: selectedFolderId,
              name: file.name,
              file_path: dest,
              file_size: file.size,
              mime_type: file.type || 'application/octet-stream',
              created_by: userId
            })
            .select();
          if (insertError) {
            console.error('[Social] Insert error for', file.name, insertError);
            errorCount++;
          } else {
            successCount++;
          }
        }
      }

      if (successCount > 0 && errorCount === 0) addNotification('success', `${successCount} file(s) uploaded successfully`);
      else if (successCount > 0 && errorCount > 0) addNotification('info', `${successCount} uploaded, ${errorCount} failed`);
      else if (errorCount > 0 && successCount === 0) addNotification('error', 'All files failed to upload. Check console for details.');

      if (uploaderRef.current) uploaderRef.current.value = '';
      await loadFiles(f);

      // Reset video countdown to 5 minutes after any successful upload
      if (successCount > 0) {
        const ts = Date.now();
        setLastUploadAt(ts);
        localStorage.setItem(LAST_UPLOAD_KEY, String(ts));
        addNotification('info', 'Upload received — next video creation in 5:00');
      }
    } catch (e) {
      console.error('[Social] Unexpected error during upload:', e);
      addNotification('error', 'An unexpected error occurred during upload');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    handleUpload(e.dataTransfer.files);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  // ------ Folder CRUD ------
  const [showAddModal, setShowAddModal] = useState(false);

  async function addFolderSubmit(name: string) {
    const slug = slugify(name);
    const folder_path = `${slug}/`;

    const { data: inserted } = await supabase
      .from('social_folders')
      .insert([{ name, slug, folder_path }])
      .select('*')
      .single<SocialFolder>();

    if (inserted) {
      setFolders((p) => [...p, inserted]);
      await ensureFolderPlaceholders(inserted);
    }
    setShowAddModal(false);
  }

  async function importFolder() {
    const folder = window.prompt('Existing folder path in Storage (e.g., "legacy-events/")');
    if (!folder) return;
    const name = window.prompt('Display Name');
    if (!name) return;
    const slug = slugify(name);
    const folder_path = folder.endsWith('/') ? folder : `${folder}/`;
    const { data: inserted } = await supabase
      .from('social_folders')
      .insert([{ name, slug, folder_path }])
      .select('*')
      .single<SocialFolder>();
    if (inserted) {
      setFolders((p) => [...p, inserted]);
      await ensureFolderPlaceholders(inserted);
    }
  }

  // Soft delete folder: move all files to trash + record snapshot
  async function softDeleteFolder(fid: UUID) {
    const folder = folders.find((x) => x.id === fid);
    if (!folder) return;

    const root = await supabase.storage.from(SOCIAL_BUCKET).list(folder.folder_path, { limit: 1000 });
    const arch = await supabase.storage.from(SOCIAL_BUCKET).list(`${folder.folder_path}${ARCHIVE_DIR}`, { limit: 1000 });

    const allFiles: { name: string; isArchive: boolean }[] = [
      ...(root.data || [])
        .filter((e: any) => e && !e.name.endsWith('.keep'))
        .map((e: any) => ({ name: e.name, isArchive: false })),
      ...(arch.data || [])
        .filter((e: any) => e && !e.name.endsWith('.keep'))
        .map((e: any) => ({ name: e.name, isArchive: true }))
    ];
    const mappings: { from: string; to: string }[] = [];
    const stamp = Date.now();

    for (const f of allFiles) {
      const fromPath = `${folder.folder_path}${f.isArchive ? `${ARCHIVE_DIR}/` : ''}${f.name}`;
      const toPath = `${TRASH_PREFIX}${folder.folder_path}${f.isArchive ? `${ARCHIVE_DIR}/` : ''}${f.name}.${stamp}`;
      try {
        await supabase.storage.from(SOCIAL_BUCKET).move(fromPath, toPath);
        mappings.push({ from: fromPath, to: toPath });
      } catch (_) {}
    }

    await supabase.from('deleted_items').insert({
      kind: 'folder',
      product_id: folder.id,
      original_path: folder.folder_path,
      trash_path: `${TRASH_PREFIX}${folder.folder_path}`,
      product_snapshot: { ...folder, mappings }
    });

    await supabase.from('social_folders').delete().eq('id', folder.id);
    setFolders((arr) => arr.filter((p) => p.id !== folder.id));
    if (selectedFolderId === folder.id) setSelectedFolderId(null);
  }

  // Trash modal controls
  async function openTrash() {
    setTrashOpen(true);
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('deleted_items')
      .select('*')
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false });
    setRecentlyDeleted((data || []) as DeletedItem[]);
  }

  async function restoreItem(item: DeletedItem) {
    if (item.kind === 'file') {
      if (!item.original_path || !item.trash_path) return;
      try {
        await supabase.storage.from(SOCIAL_BUCKET).move(item.trash_path, item.original_path);
        await supabase.from('files').update({ is_trashed: false, trashed_at: null }).eq('file_path', item.original_path);
      } catch (_) {}
      await supabase.from('deleted_items').delete().eq('id', item.id);
    } else {
      // folder restore
      const snap = item.product_snapshot || {};
      const exists = folders.find((p) => p.slug === snap.slug);
      let restoredFolder = exists as SocialFolder | undefined;
      if (!exists) {
        const { data: inserted } = await supabase
          .from('social_folders')
          .insert([{ name: snap.name, slug: snap.slug, folder_path: snap.folder_path }])
          .select('*')
          .single<SocialFolder>();
        if (inserted) {
          setFolders((p) => [...p, inserted]);
          restoredFolder = inserted;
        }
      }
      const mappings = (snap.mappings || []) as { from: string; to: string }[];
      if (mappings.length) {
        for (const m of mappings) {
          try {
            await supabase.storage.from(SOCIAL_BUCKET).move(m.to, m.from);
          } catch (_) {}
        }
      } else if (snap.folder_path) {
        const root = await supabase.storage.from(SOCIAL_BUCKET).list(`${TRASH_PREFIX}${snap.folder_path}`, { limit: 1000 });
        for (const e of root.data || []) {
          if (!e.name.endsWith('.keep')) {
            await supabase.storage.from(SOCIAL_BUCKET).move(
              `${TRASH_PREFIX}${snap.folder_path}${e.name}`,
              `${snap.folder_path}${e.name}`
            );
          }
        }
        const arch = await supabase.storage
          .from(SOCIAL_BUCKET)
          .list(`${TRASH_PREFIX}${snap.folder_path}${ARCHIVE_DIR}`, { limit: 1000 });
        for (const e of arch.data || []) {
          if (!e.name.endsWith('.keep')) {
            await supabase.storage.from(SOCIAL_BUCKET).move(
              `${TRASH_PREFIX}${snap.folder_path}${ARCHIVE_DIR}/${e.name}`,
              `${snap.folder_path}${ARCHIVE_DIR}/${e.name}`
            );
          }
        }
      }
      await supabase.from('deleted_items').delete().eq('id', item.id);
    }

    // refresh views
    if (selectedFolderId) {
      const f = folders.find((x) => x.id === selectedFolderId);
      if (f) await loadFiles(f);
    }
    await openTrash(); // refresh trash list
  }

  // Permanently purge expired items when trash modal opens (best-effort)
  useEffect(() => {
    (async () => {
      if (!trashOpen) return;
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from('deleted_items').select('*').lt('deleted_at', cutoff);
      const expired = (data || []) as DeletedItem[];
      for (const it of expired) {
        if (it.trash_path && it.kind === 'file') {
          try {
            await supabase.storage.from(SOCIAL_BUCKET).remove([it.trash_path]);
          } catch (_) {}
        }
        await supabase.from('deleted_items').delete().eq('id', it.id);
      }
    })();
  }, [trashOpen]);

  // ------ Editing & Saving ------
  function bufferValue(fid: UUID, key: 'name', value: string) {
    setEditBuffer((prev) => {
      const base = prev[fid] ?? {
        name: folders.find((p) => p.id === fid)?.name ?? ''
      };
      const next = { ...base, [key]: value } as typeof base;
      return { ...prev, [fid]: next };
    });
    setManualSaveDirty(true);
    debounceSave(fid);
  }

  function debounceSave(fid: UUID) {
    if (debounceTimers.current[fid]) clearTimeout(debounceTimers.current[fid]);
    debounceTimers.current[fid] = setTimeout(() => autoSave(fid), 1000);
  }

  async function autoSave(fid: UUID) {
    const pending = editBuffer[fid];
    if (!pending) return;
    setAutoSaving(true);
    const slug = slugify(pending.name || folders.find((p) => p.id === fid)?.name || '');
    const folder_path = `${slug}/`;

    const { data: updated } = await supabase
      .from('social_folders')
      .update({ name: pending.name, slug, folder_path })
      .eq('id', fid)
      .select('*')
      .single<SocialFolder>();
    if (updated) {
      setFolders((arr) => arr.map((p) => (p.id === fid ? updated : p)));
    }
    setAutoSaving(false);
  }

  const [showSaved, setShowSaved] = useState(false);

  async function saveAll() {
    setAutoSaving(true);
    const ids = Object.keys(editBuffer) as UUID[];
    for (const fid of ids) {
      await autoSave(fid);
    }
    setManualSaveDirty(false);
    setAutoSaving(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
    addNotification('success', 'All changes saved');
  }

  // ------ Computed ------
  const selectedFolder = useMemo(
    () => (selectedFolderId ? folders.find((p) => p.id === selectedFolderId) || null : null),
    [folders, selectedFolderId]
  );

  // Video monitor computed text
  const nextRunInMs = lastUploadAt ? Math.max(0, lastUploadAt + AUTO_CREATE_COOLDOWN_MS - nowTick) : 0;
  const monitorText = isCreating
    ? 'Creating Video…'
    : lastUploadAt
    ? `Next Video in ${formatDuration(nextRunInMs)}`
    : 'Waiting for uploads';

  // ------ UI ------
  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-gray-500">
        Loading Social Media…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col space-y-6 overflow-hidden p-6" onDrop={onDrop} onDragOver={onDragOver}>
      {/* ===== Header Bar (monitor + refresh + run + save + trash) ===== */}
      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <Share2 className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Social Media</h2>
        </div>

        {/* Right: Monitor + buttons */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-2 rounded-lg glass-card flex items-center gap-2 ${
              heartbeatOk === null ? 'text-gray-600' : heartbeatOk ? 'text-emerald-600' : 'text-rose-600'
            }`}
            title={isCreating ? 'Video generator is running' : 'Video generator idle'}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-sm font-medium">
              {monitorText}
              {heartbeatAt ? (
                <span className="text-gray-500 ml-2">
                  • {heartbeatAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
            </span>
            <button
              className="ml-2 p-1 rounded hover:bg-white/10 transition"
              onClick={() => {
                pingHeartbeat();
                fetchVideoStatus();
                addNotification('info', 'Refreshing status...');
              }}
              title="Refresh"
            >
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>

          <motion.button
            onClick={triggerVideoCreate}
            className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Run Video Creation"
          >
            <PlayCircle className="w-5 h-5" />
            Run
          </motion.button>

          <motion.button
            onClick={saveAll}
            className={`glass-button px-4 py-2 rounded-lg font-quicksand font-medium flex items-center gap-2 transition-colors ${
              showSaved ? 'bg-green-500 text-white border-green-500' : manualSaveDirty ? 'text-gray-900' : 'text-gray-700'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Save all changes"
            disabled={!manualSaveDirty && !autoSaving}
          >
            <Save className={`w-5 h-5 ${autoSaving ? 'animate-spin' : ''}`} />
            {autoSaving ? 'Saving…' : showSaved ? 'Saved!' : 'Save'}
          </motion.button>

          {/* Recently deleted */}
          <button
            className="px-3 py-2 rounded-lg hover:bg-white/10 transition flex items-center gap-2 text-gray-700"
            onClick={openTrash}
            title="Recently deleted"
          >
            <Trash2 className="w-4 h-4" />
            Trash
          </button>

          {/* Debug toggle */}
          {isAdmin && (
            <button
              className="px-2 py-2 rounded-lg hover:bg-white/10 transition text-xs text-gray-500"
              onClick={() => setShowDebug(!showDebug)}
              title="Toggle debug panel"
            >
              {showDebug ? '🔍 Hide Debug' : '🔍'}
            </button>
          )}
        </div>
      </div>

      {/* Debug panel */}
      {showDebug && isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-gray-900 text-gray-100 rounded-xl text-xs font-mono"
        >
          <div className="font-bold mb-2">Debug Info</div>
          <div>Selected Folder ID: {selectedFolderId || 'none'}</div>
          <div>Files Count: {files.length}</div>
          <div>Uploading: {uploading ? 'Yes' : 'No'}</div>
          <div>Folders: {folders.length}</div>
          <div>Last Upload: {lastUploadAt ? new Date(lastUploadAt).toLocaleString() : '—'}</div>
          <div>Creating: {isCreating ? 'Yes' : 'No'}</div>
          {selectedFolder && (
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div>Folder: {selectedFolder.name}</div>
              <div>Folder Path: {selectedFolder.folder_path}</div>
              <div>Folder ID: {selectedFolder.id}</div>
            </div>
          )}
        </motion.div>
      )}

      {/* ===== Content ===== */}
      {!selectedFolder && (
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
          {/* Actions over grid */}
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setShowAddModal(true)}
              className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Add Folder"
            >
              <Plus className="w-4 h-4" />
              Add Folder
            </motion.button>
            <motion.button
              onClick={importFolder}
              className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Import Folder"
            >
              <UploadCloud className="w-4 h-4" />
              Import Folder
            </motion.button>
          </div>

          {/* Grid of folder cards */}
          <div className="flex flex-wrap gap-6">
            {folders.map((f) => {
              const pending = editBuffer[f.id];
              const name = pending?.name ?? f.name;

              return (
                <motion.div
                  key={f.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-4 bg-white/50 border-2 border-transparent hover:shadow-xl transition cursor-pointer min-w-fit"
                  onClick={() => setSelectedFolderId(f.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <Folder className="w-5 h-5 text-indigo-500" />
                      <div className="font-semibold text-gray-800">{name}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 rounded hover:bg-white/60"
                        title="Edit"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolderId(editingFolderId === f.id ? null : f.id);
                        }}
                      >
                        <Pencil className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        className="p-2 rounded hover:bg-white/60"
                        title="Delete Folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          softDeleteFolder(f.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </button>
                    </div>
                  </div>

                  {/* Inline quick edit (per-folder isolated) */}
                  <div
                    id={`edit-${f.id}`}
                    className={`${editingFolderId === f.id ? 'block' : 'hidden'} mt-4 space-y-3 relative z-10`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Name */}
                    <div className="space-y-1">
                      <label className="text-[11px] uppercase tracking-wide text-gray-500">Name</label>
                      <input
                        value={name}
                        onChange={(e) => bufferValue(f.id, 'name', e.target.value)}
                        className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                        placeholder="Name"
                        title="Folder display name"
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== Folder View ===== */}
      {selectedFolder && (
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
          {/* Folder header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="p-2 rounded hover:bg-white/50" title="Back" onClick={() => setSelectedFolderId(null)}>
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <div className="flex items-center gap-2">
                <Folder className="w-5 h-5 text-indigo-500" />
                <div className="font-semibold text-gray-800">
                  {folders.find((x) => x.id === selectedFolderId)?.name}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={uploaderRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                accept="application/pdf,image/*,video/*"
                disabled={uploading}
              />
              <motion.button
                onClick={() => uploaderRef.current?.click()}
                className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add files"
                disabled={uploading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <UploadCloud className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Add Files'}
              </motion.button>
              <motion.button
                onClick={() => uploaderRef.current?.click()}
                className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Import files"
                disabled={uploading}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <UploadCloud className="w-4 h-4" />
                Import Files
              </motion.button>
            </div>
          </div>

          {/* Archive subfolder tile + files */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Archive card */}
            <div
              className={`rounded-2xl p-4 bg-white/50 border border-white/40 ${
                !isAdmin ? 'opacity-90' : 'hover:shadow-lg'
              } transition`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-5 h-5 text-gray-700" />
                  <div className="font-medium text-gray-800">archive</div>
                </div>
                {!isAdmin && <Lock className="w-4 h-4 text-gray-500" title="Admin only" />}
              </div>
              <div className="text-[11px] text-gray-500 mt-2">{isAdmin ? 'Visible' : 'Locked'}</div>
            </div>

            {/* Files */}
            {files
              .filter((fl) => (fl.isArchive ? isAdmin : true))
              .map((fl, idx) => (
                <motion.div
                  key={fl.path}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-2xl p-4 bg-white/50 border border-white/40 hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <FileText className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0" />
                      <div className="font-medium text-gray-800 break-words whitespace-normal">{fl.name}</div>
                    </div>
                    {fl.isArchive ? (
                      <div className="text-[10px] px-2 py-1 rounded bg-gray-900/10 text-gray-600 flex-shrink-0">ARCHIVE</div>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <motion.button
                      className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                      onClick={() => openFile(fl)}
                      title="Open"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Eye className="w-4 h-4" /> Open
                    </motion.button>
                    <motion.button
                      className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                      onClick={() => printFile(fl)}
                      title="Print"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Printer className="w-4 h-4" /> Print
                    </motion.button>
                    {!fl.isArchive && (
                      <>
                        <motion.button
                          className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                          onClick={() => moveToArchive(fl)}
                          title="Archive"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <MoveRight className="w-4 h-4" /> Archive
                        </motion.button>
                        <motion.button
                          className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                          onClick={() => softDeleteFile(fl)}
                          title="Delete"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Trash2 className="w-4 h-4 text-rose-600" /> Delete
                        </motion.button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
          </div>

          {/* Empty state */}
          {files.filter((fl) => (fl.isArchive ? isAdmin : true)).length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="rounded-2xl p-12 bg-white/30 border border-white/30 text-center max-w-md">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <div className="text-gray-600 font-medium text-lg mb-2">No files yet</div>
                <div className="text-sm text-gray-500">Upload files using the "Add Files" button above</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Preview Modal ===== */}
      {createPortal(
        <AnimatePresence>
          {previewOpen && previewFile && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div
                className="fixed inset-0 bg-black/30 backdrop-blur-sm"
                onClick={() => {
                  setPreviewOpen(false);
                  setPreviewFile(null);
                }}
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative z-10 w-[90vw] h-[80vh] rounded-2xl overflow-hidden bg-white shadow-2xl border border-gray-200"
              >
                <div className="h-full w-full">
                  <iframe title={previewFile.name} src={previewFile.signedUrl} className="w-full h-full" />
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <button
                    className="px-3 py-2 rounded-lg bg-white/80 hover:bg-white text-sm shadow"
                    onClick={() => {
                      if (previewFile) printFile(previewFile);
                    }}
                  >
                    Print
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg bg-white/80 hover:bg-white text-sm shadow"
                    onClick={() => {
                      setPreviewOpen(false);
                      setPreviewFile(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ===== Trash Modal ===== */}
      {createPortal(
        <AnimatePresence>
          {trashOpen && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setTrashOpen(false)} />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative z-10 w-[90vw] max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-gray-800 flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Recently Deleted (24h)
                  </div>
                  <button className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm" onClick={() => setTrashOpen(false)}>
                    Close
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {recentlyDeleted.length === 0 ? (
                    <div className="text-gray-500 text-sm">Empty</div>
                  ) : (
                    recentlyDeleted.map((it) => (
                      <div key={it.id} className="rounded-xl p-4 bg-white/60 border border-gray-200">
                        <div className="text-sm text-gray-700">{it.kind === 'file' ? 'File' : 'Folder'}</div>
                        <div className="text-xs text-gray-500 truncate mt-1">
                          {it.kind === 'file' ? it.original_path || '' : it.product_snapshot?.folder_path || ''}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <motion.button
                            className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm"
                            onClick={() => restoreItem(it)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Restore
                          </motion.button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ===== Add Folder Modal ===== */}
      {createPortal(
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              className="fixed inset-0 z-[60] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative z-10 w-[90vw] max-w-md bg-white rounded-2xl shadow-2xl p-6"
              >
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Add Social Folder</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const name = String(fd.get('name') || '').trim();
                    if (name) addFolderSubmit(name);
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-xs text-gray-500">Folder Name</label>
                    <input name="name" required className="w-full rounded-lg border px-3 py-2" placeholder="e.g., Reels" />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                      Cancel
                    </button>
                    <motion.button
                      type="submit"
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Add Folder
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ===== Notification System - Top Right ===== */}
      <div className="fixed top-32 right-4 z-50 flex flex-col gap-3 max-w-md w-96 pointer-events-none">
        <AnimatePresence initial={false}>
          {notifications.map((notification) => (
            <NotificationToast key={notification.id} notification={notification} onRemove={removeNotification} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ===== Toast =====
function NotificationToast({
  notification,
  onRemove
}: {
  notification: Notification;
  onRemove: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);
  const duration = notification.duration || 5000;

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onRemove(notification.id);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [notification.id, duration, onRemove]);

  const colors: Record<Notification['type'], string> = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  const progressColors: Record<Notification['type'], string> = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
      className={`relative rounded-lg border shadow-lg overflow-hidden pointer-events-auto ${colors[notification.type]}`}
    >
      <div className="p-4 pr-10">
        <div className="font-medium">{notification.message}</div>
      </div>
      <button
        onClick={() => onRemove(notification.id)}
        className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 transition pointer-events-auto"
        title="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="h-1 bg-black/10">
        <motion.div
          className={`h-full ${progressColors[notification.type]}`}
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.05, ease: 'linear' }}
        />
      </div>
    </motion.div>
  );
}
