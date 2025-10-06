import { useState, useEffect } from 'react';
import { DollarSign, Plus, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  category: string;
  description: string;
  transaction_date: string;
}

export default function AccountingTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    transaction_type: 'income',
    amount: '',
    category: '',
    description: '',
    transaction_date: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false });
    if (data) setTransactions(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('transactions').insert([formData]);
    setShowForm(false);
    setFormData({
      transaction_type: 'income',
      amount: '',
      category: '',
      description: '',
      transaction_date: new Date().toISOString().slice(0, 16),
    });
    fetchTransactions();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id);
    fetchTransactions();
  };

  const income = transactions
    .filter((t) => t.transaction_type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = transactions
    .filter((t) => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balance = income - expenses;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-gray-500" />
          <h2 className="text-3xl font-bold text-gray-800 font-quicksand">Accounting</h2>
        </div>
        <motion.button
          onClick={() => setShowForm(!showForm)}
          className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Plus className="w-5 h-5" />
          New Transaction
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-xl p-6"
        >
          <TrendingUp className="w-8 h-8 text-green-300 mb-3" />
          <h3 className="text-3xl font-bold text-green-400 font-quicksand">
            ${income.toFixed(2)}
          </h3>
          <p className="text-gray-500 text-sm">Total Income</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6"
        >
          <TrendingDown className="w-8 h-8 text-red-300 mb-3" />
          <h3 className="text-3xl font-bold text-red-400 font-quicksand">
            ${expenses.toFixed(2)}
          </h3>
          <p className="text-gray-500 text-sm">Total Expenses</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-6"
        >
          <DollarSign className="w-8 h-8 text-gray-500 mb-3" />
          <h3 className={`text-3xl font-bold font-quicksand ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${balance.toFixed(2)}
          </h3>
          <p className="text-gray-500 text-sm">Balance</p>
        </motion.div>
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
                  <label className="block text-sm font-medium text-gray-600 mb-2">Type</label>
                  <select
                    value={formData.transaction_type}
                    onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
                    className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 focus:outline-none"
                  >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
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
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Category</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none"
                  placeholder="e.g., Payroll, Marketing, Sales"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 placeholder-blue-300 focus:outline-none h-24"
                  placeholder="Transaction details..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Date</label>
                <input
                  type="datetime-local"
                  value={formData.transaction_date}
                  onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                  className="w-full glass-input rounded-lg px-4 py-3 text-gray-800 focus:outline-none"
                />
              </div>
              <div className="flex gap-3">
                <motion.button
                  type="submit"
                  className="glass-button px-6 py-3 rounded-lg text-gray-800 font-quicksand font-medium"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Add Transaction
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
          <p className="text-gray-600">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="text-gray-500">No transactions yet. Add your first transaction!</p>
        ) : (
          transactions.map((transaction) => (
            <motion.div
              key={transaction.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="glass-card rounded-xl p-5 hover:shadow-2xl transition-all duration-300"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {transaction.transaction_type === 'income' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <h3 className="text-lg font-bold text-gray-800 font-quicksand">
                      {transaction.category || 'Uncategorized'}
                    </h3>
                    <span className={`text-xl font-bold ${
                      transaction.transaction_type === 'income' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {transaction.transaction_type === 'income' ? '+' : '-'}${Number(transaction.amount).toFixed(2)}
                    </span>
                  </div>
                  {transaction.description && (
                    <p className="text-sm text-gray-500 mb-2">{transaction.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(transaction.transaction_date).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(transaction.id)}
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
