import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  title: string;
  message: string;
  tab: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  /** Auto-dismiss duration in ms (default 4000) */
  duration?: number;
}

export default function NotificationPanel({
  isOpen,
  onClose,
  onNavigate,
  duration = 4000,
}: NotificationPanelProps) {
  const [queue, setQueue] = useState<Notification[]>([]);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(duration);
  const [paused, setPaused] = useState(false);

  const startTsRef = useRef<number | null>(null);
  const remainingRef = useRef<number>(remaining);

  // Keep refs in sync
  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  // Fetch a batch when opened (prefer unread; fall back to latest)
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      // Try unread first
      let { data: unread, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) console.error('Fetch unread notifications error:', error);

      if (!unread || unread.length === 0) {
        // Fallback to most recent if none unread
        const { data: recent, error: error2 } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3);
        if (error2) console.error('Fetch recent notifications error:', error2);
        setQueue(recent ?? []);
      } else {
        setQueue(unread);
      }

      setIndex(0);
      setRemaining(duration);
      startTsRef.current = null;
    })();
  }, [isOpen, duration]);

  // rAF timer for smooth progress; pauses on hover
  useEffect(() => {
    if (!isOpen || queue.length === 0) return;

    let rafId: number;

    const tick = (ts: number) => {
      if (paused) {
        startTsRef.current = ts; // re-anchor on unpause
      } else {
        if (startTsRef.current == null) startTsRef.current = ts;
        const elapsed = ts - startTsRef.current;
        const nextRemaining = Math.max(0, remainingRef.current - elapsed);
        setRemaining(nextRemaining);
        startTsRef.current = ts;

        if (nextRemaining <= 0) {
          handleAutoClose();
          return; // stop this cycle; the next item will restart timer
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, paused, index, queue.length]);

  const current = queue[index] ?? null;

  const progressPct = useMemo(() => {
    const pct = (remaining / duration) * 100;
    return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  }, [remaining, duration]);

  const markAsRead = async (id: string) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    } catch (e) {
      console.error('markAsRead error:', e);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await supabase.from('notifications').delete().eq('id', id);
    } catch (e) {
      console.error('deleteNotification error:', e);
    }
  };

  const advanceOrClose = () => {
    const hasNext = index + 1 < queue.length;
    if (hasNext) {
      setIndex((i) => i + 1);
      setRemaining(duration);
      startTsRef.current = null;
    } else {
      onClose();
    }
  };

  const handleAutoClose = async () => {
    if (current) await markAsRead(current.id);
    advanceOrClose();
  };

  const handleManualClose = async () => {
    if (current) await markAsRead(current.id);
    advanceOrClose();
  };

  const handleClick = async () => {
    if (!current) return;
    await markAsRead(current.id);
    if (current.tab) onNavigate(current.tab);
    onClose();
  };

  // Optional delete button support (not required for the toast UX)
  const handleDelete = async () => {
    if (!current) return;
    await deleteNotification(current.id);
    advanceOrClose();
  };

  // Render via portal to avoid clipping by parents
  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end">
      {/* Anchor in bottom-right; bottom-20 keeps it above a typical BottomBar (h-12) */}
      <div className="fixed right-4 md:right-6 bottom-20 md:bottom-24 w-full max-w-sm pointer-events-none">
        <AnimatePresence initial={false} mode="popLayout">
          {isOpen && current && (
            <motion.div
              key={current.id}
              initial={{ x: 64, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -64, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto rounded-2xl shadow-xl border border-blue-100 bg-white overflow-hidden"
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              role="status"
              aria-live="polite"
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Accent dot */}
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{current.title}</p>
                      {current.tab && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                          {current.tab}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-700 break-words">{current.message}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {new Date(current.created_at).toLocaleString()}
                    </p>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={handleClick}
                        className="text-sm font-medium text-blue-700 hover:opacity-80 transition"
                      >
                        Open
                      </button>
                      <button
                        onClick={handleDelete}
                        className="text-sm text-gray-500 hover:text-gray-700 hover:opacity-80 transition"
                        title="Delete notification"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <button
                    aria-label="Dismiss"
                    onClick={handleManualClose}
                    className="shrink-0 rounded-md p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1 w-full bg-blue-50">
                <div
                  className="h-full bg-blue-600"
                  style={{
                    width: `${progressPct}%`,
                    transition: paused ? 'none' : 'width 120ms linear',
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body
  );
}
