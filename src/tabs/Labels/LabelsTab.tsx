import { useState, useEffect } from 'react';
import { Tag, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface Label {
  id: string;
  name: string;
  color: string;
  description: string;
}

export default function LabelsTab() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    description: '',
  });

  const colorOptions = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  useEffect(() => {
    fetchLabels();
  }, []);

  const fetchLabels = async () => {
    const { data } = await supabase
      .from('labels')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLabels(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('labels').insert([formData]);
    setShowForm(false);
    setFormData({
      name: '',
      color: '#3b82f6',
      description: '',
    });
    fetchLabels();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('labels').delete().eq('id', id);
    fetchLabels();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Labels</h2>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-5 h-5" />
          New Label
        </motion.button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="glass-card rounded-2xl p-6"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Label Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                  placeholder="Label name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Color</label>
                <div className="grid grid-cols-10 gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        formData.color === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none h-24"
                  placeholder="Label description..."
                />
              </div>
              <div className="flex gap-3">
                <motion.button
                  type="submit"
                  className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Create Label
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
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          <p className="text-gray-600">Loading labels...</p>
        ) : labels.length === 0 ? (
          <p className="text-gray-500">No labels yet. Create your first label!</p>
        ) : (
          labels.map((label) => (
            <motion.div
              key={label.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-xl p-5 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex justify-between items-start mb-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${label.color}40` }}
                >
                  <Tag className="w-6 h-6" style={{ color: label.color }} />
                </div>
                <button
                  onClick={() => handleDelete(label.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4 text-red-300" />
                </button>
              </div>
              <h3 className="text-lg font-bold text-gray-800 font-quicksand mb-2">{label.name}</h3>
              {label.description && (
                <p className="text-sm text-gray-500 line-clamp-2">{label.description}</p>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
