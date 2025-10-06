import { Calendar, Users, Share2, Tag, Heart, ShoppingBag, DollarSign, Home, ListTodo, GripVertical, Video as LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: TabItem[];
  onTabOrderChange: (newOrder: TabItem[]) => void;
}

export interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface SortableTabProps {
  tab: TabItem;
  isActive: boolean;
  onTabChange: (id: string) => void;
}

function SortableTab({ tab, isActive, onTabChange }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = tab.icon;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <motion.button
        onClick={() => onTabChange(tab.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 group relative overflow-hidden ${
          isActive
            ? 'bg-blue-500 text-white shadow-lg'
            : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1"
        >
          <GripVertical className="w-4 h-4 opacity-40" />
        </div>
        <Icon className="w-5 h-5 transition-transform duration-300" />
        <span className="font-quicksand font-medium flex-1 text-left">{tab.label}</span>
      </motion.button>
    </div>
  );
}

export const tabIconMap: Record<string, LucideIcon> = {
  home: Home,
  tasks: ListTodo,
  events: Calendar,
  leads: Users,
  social: Share2,
  labels: Tag,
  donations: Heart,
  store: ShoppingBag,
  accounting: DollarSign,
};

export default function Sidebar({ activeTab, onTabChange, tabs, onTabOrderChange }: SidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
      const newIndex = tabs.findIndex((tab) => tab.id === over.id);
      const newOrder = arrayMove(tabs, oldIndex, newIndex);
      onTabOrderChange(newOrder);
    }
  };

  return (
    <div className="fixed left-0 top-16 bottom-12 w-64 bg-white border-r border-gray-200 z-40 shadow-sm">
      <div className="h-full overflow-y-auto py-6 px-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map((tab) => tab.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onTabChange={onTabChange}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
