import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Tag,
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
  Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

type UUID = string;

interface Product {
  id: UUID;
  name: string;
  slug: string;
  days_out: number;
  folder_path: string; // e.g., "fudge/"
  created_at?: string;
}

interface FileItem {
  name: string;            // filename.pdf
  path: string;            // productSlug/filename.pdf, or productSlug/archive/filename.pdf
  signedUrl?: string;      // for viewing/printing
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
  kind: 'file' | 'product';
  product_id: string | null;
  original_path: string | null;   // for files or folders
  trash_path: string | null;      // storage path inside _trash/
  product_snapshot: any | null;   // JSON of product row when kind='product'
  deleted_at: string;             // ISO
}

interface UpdaterStatus {
  last_run: string | null;        // ISO or null
  cooldown_seconds: number;       // e.g. 86400
}

const LABELS_BUCKET = 'labels';
const ARCHIVE_DIR = 'archive';
const TRASH_PREFIX = '_trash/';

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

/**
 * Expiration Rule (UPDATED): add daysOut, then snap forward to the 1st or 15th,
 * whichever is the next anchor date at/after target. If after the 15th, roll to 1st next month.
 */
function computeExpiry(daysOut: number, now = new Date()) {
  const target = new Date(now);
  target.setDate(target.getDate() + daysOut);
  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();
  if (d <= 1) return new Date(y, m, 1);
  if (d <= 15) return new Date(y, m, 15);
  return new Date(y, m + 1, 1);
}
function formatDate(d?: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function addSeconds(ts: Date, sec: number) {
  const n = new Date(ts);
  n.setSeconds(n.getSeconds() + sec);
  return n;
}

export default function LabelsTab() {
  // ------ Global state ------
  const [loading, setLoading] = useState(true);
  const [heartbeatOk, setHeartbeatOk] = useState<boolean | null>(null);
  const [heartbeatAt, setHeartbeatAt] = useState<Date | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [updaterSummary, setUpdaterSummary] = useState<any[]>([]);
  const [statusMeta, setStatusMeta] = useState<UpdaterStatus | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<UUID | null>(null); // null => grid, not folder view
  const [isAdmin, setIsAdmin] = useState(false);

  // Edits + saving
  const [editBuffer, setEditBuffer] = useState<Record<UUID, { name: string; days_out: number }>>({});
  const [autoSaving, setAutoSaving] = useState(false);
  const [manualSaveDirty, setManualSaveDirty] = useState(false);

  // Files in current folder
  const [files, setFiles] = useState<FileItem[]>([]);
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  // Trash modal
  const [trashOpen, setTrashOpen] = useState(false);
  const [recentlyDeleted, setRecentlyDeleted] = useState<DeletedItem[]>([]);

  // simple debounce map for auto-save
  const debounceTimers = useRef<Record<UUID, any>>({});

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

      // Products
      const { data: prod } = await supabase.from('products').select('*').order('created_at', { ascending: true });
      let list: Product[] = prod || [];
      if (!list || list.length === 0) {
        // seed two defaults
        const seed = [
          { name: 'Fudge', slug: 'fudge', days_out: 60, folder_path: 'fudge/' },
          { name: 'Rice Crispy Treats', slug: 'rice-crispy-treats', days_out: 75, folder_path: 'rice-crispy-treats/' }
        ];
        const { data: inserted } = await supabase.from('products').insert(seed).select('*');
        list = inserted || [];
      }
      setProducts(list);

      // Heartbeat + status
      await pingHeartbeat();
      await fetchStatusMeta();
      const iv = setInterval(pingHeartbeat, 30_000);

      setLoading(false);
      return () => clearInterval(iv);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When entering a folder, load files
  useEffect(() => {
    (async () => {
      if (!selectedProductId) {
        console.log('[Labels] No product selected, clearing files');
        setFiles([]);
        return;
      }
      const p = products.find((x) => x.id === selectedProductId);
      if (!p) {
        console.log('[Labels] Product not found for id:', selectedProductId);
        return;
      }
      console.log('[Labels] Effect: Loading files for selected product:', p.name);
      await ensureProductPlaceholders(p);
      await loadFiles(p);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, products.length]);

  // ------ Monitor & Updater ------
  const pingHeartbeat = async () => {
    try {
      const url = `${import.meta.env.VITE_LABEL_UPDATER_URL}/`;
      const res = await fetch(url, { method: 'GET' });
      setHeartbeatOk(res.ok);
      setHeartbeatAt(new Date());
    } catch {
      setHeartbeatOk(false);
    }
  };
  const fetchStatusMeta = async () => {
    try {
      const url = `${import.meta.env.VITE_LABEL_UPDATER_URL}/api/status`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) return;
      const data: UpdaterStatus = await res.json();
      setStatusMeta(data);
    } catch { /* noop */ }
  };
  const triggerUpdater = async () => {
    try {
      setUpdaterStatus('running');
      const url = `${import.meta.env.VITE_LABEL_UPDATER_URL}/api/run`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${import.meta.env.VITE_LABEL_UPDATER_SECRET}` }
      });
      if (!res.ok) throw new Error('failed to trigger updater');
      const data = await res.json();
      setUpdaterSummary(data.summary || []);
      setUpdaterStatus('done');
      await fetchStatusMeta();
      // refresh current folder if any
      if (selectedProductId) {
        const p = products.find((x) => x.id === selectedProductId);
        if (p) await loadFiles(p);
      }
    } catch (e) {
      console.error(e);
      setUpdaterStatus('error');
    }
  };

  // ------ Storage helpers ------
  async function ensureProductPlaceholders(product: Product) {
    const keepMain = `${product.folder_path}.keep`;
    const keepArchive = `${product.folder_path}${ARCHIVE_DIR}/.keep`;

    try {
      const listMain = await supabase.storage.from(LABELS_BUCKET).list(product.folder_path, { limit: 1 });
      if (!listMain.data || listMain.data.length === 0) {
        await supabase.storage.from(LABELS_BUCKET).upload(keepMain, new Blob([''], { type: 'text/plain' }), { upsert: true });
      }
    } catch (_) {}

    try {
      const listArc = await supabase.storage.from(LABELS_BUCKET).list(`${product.folder_path}${ARCHIVE_DIR}`, { limit: 1 });
      if (!listArc.data || listArc.data.length === 0) {
        await supabase.storage.from(LABELS_BUCKET).upload(keepArchive, new Blob([''], { type: 'text/plain' }), { upsert: true });
      }
    } catch (_) {}
  }
  async function loadFiles(product: Product) {
    console.log('[Labels] Loading files for product:', product.id, product.name, product.folder_path);

    const { data: dbFiles, error } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', product.id)
      .eq('is_trashed', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Labels] Error loading files:', error);
      return;
    }

    console.log('[Labels] Loaded files from DB:', dbFiles);

    const fileItems: FileItem[] = (dbFiles || []).map((f) => ({
      name: f.name,
      path: f.file_path,
      created_at: f.created_at,
      size: f.file_size,
      mimeType: f.mime_type,
      isArchive: f.file_path.includes(`/${ARCHIVE_DIR}/`)
    }));

    console.log('[Labels] Setting files state:', fileItems);
    setFiles(fileItems);
  }
  async function signUrl(path: string) {
    const { data, error } = await supabase.storage.from(LABELS_BUCKET).createSignedUrl(path, 60 * 10);
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
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;
    const dest = `${p.folder_path}${ARCHIVE_DIR}/${file.name}`;
    await supabase.storage.from(LABELS_BUCKET).move(file.path, dest);

    await supabase
      .from('files')
      .update({ file_path: dest })
      .eq('file_path', file.path);

    await loadFiles(p);
  }

  // Soft delete: move to TRASH_PREFIX and record in deleted_items
  async function softDeleteFile(file: FileItem) {
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;
    const stamp = Date.now();
    const trashPath = `${TRASH_PREFIX}${file.path}.${stamp}`;
    await supabase.storage.from(LABELS_BUCKET).move(file.path, trashPath);

    await supabase
      .from('files')
      .update({ is_trashed: true, trashed_at: new Date().toISOString() })
      .eq('file_path', file.path);

    await supabase.from('deleted_items').insert({
      kind: 'file',
      product_id: p.id,
      original_path: file.path,
      trash_path: trashPath
    });
    await loadFiles(p);
    if (previewFile && previewFile.path === file.path) {
      setPreviewOpen(false);
      setPreviewFile(null);
    }
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload || !selectedProductId) {
      console.log('[Labels] Upload aborted: no files or no product selected');
      return;
    }

    const p = products.find((x) => x.id === selectedProductId);
    if (!p) {
      console.error('[Labels] Upload aborted: product not found');
      return;
    }

    console.log('[Labels] Starting upload for product:', p.id, p.name, p.folder_path);
    console.log('[Labels] Files to upload:', Array.from(filesToUpload).map(f => f.name));

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes?.session?.user?.id || null;

      let successCount = 0;
      let errorCount = 0;

      for (const f of Array.from(filesToUpload)) {
        const dest = `${p.folder_path}${f.name}`;
        console.log(`[Labels] Uploading file: ${f.name} to ${dest}`);

        const { error: uploadError } = await supabase.storage
          .from(LABELS_BUCKET)
          .upload(dest, f, { upsert: true, contentType: f.type });

        if (uploadError) {
          console.error(`[Labels] Storage upload error for ${f.name}:`, uploadError);
          errorCount++;
          continue;
        }

        console.log(`[Labels] Storage upload success for ${f.name}`);

        const { data: existingFile, error: queryError } = await supabase
          .from('files')
          .select('id')
          .eq('file_path', dest)
          .maybeSingle();

        if (queryError) {
          console.error(`[Labels] Query error for ${f.name}:`, queryError);
          errorCount++;
          continue;
        }

        if (existingFile) {
          console.log(`[Labels] Updating existing file record for ${f.name}:`, existingFile.id);
          const { error: updateError } = await supabase
            .from('files')
            .update({
              file_size: f.size,
              mime_type: f.type || 'application/octet-stream',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingFile.id);

          if (updateError) {
            console.error(`[Labels] Update error for ${f.name}:`, updateError);
            errorCount++;
          } else {
            console.log(`[Labels] Updated file record for ${f.name}`);
            successCount++;
          }
        } else {
          console.log(`[Labels] Creating new file record for ${f.name}`);
          const { data: insertedFile, error: insertError } = await supabase
            .from('files')
            .insert({
              folder_id: selectedProductId,
              name: f.name,
              file_path: dest,
              file_size: f.size,
              mime_type: f.type || 'application/octet-stream',
              created_by: userId,
            })
            .select();

          if (insertError) {
            console.error(`[Labels] Insert error for ${f.name}:`, insertError);
            errorCount++;
          } else {
            console.log(`[Labels] Created file record for ${f.name}:`, insertedFile);
            successCount++;
          }
        }
      }

      console.log(`[Labels] Upload complete: ${successCount} success, ${errorCount} errors`);

      if (errorCount > 0) {
        setUploadError(`${errorCount} file(s) failed to upload`);
      } else {
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 3000);
      }

      if (uploaderRef.current) {
        uploaderRef.current.value = '';
      }

      await loadFiles(p);
    } catch (e) {
      console.error('[Labels] Unexpected error during upload:', e);
      setUploadError('An unexpected error occurred');
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

  // ------ Product CRUD / edits ------
  async function addFolder() {
    const name = window.prompt('Folder (Product) Name');
    if (!name) return;
    const daysStr = window.prompt('Days Out', '60');
    const days_out = Math.max(1, Number(daysStr || 60));
    const slug = slugify(name);
    const folder_path = `${slug}/`;
    const { data: inserted } = await supabase
      .from('products')
      .insert([{ name, slug, days_out, folder_path }])
      .select('*')
      .single<Product>();
    if (inserted) {
      setProducts((p) => [...p, inserted]);
      await ensureProductPlaceholders(inserted);
    }
  }
  async function importFolder() {
    const folder = window.prompt('Existing folder path in Storage (e.g., "legacy-fudge/")');
    if (!folder) return;
    const name = window.prompt('Display Name');
    if (!name) return;
    const daysStr = window.prompt('Days Out', '60');
    const days_out = Math.max(1, Number(daysStr || 60));
    const slug = slugify(name);
    const folder_path = folder.endsWith('/') ? folder : `${folder}/`;
    const { data: inserted } = await supabase
      .from('products')
      .insert([{ name, slug, days_out, folder_path }])
      .select('*')
      .single<Product>();
    if (inserted) {
      setProducts((p) => [...p, inserted]);
      await ensureProductPlaceholders(inserted);
    }
  }

  // Soft delete product: move all files under folder (and archive) into trash + record one product snapshot
  async function softDeleteProduct(pid: UUID) {
    const product = products.find((x) => x.id === pid);
    if (!product) return;
    // List files
    const root = await supabase.storage.from(LABELS_BUCKET).list(product.folder_path, { limit: 1000 });
    const arch = await supabase.storage.from(LABELS_BUCKET).list(`${product.folder_path}${ARCHIVE_DIR}`, { limit: 1000 });

    const allFiles: { name: string; isArchive: boolean }[] = [
      ...(root.data || []).filter((e: any) => e && !e.name.endsWith('.keep')).map((e: any) => ({ name: e.name, isArchive: false })),
      ...(arch.data || []).filter((e: any) => e && !e.name.endsWith('.keep')).map((e: any) => ({ name: e.name, isArchive: true }))
    ];

    const mappings: { from: string; to: string }[] = [];
    const stamp = Date.now();
    for (const f of allFiles) {
      const fromPath = `${product.folder_path}${f.isArchive ? `${ARCHIVE_DIR}/` : ''}${f.name}`;
      const toPath = `${TRASH_PREFIX}${product.folder_path}${f.isArchive ? `${ARCHIVE_DIR}/` : ''}${f.name}.${stamp}`;
      try {
        await supabase.storage.from(LABELS_BUCKET).move(fromPath, toPath);
        mappings.push({ from: fromPath, to: toPath });
      } catch (_) {}
    }

    // record product snapshot with mappings
    await supabase.from('deleted_items').insert({
      kind: 'product',
      product_id: product.id,
      original_path: product.folder_path,
      trash_path: `${TRASH_PREFIX}${product.folder_path}`, // base prefix
      product_snapshot: { ...product, mappings }
    });

    // delete product row
    await supabase.from('products').delete().eq('id', product.id);
    setProducts((arr) => arr.filter((p) => p.id !== product.id));
    if (selectedProductId === product.id) setSelectedProductId(null);
  }

  // Restore from trash
  async function openTrash() {
    setTrashOpen(true);
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('deleted_items')
      .select('*')
      .gte('deleted_at', cutoff)
      .order('deleted_at', { ascending: false });
    setRecentlyDeleted(data || []);
  }
  async function restoreItem(item: DeletedItem) {
    if (item.kind === 'file') {
      if (!item.original_path || !item.trash_path) return;
      try {
        await supabase.storage.from(LABELS_BUCKET).move(item.trash_path, item.original_path);

        await supabase
          .from('files')
          .update({ is_trashed: false, trashed_at: null })
          .eq('file_path', item.original_path);
      } catch (_) {}
      await supabase.from('deleted_items').delete().eq('id', item.id);
    } else {
      // product restore: reinsert product row, move all files back
      const snap = item.product_snapshot || {};
      const exists = products.find((p) => p.slug === snap.slug);
      let restoredProduct = exists;
      if (!exists) {
        const { data: inserted } = await supabase
          .from('products')
          .insert([{ name: snap.name, slug: snap.slug, days_out: snap.days_out, folder_path: snap.folder_path }])
          .select('*')
          .single<Product>();
        if (inserted) {
          setProducts((p) => [...p, inserted]);
          restoredProduct = inserted;
        }
      }
      // Move back each file from mappings (if present). If not present, attempt to move by listing trash prefix.
      const mappings = (snap.mappings || []) as { from: string; to: string }[];
      if (mappings.length) {
        for (const m of mappings) {
          try {
            await supabase.storage.from(LABELS_BUCKET).move(m.to, m.from);
          } catch (_) {}
        }
      } else if (snap.folder_path) {
        // fallback: best-effort move any files under TRASH_PREFIX+folder_path back
        const root = await supabase.storage.from(LABELS_BUCKET).list(`${TRASH_PREFIX}${snap.folder_path}`, { limit: 1000 });
        for (const e of root.data || []) {
          if (!e.name.endsWith('.keep')) {
            await supabase.storage
              .from(LABELS_BUCKET)
              .move(`${TRASH_PREFIX}${snap.folder_path}${e.name}`, `${snap.folder_path}${e.name}`);
          }
        }
        const arch = await supabase.storage.from(LABELS_BUCKET).list(`${TRASH_PREFIX}${snap.folder_path}${ARCHIVE_DIR}`, { limit: 1000 });
        for (const e of arch.data || []) {
          if (!e.name.endsWith('.keep')) {
            await supabase.storage
              .from(LABELS_BUCKET)
              .move(`${TRASH_PREFIX}${snap.folder_path}${ARCHIVE_DIR}/${e.name}`, `${snap.folder_path}${ARCHIVE_DIR}/${e.name}`);
          }
        }
      }
      await supabase.from('deleted_items').delete().eq('id', item.id);
    }

    // refresh views
    if (selectedProductId) {
      const p = products.find((x) => x.id === selectedProductId);
      if (p) await loadFiles(p);
    }
    await openTrash(); // refresh trash list
  }

  // Permanently purge expired items when trash modal opens (best-effort)
  useEffect(() => {
    (async () => {
      if (!trashOpen) return;
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase.from('deleted_items').select('*').lt('deleted_at', cutoff);
      const expired = data || [];
      for (const it of expired) {
        if (it.trash_path && it.kind === 'file') {
          try {
            await supabase.storage.from(LABELS_BUCKET).remove([it.trash_path]);
          } catch (_) {}
        }
        await supabase.from('deleted_items').delete().eq('id', it.id);
      }
    })();
  }, [trashOpen]);

  // ------ Editing & Saving ------
  function bufferValue(pid: UUID, key: 'name' | 'days_out', value: string) {
    setEditBuffer((prev) => {
      const base = prev[pid] ?? {
        name: products.find((p) => p.id === pid)?.name ?? '',
        days_out: products.find((p) => p.id === pid)?.days_out ?? 60
      };
      const next = { ...base, [key]: key === 'days_out' ? Number(value) || 0 : value };
      return { ...prev, [pid]: next };
    });
    setManualSaveDirty(true);
    debounceSave(pid);
  }
  function debounceSave(pid: UUID) {
    if (debounceTimers.current[pid]) clearTimeout(debounceTimers.current[pid]);
    debounceTimers.current[pid] = setTimeout(() => autoSave(pid), 1000);
  }
  async function autoSave(pid: UUID) {
    const pending = editBuffer[pid];
    if (!pending) return;
    setAutoSaving(true);
    const slug = slugify(pending.name || products.find((p) => p.id === pid)?.name || '');
    const folder_path = `${slug}/`;
    const { data: updated } = await supabase
      .from('products')
      .update({ name: pending.name, days_out: Math.max(1, Math.floor(pending.days_out || 1)), slug, folder_path })
      .eq('id', pid)
      .select('*')
      .single<Product>();
    if (updated) {
      setProducts((arr) => arr.map((p) => (p.id === pid ? updated : p)));
    }
    setAutoSaving(false);
  }
  async function saveAll() {
    // Save every pending edit
    const ids = Object.keys(editBuffer) as UUID[];
    for (const pid of ids) {
      await autoSave(pid);
    }
    setManualSaveDirty(false);
  }

  // ------ Computed ------
  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) || null : null),
    [products, selectedProductId]
  );

  const nextUpdateAt = useMemo(() => {
    if (!statusMeta?.cooldown_seconds) return null;
    if (!statusMeta.last_run) return null;
    const last = new Date(statusMeta.last_run);
    return addSeconds(last, statusMeta.cooldown_seconds);
  }, [statusMeta]);

  // ------ UI ------
  return (
    <div className="space-y-6">
      {/* ===== Header Bar (monitor + refresh + run + save + autosave tracker + trash) ===== */}
      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Labels</h2>
        </div>

        {/* Right: Monitor + buttons */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-2 rounded-lg glass-card flex items-center gap-2 ${
              heartbeatOk ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-sm font-medium">
              {heartbeatOk === null ? 'Checking…' : heartbeatOk ? 'System Live' : 'Offline'}
              {heartbeatAt ? (
                <span className="text-gray-500 ml-2">• {heartbeatAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              ) : null}
            </span>
            <button className="ml-2 p-1 rounded hover:bg-white/10 transition" onClick={() => { pingHeartbeat(); fetchStatusMeta(); }} title="Refresh">
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>

          <motion.button
            onClick={triggerUpdater}
            className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Run Label Updater"
          >
            <PlayCircle className="w-5 h-5" />
            Run
          </motion.button>

          <motion.button
            onClick={saveAll}
            className={`glass-button px-4 py-2 rounded-lg font-quicksand font-medium flex items-center gap-2 ${manualSaveDirty ? 'text-gray-900' : 'text-gray-700'}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Save all changes"
            disabled={!manualSaveDirty && !autoSaving}
          >
            <Save className="w-5 h-5" />
            Save
          </motion.button>

          {/* Autosave tracker */}
          <div className="px-3 py-2 rounded-lg bg-white/40 border border-white/40 text-xs text-gray-700">
            {autoSaving ? 'Auto-saving…' : manualSaveDirty ? 'Unsaved edits' : 'All changes saved'}
          </div>

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
          <div>Selected Product ID: {selectedProductId || 'none'}</div>
          <div>Files Count: {files.length}</div>
          <div>Uploading: {uploading ? 'Yes' : 'No'}</div>
          <div>Products: {products.length}</div>
          {selectedProduct && (
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div>Product: {selectedProduct.name}</div>
              <div>Folder Path: {selectedProduct.folder_path}</div>
              <div>Product ID: {selectedProduct.id}</div>
            </div>
          )}
          {files.length > 0 && (
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div className="font-bold">Files:</div>
              {files.slice(0, 5).map((f, i) => (
                <div key={i} className="ml-2">
                  • {f.name} ({f.path})
                </div>
              ))}
              {files.length > 5 && <div className="ml-2">... and {files.length - 5} more</div>}
            </div>
          )}
        </motion.div>
      )}

      {/* Updater feedback (minimal) */}
      <AnimatePresence>
        {updaterStatus === 'running' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-3 bg-yellow-50 rounded-xl text-yellow-700">
            Updating…
          </motion.div>
        )}
        {updaterStatus === 'done' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-3 bg-green-50 rounded-xl text-green-700">
            Done
          </motion.div>
        )}
        {updaterStatus === 'error' && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="p-3 bg-red-50 rounded-xl text-red-700">
            Error
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Content ===== */}
      {!selectedProduct && (
        <>
          {/* Actions over grid */}
          <div className="flex items-center gap-2">
            <button
              onClick={addFolder}
              className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              title="Add Folder"
            >
              <Plus className="w-4 h-4" />
              Add Folder
            </button>
            <button
              onClick={importFolder}
              className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              title="Import Folder"
            >
              <UploadCloud className="w-4 h-4" />
              Import Folder
            </button>
          </div>

          {/* Grid of product folder cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map((p) => {
              const pending = editBuffer[p.id];
              const name = pending?.name ?? p.name;
              const days = pending?.days_out ?? p.days_out;
              const expiry = computeExpiry(days);
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-4 bg-white/50 border border-white/40 hover:shadow-xl transition cursor-pointer"
                  onClick={() => setSelectedProductId(p.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Folder className="w-5 h-5 text-indigo-500" />
                      <div className="font-semibold text-gray-800">{name}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="p-2 rounded hover:bg-white/60"
                        title="Edit"
                        onClick={(e) => { e.stopPropagation(); /* toggle quick edit: no modal, inline under card */ const v = (document.getElementById(`edit-${p.id}`) as HTMLDivElement); if (v) v.classList.toggle('hidden'); }}
                      >
                        <Pencil className="w-4 h-4 text-gray-600" />
                      </button>
                      <button
                        className="p-2 rounded hover:bg-white/60"
                        title="Delete Folder"
                        onClick={(e) => { e.stopPropagation(); softDeleteProduct(p.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg px-3 py-2 bg-white/70">
                      <div className="text-[11px] text-gray-500">Expires</div>
                      <div className="font-medium text-gray-800">{formatDate(expiry)}</div>
                    </div>
                    <div className="rounded-lg px-3 py-2 bg-white/70">
                      <div className="text-[11px] text-gray-500">Next Update</div>
                      <div className="font-medium text-gray-800">{formatDate(nextUpdateAt)}</div>
                    </div>
                  </div>

                  {/* Inline quick edit (hidden by default) */}
                  <div id={`edit-${p.id}`} className="hidden mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={name}
                      onChange={(e) => bufferValue(p.id, 'name', e.target.value)}
                      className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                      placeholder="Name"
                    />
                    <input
                      type="number"
                      min={1}
                      value={days}
                      onChange={(e) => bufferValue(p.id, 'days_out', e.target.value)}
                      className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                      placeholder="Days Out"
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* ===== Folder View ===== */}
      {selectedProduct && (
        <div className="space-y-4">
          {/* Folder header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded hover:bg-white/50"
                title="Back"
                onClick={() => setSelectedProductId(null)}
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <div className="flex items-center gap-2">
                <Folder className="w-5 h-5 text-indigo-500" />
                <div className="font-semibold text-gray-800">
                  {products.find((p) => p.id === selectedProductId)?.name}
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
                accept="application/pdf,image/*"
                disabled={uploading}
              />
              <button
                onClick={() => uploaderRef.current?.click()}
                className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add files"
                disabled={uploading}
              >
                <UploadCloud className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Add Files'}
              </button>
              <button
                onClick={() => uploaderRef.current?.click()}
                className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Import files"
                disabled={uploading}
              >
                <UploadCloud className="w-4 h-4" />
                Import Files
              </button>

              {uploadSuccess && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium"
                >
                  Upload successful!
                </motion.div>
              )}

              {uploadError && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center gap-2"
                >
                  {uploadError}
                  <button onClick={() => setUploadError(null)} className="hover:text-red-900">×</button>
                </motion.div>
              )}
            </div>
          </div>

          {/* Archive subfolder tile */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Archive card */}
            <div
              className={`rounded-2xl p-4 bg-white/50 border border-white/40 ${!isAdmin ? 'opacity-90' : 'hover:shadow-lg'} transition`}
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
              .filter((f) => (f.isArchive ? isAdmin : true))
              .map((f, idx) => (
                <motion.div
                  key={f.path}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="rounded-2xl p-4 bg-white/50 border border-white/40 hover:shadow-lg transition">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-600" />
                      <div className="font-medium text-gray-800 truncate max-w-[200px]">{f.name}</div>
                    </div>
                    {f.isArchive ? (
                      <div className="text-[10px] px-2 py-1 rounded bg-gray-900/10 text-gray-600">ARCHIVE</div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => openFile(f)} title="Open">
                      <Eye className="w-4 h-4" />
                      Open
                    </button>
                    <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => printFile(f)} title="Print">
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    {!f.isArchive && (
                      <>
                        <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => moveToArchive(f)} title="Archive">
                          <MoveRight className="w-4 h-4" />
                          Archive
                        </button>
                        <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => softDeleteFile(f)} title="Delete">
                          <Trash2 className="w-4 h-4 text-rose-600" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}

            {/* Empty state */}
            {files.filter((f) => (f.isArchive ? isAdmin : true)).length === 0 && (
              <div className="col-span-2 rounded-2xl p-8 bg-white/30 border border-white/30 text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <div className="text-gray-600 font-medium mb-1">No files yet</div>
                <div className="text-sm text-gray-500">Upload files to get started</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== Preview Modal (blur background) ===== */}
      <AnimatePresence>
        {previewOpen && previewFile && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setPreviewOpen(false); setPreviewFile(null); }} />

            {/* Modal */}
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
                  onClick={() => { if (previewFile) printFile(previewFile); }}
                >
                  Print
                </button>
                <button
                  className="px-3 py-2 rounded-lg bg-white/80 hover:bg-white text-sm shadow"
                  onClick={() => { setPreviewOpen(false); setPreviewFile(null); }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trash Modal */}
      <AnimatePresence>
        {trashOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setTrashOpen(false)} />
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
                      <div className="text-sm text-gray-700">
                        {it.kind === 'file' ? 'File' : 'Folder'}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-1">
                        {it.kind === 'file' ? (it.original_path || '') : (it.product_snapshot?.folder_path || '')}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button className="px-3 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm" onClick={() => restoreItem(it)}>
                          Restore
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
