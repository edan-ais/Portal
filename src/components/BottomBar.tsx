import { Heart } from 'lucide-react';

export default function BottomBar() {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-12 bg-white border-t border-gray-200 z-50 shadow-sm">
      <div className="h-full px-6 flex items-center justify-between">
        <p className="text-xs text-gray-600 font-quicksand">
          © 2025 Portal Management System. All rights reserved.
        </p>
        <p className="text-xs text-gray-600 font-quicksand flex items-center gap-1">
          Made with <Heart className="w-3 h-3 fill-blue-500 text-blue-500" /> for productivity
        </p>
      </div>
    </div>
  );
}
