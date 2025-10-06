import { useState } from 'react';
import { Search, User, Bell, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile } from '../contexts/ProfileContext';

interface TopBarProps {
  onNotificationClick: () => void;
  onLogoClick: () => void;
  unreadCount: number;
}

export default function TopBar({ onNotificationClick, onLogoClick, unreadCount }: TopBarProps) {
  const { currentProfile, profiles, switchProfile } = useProfile();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

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
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-300"
            >
              <User className="w-5 h-5 text-gray-700" />
              <span className="text-sm text-gray-700 font-quicksand">
                {currentProfile?.name || 'Account'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
            <AnimatePresence>
              {showProfileMenu && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setShowProfileMenu(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50"
                  >
                    <div className="p-3">
                      <p className="text-xs text-gray-500 font-quicksand mb-2">Switch Profile</p>
                      {profiles.map((profile) => (
                        <button
                          key={profile.id}
                          onClick={() => {
                            switchProfile(profile.id);
                            setShowProfileMenu(false);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-lg transition-all mb-1 ${
                            currentProfile?.id === profile.id
                              ? 'bg-blue-50 text-blue-700 font-semibold'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              profile.role === 'admin' ? 'bg-blue-100' : 'bg-gray-100'
                            }`}>
                              <User className={`w-4 h-4 ${
                                profile.role === 'admin' ? 'text-blue-600' : 'text-gray-600'
                              }`} />
                            </div>
                            <div>
                              <p className="font-quicksand">{profile.name}</p>
                              <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
                            </div>
                          </div>
                        </button>
                      ))}
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
