import { useState, useEffect } from 'react';
import { Tag, Plus, Upload, FolderPlus, Trash2, Download, Lock, FolderInput } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useProfile } from '../../contexts/ProfileContext';

interface Folder {
  id: string;
  name: string;
  days_until_expiration: number;
  is_archived: boolean;
  color: string;
  created_at: string;
}

interface File {
  id: string;
  folder_id: string;
  name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  is_trashed: boolean;
  trashed_at: string | null;
  created_at: string;
}

export default function LabelsTab() {
  const { currentProfile, isAdmin } = useProfile();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const [folderForm, setFolderForm] = useState({
    name: '',
    days_until_expiration: 30,
    color: '#3b82f6',
  });

  useEffect(() => {
    loadFolders();
  }, [isAdmin]);

  useEffect(() => {
    if (selectedFolder) {
      loadFiles(selectedFolder);
    }
  }, [selectedFolder]);

  const loadFolders = async () => {
    let query = supabase.from('folders').select('*').order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('is_archived', false);
    }

    const { data } = await query;
    if (data) setFolders(data);
    setLoading(false);
  };

  const loadFiles = async (folderId: string) => {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('folder_id', folderId)
      .eq('is_trashed', false)
      .order('created_at', { ascending: false });
    if (data) setFiles(data);
  };

  const loadTrashedFiles = async () => {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('is_trashed', true)
      .order('trashed_at', { ascending: false });
    if (data) setFiles(data);
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('folders').insert([{
      ...folderForm,
      created_by: '00000000-0000-0000-0000-000000000000',
    }]);
    setShowCreateFolder(false);
    setFolderForm({ name: '', days_until_expiration: 30, color: '#3b82f6' });
    loadFolders();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !selectedFolder) return;

    setUploadingFiles(true);
    const fileList = Array.from(e.target.files);

    for (const file of fileList) {
      const filePath = `${selectedFolder}/${Date.now()}_${file.name}`;

      const { data: uploadData, error } = await supabase.storage
        .from('files')
        .upload(filePath, file);

      if (!error && uploadData) {
        await supabase.from('files').insert([{
          folder_id: selectedFolder,
          name: file.name,
          file_path: uploadData.path,
          file_size: file.size,
          mime_type: file.type,
          created_by: '00000000-0000-0000-0000-000000000000',
        }]);
      }
    }

    setUploadingFiles(false);
    loadFiles(selectedFolder);
  };

  const moveToTrash = async (fileId: string) => {
    await supabase.from('files').update({
      is_trashed: true,
      trashed_at: new Date().toISOString(),
    }).eq('id', fileId);

    if (selectedFolder) {
      loadFiles(selectedFolder);
    }
  };

  const restoreFromTrash = async (fileId: string) => {
    await supabase.from('files').update({
      is_trashed: false,
      trashed_at: null,
    }).eq('id', fileId);
    loadTrashedFiles();
  };

  const permanentlyDelete = async (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      await supabase.storage.from('files').remove([file.file_path]);
      await supabase.from('files').delete().eq('id', fileId);
    }
    loadTrashedFiles();
  };

  const downloadFile = async (file: File) => {
    const { data } = await supabase.storage.from('files').download(file.file_path);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    }
  };

  const colorOptions = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-blue-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Labels</h2>
          {currentProfile && (
            <span className="text-sm text-gray-500">
              ({currentProfile.name} - {isAdmin ? 'Admin' : 'Staff'})
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <motion.button
            onClick={() => {
              setShowTrash(true);
              setSelectedFolder(null);
              loadTrashedFiles();
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Trash2 className="w-5 h-5" />
            Trash
          </motion.button>
          <motion.button
            onClick={() => setShowCreateFolder(true)}
            className="glass-button px-6 py-3 rounded-lg text-white font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-5 h-5" />
            Add Folder
          </motion.button>
          <motion.button
            className="glass-button px-6 py-3 rounded-lg text-white font-quicksand font-medium flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Google Drive integration coming soon"
          >
            <FolderInput className="w-5 h-5" />
            Import Folder
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showCreateFolder && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 notification-overlay z-50"
              onClick={() => setShowCreateFolder(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-blue-100 z-50 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-gray-800 font-quicksand mb-6">Create New Folder</h3>
              <form onSubmit={createFolder} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Product Name</label>
                  <input
                    type="text"
                    value={folderForm.name}
                    onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none"
                    placeholder="e.g., Fudge, Rice Crispy Treats"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Days Until Expiration</label>
                  <input
                    type="number"
                    value={folderForm.days_until_expiration}
                    onChange={(e) => setFolderForm({ ...folderForm, days_until_expiration: parseInt(e.target.value) })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                  <div className="grid grid-cols-10 gap-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFolderForm({ ...folderForm, color })}
                        className={`w-8 h-8 rounded-lg transition-all ${
                          folderForm.color === color ? 'ring-2 ring-blue-500 scale-110' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <motion.button
                    type="submit"
                    className="flex-1 glass-button px-6 py-3 rounded-lg text-white font-quicksand font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Create Folder
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setShowCreateFolder(false)}
                    className="px-6 py-3 rounded-lg text-gray-600 hover:bg-gray-100 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-lg font-bold text-gray-800 font-quicksand mb-4">Folders</h3>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : folders.length === 0 ? (
            <p className="text-gray-400 text-sm">No folders yet</p>
          ) : (
            folders.map((folder) => (
              <motion.button
                key={folder.id}
                onClick={() => {
                  if (folder.is_archived && !isAdmin) return;
                  setSelectedFolder(folder.id);
                  setShowTrash(false);
                }}
                disabled={folder.is_archived && !isAdmin}
                className={`w-full text-left p-4 rounded-xl transition-all ${
                  folder.is_archived && !isAdmin
                    ? 'opacity-50 cursor-not-allowed'
                    : selectedFolder === folder.id
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : 'glass-card hover:shadow-lg'
                }`}
                whileHover={{ scale: folder.is_archived && !isAdmin ? 1 : 1.02 }}
                whileTap={{ scale: folder.is_archived && !isAdmin ? 1 : 0.98 }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${folder.color}20` }}
                  >
                    {folder.is_archived ? (
                      <Lock className="w-5 h-5" style={{ color: folder.color }} />
                    ) : (
                      <FolderPlus className="w-5 h-5" style={{ color: folder.color }} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 font-quicksand">{folder.name}</h4>
                    <p className="text-xs text-gray-500">{folder.days_until_expiration} days</p>
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </div>

        <div className="lg:col-span-3">
          {showTrash ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800 font-quicksand">Trash</h3>
                <p className="text-sm text-gray-500">Files are permanently deleted after 24 hours</p>
              </div>
              {files.length === 0 ? (
                <p className="text-gray-400 text-center py-12">Trash is empty</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="glass-card rounded-xl p-4 flex items-center justify-between"
                    >
                      <div>
                        <h4 className="font-semibold text-gray-800">{file.name}</h4>
                        <p className="text-xs text-gray-500">
                          Deleted {new Date(file.trashed_at!).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => restoreFromTrash(file.id)}
                          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => permanentlyDelete(file.id)}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
                        >
                          Delete Forever
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          ) : selectedFolder ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800 font-quicksand">Files</h3>
                <div className="flex gap-3">
                  <label className="glass-button px-6 py-3 rounded-lg text-white font-quicksand font-medium flex items-center gap-2 cursor-pointer">
                    <Upload className="w-5 h-5" />
                    {uploadingFiles ? 'Uploading...' : 'Add Files'}
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={uploadingFiles}
                    />
                  </label>
                </div>
              </div>
              {files.length === 0 ? (
                <p className="text-gray-400 text-center py-12">No files in this folder</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass-card rounded-xl p-4 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-gray-800 flex-1 pr-2">{file.name}</h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => downloadFile(file)}
                            className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <Download className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => moveToTrash(file.id)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">
                        {(file.file_size / 1024).toFixed(2)} KB • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <FolderPlus className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a folder to view files</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
