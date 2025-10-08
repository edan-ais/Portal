import { Search, User, Bell, ChevronDown, LogOut } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface TopBarProps {
  onNotificationClick: () => void;
  onLogoClick: () => void;
  unreadCount: number;
}

interface Profile {
  id: string;
  name: string;
  role: 'admin' | 'staff';
}

export default function TopBar({ onNotificationClick, onLogoClick, unreadCount }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const [showProfiles, setShowProfiles] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setShowProfiles(false);
  };

  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 z-50 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between">
        <button
          onClick={onLogoClick}
          className="text-xl font-quicksand font-bold text-blue-600 hover:text-blue-700 transition-colors"
        >
          Portal
        </button>
        <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md px-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 glass-input rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onNotificationClick}
            className="relative p-2 hover:bg-blue-50 rounded-lg transition-all duration-300"
          >
            <Bell className="w-5 h-5 text-gray-700" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowProfiles(!showProfiles)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-300"
            >
              <User className="w-5 h-5 text-gray-700" />
              <span className="text-sm text-gray-700 font-quicksand">{profile?.name || 'User'}</span>
              <ChevronDown className={`w-4 h-4 text-gray-700 transition-transform ${showProfiles ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showProfiles && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfiles(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50"
                  >
                    <div className="p-2">
                      <div className="px-3 py-3 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                            {profile?.name.charAt(0) || 'U'}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-800">{profile?.name || 'User'}</div>
                            <div className="text-xs text-gray-500 capitalize">{profile?.role || 'staff'}</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-all"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="text-sm font-medium">Sign Out</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
