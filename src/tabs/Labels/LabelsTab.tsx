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
  PlayCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

type UUID = string;

interface Product {
  id: UUID;
  name: string;
  slug: string;
  days_out: number;
  folder_path: string;   
  created_at?: string;
}

interface FileItem {
  name: string;          
  path: string;          
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

const LABELS_BUCKET = 'labels';
const ARCHIVE_DIR = 'archive';

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function computeExpiry(daysOut: number, now = new Date()) {
  const target = new Date(now);
  target.setDate(target.getDate() + daysOut);

  const y = target.getFullYear();
  const m = target.getMonth();
  const d = target.getDate();

  if (d <= 1) return new Date(y, m, 1);
  if (d <= 5) return new Date(y, m, 5);
  return new Date(y, m + 1, 1);
}

function formatDate(d?: Date) {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function LabelsTab() {
  const [loading, setLoading] = useState(true);
  const [heartbeatOk, setHeartbeatOk] = useState<boolean | null>(null);
  const [heartbeatAt, setHeartbeatAt] = useState<Date | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<UUID | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pdfPreview, setPdfPreview] = useState<FileItem | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [productForm, setProductForm] = useState<{ name: string; days_out: number }>({ name: '', days_out: 60 });

  const [editBuffer, setEditBuffer] = useState<Record<UUID, { name: string; days_out: number }>>({});
  const [autoSaving, setAutoSaving] = useState(false);
  const [manualSaveDirty, setManualSaveDirty] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [updaterStatus, setUpdaterStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [updaterSummary, setUpdaterSummary] = useState<any[]>([]);

  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const debounceTimers = useRef<Record<UUID, any>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
     
      const { data: sessionRes } = await supabase.auth.getSession();
      const user = sessionRes?.session?.user;
      let admin = false;
      if (user?.app_metadata && (user.app_metadata as any)?.role === 'admin') {
        admin = true;
      } else if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', user.id)
          .maybeSingle<Profile>();
        if (profile?.role === 'admin') admin = true;
      }
      setIsAdmin(admin);

      const { data: prod } = await supabase.from('products').select('*').order('created_at', { ascending: true });
      let list: Product[] = prod || [];
      if (!list || list.length === 0) {
        const seed = [
          { name: 'Fudge', slug: 'fudge', days_out: 60, folder_path: 'fudge/' },
          { name: 'Rice Crispy Treats', slug: 'rice-crispy-treats', days_out: 75, folder_path: 'rice-crispy-treats/' }
        ];
        const { data: inserted } = await supabase.from('products').insert(seed).select('*');
        list = inserted || [];
      }
      setProducts(list);
      if (list.length && !selectedProductId) setSelectedProductId(list[0].id);

      await pingHeartbeat();
      const iv = setInterval(pingHeartbeat, 30_000);

      setLoading(false);
      return () => clearInterval(iv);
    })();
  
  }, []);

  useEffect(() => {
    (async () => {
      if (!selectedProductId) return;
      const p = products.find((x) => x.id === selectedProductId);
      if (!p) return;
      await ensureProductPlaceholders(p);
      await loadFiles(p);
      setPdfPreview(null);
    })();
 
  }, [selectedProductId, products.length]);

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
     
      const p = products.find((x) => x.id === selectedProductId);
      if (p) await loadFiles(p);
    } catch (e) {
      console.error(e);
      setUpdaterStatus('error');
    }
  };

  async function ensureProductPlaceholders(product: Product) {
    
    const keepMain = `${product.folder_path}.keep`;
    const keepArchive = `${product.folder_path}${ARCHIVE_DIR}/.keep`;

    try {
      
      const listMain = await supabase.storage.from(LABELS_BUCKET).list(product.folder_path, { limit: 1 });
      if (!listMain.data || listMain.data.length === 0) {
        await supabase.storage
          .from(LABELS_BUCKET)
          .upload(keepMain, new Blob([''], { type: 'text/plain' }), { upsert: true });
      }
    } catch (_) {}

    try {
     
      const listArc = await supabase.storage.from(LABELS_BUCKET).list(`${product.folder_path}${ARCHIVE_DIR}`, { limit: 1 });
      if (!listArc.data || listArc.data.length === 0) {
        await supabase.storage
          .from(LABELS_BUCKET)
          .upload(keepArchive, new Blob([''], { type: 'text/plain' }), { upsert: true });
      }
    } catch (_) {}
  }

  async function loadFiles(product: Product) {
    const root = await supabase.storage.from(LABELS_BUCKET).list(product.folder_path, { limit: 1000 });
    const arch = await supabase.storage.from(LABELS_BUCKET).list(`${product.folder_path}${ARCHIVE_DIR}`, { limit: 1000 });

    const toItems = (entries: any[], isArchive = false): FileItem[] =>
      (entries || [])
        .filter((e) => e && !e.name.endsWith('.keep'))
        .map((e) => ({
          name: e.name,
          path: `${isArchive ? product.folder_path + ARCHIVE_DIR + '/' : product.folder_path}${e.name}`,
          created_at: e.created_at,
          size: e.metadata?.size,
          mimeType: e.metadata?.mimetype,
          isArchive
        }));

    setFiles([...(toItems(root.data || [], false)), ...(toItems(arch.data || [], true))]);
  }

  async function signUrl(path: string) {
    const { data, error } = await supabase.storage.from(LABELS_BUCKET).createSignedUrl(path, 60 * 10);
    if (error) return null;
    return data?.signedUrl || null;
  }

  async function openFile(file: FileItem) {
    const url = await signUrl(file.path);
    if (!url) return;
    if ((file.mimeType && file.mimeType.includes('pdf')) || file.name.toLowerCase().endsWith('.pdf')) {
      setPdfPreview({ ...file, signedUrl: url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function printFile(file: FileItem) {
    const url = await signUrl(file.path);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function deleteFile(file: FileItem) {
    await supabase.storage.from(LABELS_BUCKET).remove([file.path]);
    const p = products.find((x) => x.id === selectedProductId);
    if (p) await loadFiles(p);
    if (pdfPreview && pdfPreview.path === file.path) setPdfPreview(null);
  }

  async function moveToArchive(file: FileItem) {
    if (file.isArchive) return;
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;
    const dest = `${p.folder_path}${ARCHIVE_DIR}/${file.name}`;
    await supabase.storage.from(LABELS_BUCKET).move(file.path, dest);
    await loadFiles(p);
    if (pdfPreview && pdfPreview.path === file.path) setPdfPreview(null);
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload || !selectedProductId) return;
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;

    for (const f of Array.from(filesToUpload)) {
      const dest = `${p.folder_path}${f.name}`;
      await supabase.storage.from(LABELS_BUCKET).upload(dest, f, { upsert: true, contentType: f.type });
    }
    await loadFiles(p);
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

  async function createProduct() {
    const name = productForm.name.trim();
    if (!name) return;
    const slug = slugify(name);
    const folder_path = `${slug}/`;
    const days_out = Math.max(1, Math.floor(productForm.days_out || 1));
    const { data: inserted } = await supabase
      .from('products')
      .insert([{ name, slug, days_out, folder_path }])
      .select('*')
      .single<Product>();
    if (inserted) {
      setProducts((p) => [...p, inserted]);
      setSelectedProductId(inserted.id);
      await ensureProductPlaceholders(inserted);
      await loadFiles(inserted);
      setShowForm(false);
      setProductForm({ name: '', days_out: 60 });
    }
  }

  function bufferValue(pid: UUID, key: 'name' | 'days_out', value: string) {
    setEditBuffer((prev) => {
      const base = prev[pid] ?? {
        name: products.find((p) => p.id === pid)?.name ?? '',
        days_out: products.find((p) => p.id === pid)?.days_out ?? 60
      };
      const next = {
        ...base,
        [key]: key === 'days_out' ? Number(value) || 0 : value
      };
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

  async function manualSave(pid: UUID) {
    await autoSave(pid);
    setManualSaveDirty(false);
  }

  async function deleteProduct(pid: UUID) {
 
    await supabase.from('products').delete().eq('id', pid);
    const next = products.filter((p) => p.id !== pid);
    setProducts(next);
    if (selectedProductId === pid) setSelectedProductId(next[0]?.id ?? null);
  }

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const fudge = useMemo(() => products.find((p) => p.name.toLowerCase().includes('fudge')), [products]);
  const rct = useMemo(
    () => products.find((p) => p.name.toLowerCase().includes('rice') || p.name.toLowerCase().includes('crispy')),
    [products]
  );

  const fudgeExpiry = fudge ? computeExpiry(fudge.days_out) : null;
  const rctExpiry = rct ? computeExpiry(rct.days_out) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Labels</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* System Monitor */}
          <div
            className={`px-3 py-2 rounded-lg glass-card flex items-center gap-2 ${
              heartbeatOk ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-sm font-medium">
              {heartbeatOk === null ? 'Checking…' : heartbeatOk ? 'System Live' : 'Offline'}
              {heartbeatAt ? (
                <span className="text-gray-500 ml-2">
                  • {heartbeatAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
            </span>
            <button className="ml-2 p-1 rounded hover:bg-white/10 transition" onClick={() => pingHeartbeat()} title="Refresh">
              <RefreshCcw className="w-4 h-4" />
            </button>
          </div>

          <motion.button
            onClick={triggerUpdater}
            className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <PlayCircle className="w-5 h-5" />
            Run Label Updater
          </motion.button>
        </div>
      </div>

      {/* Updater status */}
      {updaterStatus === 'running' && <div className="p-4 bg-yellow-50 rounded-xl text-yellow-700">⏳ Updating labels…</div>}
      {updaterStatus === 'done' && (
        <div className="p-4 bg-green-50 rounded-xl text-green-700">
          <h3 className="font-bold mb-2">✅ Update Complete</h3>
          <ul className="list-disc ml-5 space-y-1 text-sm">
            {updaterSummary.map(([name, status, date]) => (
              <li key={name}>
                {name}: {status} {date ? `→ ${date}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {updaterStatus === 'error' && <div className="p-4 bg-red-50 rounded-xl text-red-700">❌ Error running label updater</div>}

      {/* Expiration Overview + Live PDF Preview */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-quicksand text-lg font-bold text-gray-800 mb-2">Upcoming Expirations</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl p-4 bg-white/40 backdrop-blur border border-white/30">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-sm text-gray-600">Fudge</span>
              </div>
              <div className="text-2xl font-semibold text-gray-800">{formatDate(fudgeExpiry)}</div>
              <div className="text-xs text-gray-500 mt-1">({fudge?.days_out ?? 60} days • rounds to 1st/5th)</div>
            </div>
            <div className="rounded-xl p-4 bg-white/40 backdrop-blur border border-white/30">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-600">Rice Crispy Treats</span>
              </div>
              <div className="text-2xl font-semibold text-gray-800">{formatDate(rctExpiry)}</div>
              <div className="text-xs text-gray-500 mt-1">({rct?.days_out ?? 75} days • rounds to 1st/5th)</div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Rule: add days, then snap forward to the 1st or 5th (whichever is the next anchor date).
          </p>
        </div>

        {/* Live PDF Preview */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="font-quicksand text-lg font-bold text-gray-800 mb-2">Label Preview</h3>
          {!pdfPreview ? (
            <div className="h-56 rounded-xl bg-white/30 border border-white/40 flex items-center justify-center text-gray-500">
              Select a PDF to preview
            </div>
          ) : (
            <div className="h-56 rounded-xl overflow-hidden border border-white/40">
              <iframe title={pdfPreview.name} src={pdfPreview.signedUrl} className="w-full h-full bg-white" />
            </div>
          )}
          {pdfPreview && (
            <div className="flex items-center gap-2 mt-3">
              <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition flex items-center gap-2" onClick={() => openFile(pdfPreview)}>
                <Eye className="w-4 h-4" />
                Open
              </button>
              <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition flex items-center gap-2" onClick={() => printFile(pdfPreview)}>
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Product form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="glass-card rounded-2xl p-6">
            <h3 className="font-quicksand text-lg font-bold text-gray-800 mb-4">Add Product</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm((s) => ({ ...s, name: e.target.value }))}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                  placeholder="e.g., Caramallow Bars"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Days Out</label>
                <input
                  type="number"
                  min={1}
                  value={productForm.days_out}
                  onChange={(e) => setProductForm((s) => ({ ...s, days_out: Number(e.target.value || 1) }))}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                  required
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <motion.button
                onClick={createProduct}
                className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-5 h-5" />
                Create Product
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg text-gray-600 hover:bg-white/5 transition-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Drive-like area */}
      <div className="grid lg:grid-cols-[280px_1fr_400px] gap-4">
        {/* Sidebar: Products & Folders */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-quicksand font-bold text-gray-800">Products</h4>
            <motion.button
              onClick={() => setShowForm(!showForm)}
              className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-4 h-4" />
              New
            </motion.button>
          </div>

          <div className="space-y-1">
            {products.map((p) => {
              const pending = editBuffer[p.id];
              const name = pending?.name ?? p.name;
              const days = pending?.days_out ?? p.days_out;

              return (
                <div key={p.id} className={`rounded-xl p-3 transition ${selectedProductId === p.id ? 'bg-white/50' : 'hover:bg-white/30'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button className="flex items-center gap-2 text-left w-full" onClick={() => setSelectedProductId(p.id)} title={p.folder_path}>
                      <Folder className="w-4 h-4 text-indigo-500" />
                      <span className="font-medium text-gray-800 truncate">{name}</span>
                    </button>
                    <button className="p-2 rounded hover:bg-white/40" onClick={() => deleteProduct(p.id)} title="Delete product (keeps storage files)">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>

                  {/* Editable settings for selected product */}
                  {selectedProductId === p.id && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                        <input
                          value={name}
                          onChange={(e) => bufferValue(p.id, 'name', e.target.value)}
                          className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Days Out</label>
                        <input
                          type="number"
                          min={1}
                          value={days}
                          onChange={(e) => bufferValue(p.id, 'days_out', e.target.value)}
                          className="w-full glass-input rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          className="px-3 py-2 rounded-lg hover:bg-white/10 transition flex items-center gap-2"
                          onClick={() => manualSave(p.id)}
                          disabled={!manualSaveDirty && !autoSaving}
                          title="Save settings"
                        >
                          <Save className="w-4 h-4" />
                          {autoSaving ? 'Saving…' : 'Save'}
                        </button>
                        <span className="text-xs text-gray-500">{p.folder_path}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Archive access hint */}
          <div className="mt-4 p-3 rounded-xl bg-white/30 border border-white/40 text-xs text-gray-600 flex items-start gap-2">
            <FolderArchive className="w-4 h-4 mt-0.5" />
            Archive folders are visible only to admins.
          </div>
        </div>

        {/* Files area */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-quicksand font-bold text-gray-800">{selectedProduct ? `${selectedProduct.name} Files` : 'Select a product'}</h4>

            <div className="flex items-center gap-2">
              <input
                ref={uploaderRef}
                type="file"
                className="hidden"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                accept="application/pdf,image/*"
              />
              <button onClick={() => uploaderRef.current?.click()} className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>

          <div
            className="rounded-2xl border border-dashed border-white/50 bg-white/30 p-6 text-gray-500 text-sm flex items-center justify-center mb-4"
            onDrop={onDrop}
            onDragOver={onDragOver}
          >
            Drag & drop files here to upload
          </div>

          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {selectedProduct ? (
              files
                .filter((f) => (f.isArchive ? isAdmin : true))
                .map((f) => (
                  <div key={f.path} className="rounded-xl p-4 bg-white/40 backdrop-blur border border-white/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-600" />
                        <div>
                          <div className="font-medium text-gray-800 truncate max-w-[180px]">{f.name}</div>
                          <div className="text-[11px] text-gray-500">{f.isArchive ? `${ARCHIVE_DIR}/` : ''}{selectedProduct.folder_path}</div>
                        </div>
                      </div>
                      {f.isArchive ? <div className="text-[10px] px-2 py-1 rounded bg-gray-900/10 text-gray-600">ARCHIVE</div> : null}
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => openFile(f)}>
                        <Eye className="w-4 h-4" />
                        Open
                      </button>
                      <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => printFile(f)}>
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                      {!f.isArchive && (
                        <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => moveToArchive(f)} title="Move to archive">
                          <MoveRight className="w-4 h-4" />
                          Archive
                        </button>
                      )}
                      {isAdmin && (
                        <button className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2" onClick={() => deleteFile(f)} title="Delete file">
                          <Trash2 className="w-4 h-4 text-rose-600" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-gray-500">Choose a product to view files.</div>
            )}
          </div>
        </div>

        {/* Right panel: Product snapshot & rules */}
        <div className="glass-card rounded-2xl p-4">
          <h4 className="font-quicksand font-bold text-gray-800 mb-3">Product Snapshot</h4>
          {!selectedProduct ? (
            <div className="text-gray-500 text-sm">Select a product to view details.</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl p-4 bg-white/40 border border-white/30">
                <div className="text-sm text-gray-600">Product</div>
                <div className="text-lg font-semibold text-gray-800">{selectedProduct.name}</div>
                <div className="text-xs text-gray-500 mt-1">Folder: {selectedProduct.folder_path}</div>
              </div>
              <div className="rounded-xl p-4 bg-white/40 border border-white/30">
                <div className="text-sm text-gray-600">Days Out</div>
                <div className="text-2xl font-semibold text-gray-800">{selectedProduct.days_out}</div>
                <div className="text-xs text-gray-500 mt-1">Next Expiration Date: {formatDate(computeExpiry(selectedProduct.days_out))}</div>
              </div>
              <div className="rounded-xl p-4 bg-white/40 border border-white/30">
                <div className="text-sm text-gray-600">Expiration Rounding</div>
                <div className="text-xs text-gray-700">
                  Add days, then snap to the next available anchor date: 1st or 5th. If after the 5th, roll to the 1st of next month.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="text-xs text-gray-500">Changes auto-save after 1s of inactivity {autoSaving ? '• Saving…' : manualSaveDirty ? '• Unsaved edits' : ''}.</div>
    </div>
  );
}
