import { useState, useEffect, useRef } from 'react';
import { X, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Toast {
  id: string;
  title: string;
  message: string;
  tab?: string;
  created_at: string;
  timeLeft: number;
}

const TOAST_DURATION = 5000;

export function ToastDock() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pausedToasts = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const checkForNewNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !data) return;

      const existingIds = new Set(toasts.map((t) => t.id));
      const newNotifications = data.filter((n) => !existingIds.has(n.id));

      if (newNotifications.length > 0) {
        const newToasts = newNotifications.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          tab: n.tab,
          created_at: n.created_at,
          timeLeft: TOAST_DURATION,
        }));
        setToasts((prev) => [...newToasts, ...prev]);
      }
    };

    checkForNewNotifications();
    checkIntervalRef.current = window.setInterval(checkForNewNotifications, 10000);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setToasts((prev) => {
        const updated = prev
          .map((toast) => {
            if (pausedToasts.current.has(toast.id)) return toast;
            return { ...toast, timeLeft: toast.timeLeft - 100 };
          })
          .filter((toast) => toast.timeLeft > 0);
        return updated;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const dismissToast = async (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const handleMouseEnter = (id: string) => {
    pausedToasts.current.add(id);
  };

  const handleMouseLeave = (id: string) => {
    pausedToasts.current.delete(id);
  };

  return (
    <div className="fixed bottom-16 right-8 z-[9999] flex flex-col-reverse gap-3 pointer-events-none">
      {toasts.map((toast, index) => {
        const progress = (toast.timeLeft / TOAST_DURATION) * 100;
        const translateX = toast.timeLeft === TOAST_DURATION ? 400 : 0;
        const opacity = toast.timeLeft > 200 ? 1 : toast.timeLeft / 200;

        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-blue-100 w-96 overflow-hidden transition-all duration-300"
            style={{
              transform: `translateX(${translateX}px)`,
              opacity,
            }}
            onMouseEnter={() => handleMouseEnter(toast.id)}
            onMouseLeave={() => handleMouseLeave(toast.id)}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Bell className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-gray-800 text-sm truncate">
                      {toast.title}
                    </h4>
                    {toast.tab && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize flex-shrink-0">
                        {toast.tab}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{toast.message}</p>
                </div>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="flex-shrink-0 p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="h-1 bg-gray-100">
              <div
                className="h-full bg-blue-500 transition-all duration-100 linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
