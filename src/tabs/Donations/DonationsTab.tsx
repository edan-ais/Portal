import { useState, useEffect } from 'react';
import { Heart, Plus, DollarSign, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface Donation {
  id: string;
  donor_name: string;
  donor_email: string;
  amount: number;
  donation_date: string;
  payment_method: string;
  notes: string;
}

export default function DonationsTab() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    donor_name: '',
    donor_email: '',
    amount: '',
    donation_date: new Date().toISOString().slice(0, 16),
    payment_method: 'cash',
    notes: '',
  });

  useEffect(() => {
    fetchDonations();
  }, []);

  const fetchDonations = async () => {
    const { data } = await supabase
      .from('donations')
      .select('*')
      .order('donation_date', { ascending: false });
    if (data) setDonations(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('donations').insert([formData]);
    setShowForm(false);
    setFormData({
      donor_name: '',
      donor_email: '',
      amount: '',
      donation_date: new Date().toISOString().slice(0, 16),
      payment_method: 'cash',
      notes: '',
    });
    fetchDonations();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('donations').delete().eq('id', id);
    fetchDonations();
  };

  const totalDonations = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Heart className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Donations</h2>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-5 h-5" />
          New Donation
        </motion.button>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card rounded-2xl p-8 text-center"
      >
        <DollarSign className="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <h3 className="text-4xl font-bold text-gray-800 font-quicksand">
          ${totalDonations.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </h3>
        <p className="text-gray-500 mt-2">Total Donations</p>
      </motion.div>

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
                  <label className="block text-sm font-medium text-gray-600 mb-2">Donor Name</label>
                  <input
                    type="text"
                    value={formData.donor_name}
                    onChange={(e) => setFormData({ ...formData, donor_name: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="Donor name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.donor_email}
                    onChange={(e) => setFormData({ ...formData, donor_email: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="email@example.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="check">Check</option>
                    <option value="online">Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Date</label>
                <input
                  type="datetime-local"
                  value={formData.donation_date}
                  onChange={(e) => setFormData({ ...formData, donation_date: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 focus:outline-none"
                />
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
                  Record Donation
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

      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-600">Loading donations...</p>
        ) : donations.length === 0 ? (
          <p className="text-gray-500">No donations yet. Record your first donation!</p>
        ) : (
          donations.map((donation) => (
            <motion.div
              key={donation.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card rounded-xl p-5 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-800 font-quicksand">
                      {donation.donor_name}
                    </h3>
                    <span className="text-2xl font-bold text-green-400">
                      ${Number(donation.amount).toFixed(2)}
                    </span>
                  </div>
                  {donation.donor_email && (
                    <p className="text-sm text-gray-500 mb-2">{donation.donor_email}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>{new Date(donation.donation_date).toLocaleDateString()}</span>
                    <span className="capitalize">{donation.payment_method}</span>
                  </div>
                  {donation.notes && (
                    <p className="text-sm text-gray-500 mt-2">{donation.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(donation.id)}
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
