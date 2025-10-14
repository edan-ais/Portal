// LabelsTab.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Tag, Plus, Trash2, Folder, FolderArchive, UploadCloud, FileText,
  ShieldCheck, RefreshCcw, Eye, Printer, Save, PlayCircle,
  Pencil, Download, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

type UUID = string;

interface Product {
  id: UUID;
  name: string;
  slug: string;
  days_out: number | null;
  manual_expiry_date?: string | null;
  folder_path: string;
  created_at?: string;
}

interface FileItem {
  name: string;
  path: string;
  signedUrl?: string;
  isArchive?: boolean;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

const LABELS_BUCKET = 'labels';
const ARCHIVE_DIR = 'archive';
const TRASH_PREFIX = '_trash/';

const slugify = (input: string) =>
  input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

function formatDate(d?: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function LabelsTab() {
  const [loading, setLoading] = useState(true);
  const [heartbeatOk, setHeartbeatOk] = useState<boolean | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<UUID | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editBuffer, setEditBuffer] = useState<Record<UUID, Partial<Product>>>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (type: Notification['type'], message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setNotifications((n) => [...n, { id, type, message, duration }]);
    setTimeout(() => setNotifications((n) => n.filter((x) => x.id !== id)), duration);
  };

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    setLoading(true);
    const { data, error } = await supabase.from('products').select('*').order('created_at');
    if (!error && data) setProducts(data);
    setLoading(false);
  }

  async function refreshAll() {
    await loadProducts();
    if (selectedProductId) {
      const p = products.find((x) => x.id === selectedProductId);
      if (p) await loadFiles(p);
    }
    addNotification('info', 'Data refreshed');
  }

  async function checkSystemStatus() {
    try {
      const apiKey = import.meta.env.VITE_UPTIMEROBOT_API_KEY;
      const monitorId = import.meta.env.VITE_UPTIMEROBOT_MONITOR_ID;
      const res = await fetch('https://api.uptimerobot.com/v2/getMonitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, monitors: monitorId })
      });
      const json = await res.json();
      const ok = json?.monitors?.[0]?.status === 2;
      setHeartbeatOk(ok);
    } catch { setHeartbeatOk(false); }
  }

  useEffect(() => { checkSystemStatus(); }, []);

  async function saveAll() {
    const entries = Object.entries(editBuffer);
    for (const [id, updates] of entries) {
      await supabase.from('products').update(updates).eq('id', id);
    }
    setEditBuffer({});
    await loadProducts();
    addNotification('success', 'All changes saved');
  }

  async function restoreItem(id: string) {
    const { data } = await supabase.from('deleted_items').select('*').eq('id', id).single();
    if (!data) return;
    if (data.product_snapshot) {
      const snap = data.product_snapshot;
      await supabase.from('products').insert([snap]);
      await supabase.from('deleted_items').delete().eq('id', id);
      await loadProducts();
      addNotification('success', 'Folder restored');
    }
  }

  async function loadFiles(product: Product) {
    const { data } = await supabase.from('files').select('*').eq('folder_id', product.id).eq('is_trashed', false);
    if (data) setFiles(data.map((f: any) => ({ name: f.name, path: f.file_path })));
  }

  async function signUrl(path: string) {
    const { data } = await supabase.storage.from(LABELS_BUCKET).createSignedUrl(path, 60 * 10);
    return data?.signedUrl || null;
  }

  async function downloadFile(f: FileItem) {
    const url = await signUrl(f.path);
    if (!url) return;
    const resp = await fetch(url);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload || !selectedProductId) return;
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;
    setUploading(true);
    for (const file of Array.from(filesToUpload)) {
      const path = `${p.folder_path}${file.name}`;
      await supabase.storage.from(LABELS_BUCKET).upload(path, file, { upsert: true });
    }
    await loadFiles(p);
    setUploading(false);
    addNotification('success', 'Upload complete');
  }

  async function deleteFolder(pid: UUID) {
    await supabase.from('products').delete().eq('id', pid);
    setProducts((p) => p.filter((x) => x.id !== pid));
    addNotification('info', 'Folder deleted');
  }

  const selectedProduct = useMemo(
    () => (selectedProductId ? products.find((p) => p.id === selectedProductId) : null),
    [selectedProductId, products]
  );

  if (loading) return <div className="p-6 text-gray-600">Loading…</div>;

  return (
    <div className="relative p-6 flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-7 h-7 text-gray-600" />
          <h2 className="text-2xl font-bold">Labels</h2>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-2 rounded-lg font-medium ${
              heartbeatOk ? 'bg-green-500 text-white' : heartbeatOk === false ? 'bg-red-500 text-white' : 'bg-gray-400 text-white'
            }`}
          >
            {heartbeatOk === null ? 'Checking…' : heartbeatOk ? 'System Live' : 'System Down'}
          </div>
          <motion.button
            onClick={refreshAll}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="px-3 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-1"
          >
            <RefreshCcw className="w-4 h-4" /> Refresh
          </motion.button>
          <motion.button
            onClick={saveAll}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="px-3 py-2 bg-green-600 text-white rounded-lg flex items-center gap-1"
          >
            <Save className="w-4 h-4" /> Save
          </motion.button>
        </div>
      </div>

      {!selectedProduct && (
        <div className="grid md:grid-cols-3 gap-4">
          {products.map((p) => (
            <motion.div
              key={p.id}
              whileHover={{ scale: 1.02 }}
              className="rounded-xl p-4 bg-white/60 border cursor-pointer hover:shadow-lg"
              onClick={() => setSelectedProductId(p.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="w-5 h-5 text-indigo-500" />
                  <div className="font-semibold">{p.name}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteFolder(p.id); }}>
                  <Trash2 className="w-4 h-4 text-rose-600" />
                </button>
              </div>
              <div className="text-sm text-gray-600 mt-2">
                {p.days_out ? `Auto (${p.days_out} days)` : p.manual_expiry_date ? `Manual (${formatDate(new Date(p.manual_expiry_date))})` : '—'}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {selectedProduct && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedProductId(null)} className="px-3 py-1 bg-gray-100 rounded-lg">Back</button>
            <div className="font-semibold">{selectedProduct.name}</div>
          </div>

          <input
            ref={uploaderRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => uploaderRef.current?.click()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg"
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Add Files'}
          </button>

          <div className="grid md:grid-cols-3 gap-3">
            {files.map((f) => (
              <div key={f.path} className="rounded-lg bg-white/60 p-3 border">
                <div className="font-medium text-gray-800 truncate">{f.name}</div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => downloadFile(f)}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-sm"
                  >
                    <Download className="w-4 h-4 inline" /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 flex flex-col gap-2 w-72">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className={`p-3 rounded-lg shadow text-sm ${
                n.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : n.type === 'error'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {n.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
