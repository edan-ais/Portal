import { useState, useEffect } from 'react';
import { Users, Plus, Mail, Phone, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: string;
  notes: string;
}

export default function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    source: '',
    status: 'new',
    notes: '',
  });

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setLeads(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('leads').insert([formData]);
    setShowForm(false);
    setFormData({
      name: '',
      email: '',
      phone: '',
      source: '',
      status: 'new',
      notes: '',
    });
    fetchLeads();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('leads').delete().eq('id', id);
    fetchLeads();
  };

  const statusColors: Record<string, string> = {
    new: 'bg-blue-500/30 text-gray-700',
    contacted: 'bg-yellow-500/30 text-yellow-100',
    qualified: 'bg-green-500/30 text-green-100',
    closed: 'bg-gray-500/30 text-gray-100',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Lead Capture</h2>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-5 h-5" />
          New Lead
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="Lead name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Source</label>
                  <input
                    type="text"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="Website, referral, etc."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none h-24"
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-3">
                <motion.button
                  type="submit"
                  className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Add Lead
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

      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <p className="text-gray-600">Loading leads...</p>
        ) : leads.length === 0 ? (
          <p className="text-gray-500">No leads yet. Add your first lead!</p>
        ) : (
          leads.map((lead) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card rounded-xl p-5 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-800 font-quicksand">{lead.name}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                      {lead.status}
                    </span>
                  </div>
                  <div className="space-y-1 mb-3">
                    {lead.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="w-4 h-4" />
                        <span>{lead.email}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{lead.phone}</span>
                      </div>
                    )}
                  </div>
                  {lead.notes && <p className="text-sm text-gray-500">{lead.notes}</p>}
                  {lead.source && (
                    <p className="text-xs text-gray-400 mt-2">Source: {lead.source}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(lead.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4 text-red-300" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
