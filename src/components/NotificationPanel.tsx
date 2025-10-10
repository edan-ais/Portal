import { useState, useEffect } from 'react';
import { X, Check, RefreshCcw, Mail, MailCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  title: string;
  message: string;
  tab?: string | null;
  is_read: boolean;
  is_big?: boolean;
  email_to?: string | null;
  sent?: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export default function NotificationPanel({ isOpen, onClose, onNavigate }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) console.error(error);
    if (data) setNotifications(data);
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleNotificationClick = (n: Notification) => {
    markAsRead(n.id);
    if (n.tab) onNavigate(n.tab);
    onClose();
  };

  const refreshList = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-20 right-8 w-96 max-h-[80vh] bg-white rounded-2xl shadow-2xl border border-blue-100 z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-blue-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-800 font-quicksand flex items-center gap-2">
                Notifications
                {notifications.filter((n) => !n.is_read).length > 0 && (
                  <span className="text-sm bg-blue-600 text-white px-2 py-0.5 rounded-full">
                    {notifications.filter((n) => !n.is_read).length}
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshList}
                  className="p-2 hover:bg-blue-50 rounded-lg transition"
                  title="Refresh"
                >
                  <RefreshCcw
                    className={`w-4 h-4 text-gray-600 ${
                      refreshing ? 'animate-spin' : ''
                    }`}
                  />
                </button>
                <button onClick={onClose} className="p-2 hover:bg-blue-50 rounded-lg transition">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-4.5rem)]">
              {loading ? (
                <div className="p-6 text-center text-gray-500">Loading...</div>
              ) : notifications.length === 0 ? (
                <div className="p-12 text-center text-gray-500 font-quicksand">
                  No notifications yet
                </div>
              ) : (
                <div className="divide-y divide-blue-50">
                  {notifications.map((n) => (
                    <motion.div
                      key={n.id}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 cursor-pointer transition-all relative ${
                        !n.is_read ? 'bg-blue-25 hover:bg-blue-50' : 'hover:bg-gray-50'
                      } ${n.is_big ? 'border-l-4 border-blue-500' : ''}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      {!n.is_read && (
                        <div className="absolute top-4 left-2 w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                      <div className="flex justify-between items-start ml-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                            {n.title}
                            {n.is_big && (
                              <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-wide">
                                Big
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-gray-600">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1 ml-2">
                          {n.email_to && (
                            <div title={n.sent ? 'Email sent' : 'Pending email'}>
                              {n.sent ? (
                                <MailCheck className="w-4 h-4 text-green-600" />
                              ) : (
                                <Mail className="w-4 h-4 text-blue-600" />
                              )}
                            </div>
                          )}
                          {!n.is_read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(n.id);
                              }}
                              className="p-1 hover:bg-green-100 rounded-lg"
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4 text-green-600" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="p-1 hover:bg-red-100 rounded-lg"
                            title="Delete"
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
