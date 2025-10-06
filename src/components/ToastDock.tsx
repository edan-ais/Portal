// components/ToastDock.tsx
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
const TICK_MS = 100;

export function ToastDock() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pausedToasts = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<number | null>(null);
  const [bottomOffset, setBottomOffset] = useState<number>(96); // default fallback px

  // ---- Measure BottomBar height dynamically ----
  useEffect(() => {
    const updateOffset = () => {
      const bar = document.getElementById('bottom-bar');
      if (bar) {
        const height = bar.getBoundingClientRect().height || 0;
        setBottomOffset(height + 24); // 24px = ~1.5rem gap
      } else {
        setBottomOffset(96);
      }
    };
    updateOffset();

    // re-measure on resize & if BottomBar resizes
    const ro = new ResizeObserver(updateOffset);
    const bar = document.getElementById('bottom-bar');
    if (bar) ro.observe(bar);

    window.addEventListener('resize', updateOffset);
    return () => {
      window.removeEventListener('resize', updateOffset);
      ro.disconnect();
    };
  }, []);

  // ---- Poll new unread notifications ----
  useEffect(() => {
    const checkForNew = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error || !data) return;
      const existingIds = new Set(toasts.map((t) => t.id));
      const newOnes = data.filter((n) => !existingIds.has(n.id));

      if (newOnes.length) {
        const mapped = newOnes.map((n) => ({
          id: n.id,
          title: n.title ?? 'Notification',
          message: n.message,
          tab: n.tab ?? undefined,
          created_at: n.created_at,
          timeLeft: TOAST_DURATION,
        }));
        setToasts((prev) => [...mapped, ...prev].slice(0, 4));
      }
    };

    checkForNew();
    checkIntervalRef.current = window.setInterval(checkForNew, 10000);
    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [toasts]);

  // ---- Countdown loop ----
  useEffect(() => {
    const interval = window.setInterval(() => {
      setToasts((prev) =>
        prev
          .map((t) =>
            pausedToasts.current.has(t.id)
              ? t
              : { ...t, timeLeft: Math.max(0, t.timeLeft - TICK_MS) }
          )
          .filter((t) => t.timeLeft > 0)
      );
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const dismissToast = async (id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch {}
  };

  const handlePause = (id: string, pause: boolean) => {
    if (pause) pausedToasts.current.add(id);
    else pausedToasts.current.delete(id);
  };

  return (
    <div
      className="fixed right-8 z-[9999] flex flex-col-reverse gap-3 pointer-events-none"
      style={{
        bottom: `${bottomOffset}px`,
      }}
    >
      {toasts.map((toast) => {
        const progress = (toast.timeLeft / TOAST_DURATION) * 100;
        const isEntering = toast.timeLeft === TOAST_DURATION;
        const translateX = isEntering ? 400 : 0;
        const fadeWindow = 200;
        const opacity =
          toast.timeLeft > fadeWindow ? 1 : Math.max(0, toast.timeLeft / fadeWindow);

        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-blue-100 w-96 max-w-[90vw] overflow-hidden transition-all duration-300"
            style={{
              transform: `translateX(${translateX}px)`,
              opacity,
            }}
            onMouseEnter={() => handlePause(toast.id, true)}
            onMouseLeave={() => handlePause(toast.id, false)}
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
                  aria-label="Dismiss notification"
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
