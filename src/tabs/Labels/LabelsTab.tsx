import { useEffect, useRef, useState } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Folder,
  UploadCloud,
  FileText,
  Eye,
  Printer,
  ChevronLeft,
  Pencil,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

type UUID = string;

interface FolderData {
  id: UUID;
  name: string;
  days_until_expiration: number;
  color: string;
  is_archived: boolean;
  created_at?: string;
}

interface FileItem {
  id: UUID;
  name: string;
  file_path: string;
  folder_id: UUID;
  file_size?: number;
  mime_type?: string;
  created_at?: string;
  signedUrl?: string;
}

const LABELS_BUCKET = 'labels';

export default function LabelsTab() {
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<UUID | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const uploaderRef = useRef<HTMLInputElement | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  useEffect(() => {
    loadFolders();
  }, []);

  useEffect(() => {
    if (selectedFolderId) {
      loadFiles(selectedFolderId);
    }
  }, [selectedFolderId]);

  async function loadFolders() {
    setLoading(true);
    const { data } = await supabase
      .from('folders')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true });
    setFolders(data || []);
    setLoading(false);
  }

  async function loadFiles(folderId: UUID) {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', folderId)
      .eq('is_trashed', false)
      .order('created_at', { ascending: false });
    setFiles(data || []);
  }

  async function addFolder() {
    const name = window.prompt('Folder Name');
    if (!name) return;
    const daysStr = window.prompt('Days Until Expiration', '30');
    const days = Math.max(1, Number(daysStr || 30));

    const { data } = await supabase
      .from('folders')
      .insert([{
        name,
        days_until_expiration: days,
        color: '#3b82f6',
        is_archived: false
      }])
      .select()
      .single();

    if (data) {
      setFolders((prev) => [...prev, data]);
    }
  }

  async function deleteFolder(folderId: UUID) {
    if (!confirm('Delete this folder and all its files?')) return;

    const filesToDelete = await supabase
      .from('files')
      .select('file_path')
      .eq('folder_id', folderId);

    if (filesToDelete.data) {
      for (const file of filesToDelete.data) {
        await supabase.storage.from(LABELS_BUCKET).remove([file.file_path]);
      }
    }

    await supabase.from('folders').delete().eq('id', folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  }

  async function handleUpload(filesToUpload: FileList | null) {
    if (!filesToUpload || !selectedFolderId) return;
    const folder = folders.find((x) => x.id === selectedFolderId);
    if (!folder) return;

    for (const f of Array.from(filesToUpload)) {
      const timestamp = Date.now();
      const storagePath = `${folder.name.toLowerCase().replace(/\s+/g, '-')}/${timestamp}_${f.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(LABELS_BUCKET)
        .upload(storagePath, f, { upsert: true, contentType: f.type });

      if (!uploadError && uploadData) {
        await supabase.from('files').insert({
          folder_id: folder.id,
          name: f.name,
          file_path: storagePath,
          file_size: f.size,
          mime_type: f.type || 'application/octet-stream',
          is_trashed: false
        });
      }
    }
    await loadFiles(selectedFolderId);
  }

  async function deleteFile(fileId: UUID) {
    if (!confirm('Delete this file?')) return;
    const file = files.find((f) => f.id === fileId);
    if (!file) return;

    await supabase.from('files').update({ is_trashed: true, trashed_at: new Date().toISOString() }).eq('id', fileId);
    await supabase.storage.from(LABELS_BUCKET).remove([file.file_path]);

    if (selectedFolderId) {
      await loadFiles(selectedFolderId);
    }

    if (previewFile?.id === fileId) {
      setPreviewOpen(false);
      setPreviewFile(null);
    }
  }

  async function openFile(file: FileItem) {
    const { data } = await supabase.storage.from(LABELS_BUCKET).createSignedUrl(file.file_path, 600);
    if (data?.signedUrl) {
      setPreviewFile({ ...file, signedUrl: data.signedUrl });
      setPreviewOpen(true);
    }
  }

  async function printFile(file: FileItem) {
    const { data } = await supabase.storage.from(LABELS_BUCKET).createSignedUrl(file.file_path, 600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-blue-600" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Labels</h2>
        </div>
      </div>

      {!selectedFolderId && (
        <>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={addFolder}
              className="glass-button px-4 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-4 h-4" />
              Add Folder
            </motion.button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {folders.map((folder) => (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4 bg-white/50 border border-white/40 hover:shadow-xl transition cursor-pointer"
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Folder className="w-5 h-5" style={{ color: folder.color }} />
                    <div className="font-semibold text-gray-800">{folder.name}</div>
                  </div>
                  <button
                    className="p-2 rounded hover:bg-white/60"
                    title="Delete Folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                  </button>
                </div>

                <div className="mt-3 rounded-lg px-3 py-2 bg-white/70">
                  <div className="text-[11px] text-gray-500">Expires in</div>
                  <div className="font-medium text-gray-800">{folder.days_until_expiration} days</div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {selectedFolderId && (
        <div className="space-y-4" onDrop={onDrop} onDragOver={onDragOver}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded hover:bg-white/50"
                title="Back"
                onClick={() => setSelectedFolderId(null)}
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <Folder className="w-5 h-5 text-blue-600" />
              <div className="font-semibold text-gray-800">
                {folders.find((f) => f.id === selectedFolderId)?.name}
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
              />
              <motion.button
                onClick={() => uploaderRef.current?.click()}
                className="glass-button px-3 py-2 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <UploadCloud className="w-4 h-4" />
                Add Files
              </motion.button>
            </div>
          </div>

          {files.length === 0 ? (
            <div className="text-center py-12 glass-card rounded-2xl">
              <UploadCloud className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-2">No files yet</p>
              <p className="text-sm text-gray-500">Click "Add Files" or drag files here</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="rounded-2xl p-4 bg-white/50 border border-white/40 hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <div className="font-medium text-gray-800 truncate" title={file.name}>
                        {file.name}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mt-2">
                    {file.file_size ? `${Math.round(file.file_size / 1024)} KB` : ''}
                  </div>

                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <button
                      className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                      onClick={() => openFile(file)}
                    >
                      <Eye className="w-4 h-4" />
                      Open
                    </button>
                    <button
                      className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2"
                      onClick={() => printFile(file)}
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button
                      className="px-3 py-2 rounded-lg hover:bg-white/10 transition text-sm flex items-center gap-2 text-rose-600"
                      onClick={() => deleteFile(file.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {previewOpen && previewFile && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
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
                <iframe
                  title={previewFile.name}
                  src={previewFile.signedUrl}
                  className="w-full h-full"
                />
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-lg bg-white/80 hover:bg-white text-sm shadow flex items-center gap-2"
                  onClick={() => {
                    if (previewFile) printFile(previewFile);
                  }}
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
                <button
                  className="px-3 py-2 rounded-lg bg-white/80 hover:bg-white text-sm shadow flex items-center gap-2"
                  onClick={() => {
                    setPreviewOpen(false);
                    setPreviewFile(null);
                  }}
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
