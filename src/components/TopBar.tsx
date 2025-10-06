import { Search, User } from 'lucide-react';

interface TopBarProps {
  onLogoClick: () => void;
}

export default function TopBar({ onLogoClick }: TopBarProps) {
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
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all duration-300">
            <User className="w-5 h-5 text-gray-700" />
            <span className="text-sm text-gray-700 font-quicksand">David</span>
          </button>
        </div>
      </div>
    </div>
  );
}
