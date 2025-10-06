import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import Sidebar, { TabItem, tabIconMap } from './components/Sidebar';
import NotificationPanel from './components/NotificationPanel';
import HomeTab from './tabs/Home/HomeTab';
import TasksTab from './tabs/Tasks/TasksTab';
import EventsTab from './tabs/Events/EventsTab';
import LeadsTab from './tabs/Leads/LeadsTab';
import SocialMediaTab from './tabs/SocialMedia/SocialMediaTab';
import LabelsTab from './tabs/Labels/LabelsTab';
import DonationsTab from './tabs/Donations/DonationsTab';
import StoreTab from './tabs/Store/StoreTab';
import AccountingTab from './tabs/Accounting/AccountingTab';
import { supabase } from './lib/supabase';

const defaultTabs: TabItem[] = [
  { id: 'home', label: 'Home', icon: tabIconMap.home },
  { id: 'tasks', label: 'Tasks', icon: tabIconMap.tasks },
  { id: 'events', label: 'Events', icon: tabIconMap.events },
  { id: 'leads', label: 'Leads', icon: tabIconMap.leads },
  { id: 'social', label: 'Social Media', icon: tabIconMap.social },
  { id: 'labels', label: 'Labels', icon: tabIconMap.labels },
  { id: 'donations', label: 'Donations', icon: tabIconMap.donations },
  { id: 'store', label: 'Store', icon: tabIconMap.store },
  { id: 'accounting', label: 'Accounting', icon: tabIconMap.accounting },
];

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [tabs, setTabs] = useState<TabItem[]>(defaultTabs);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);
    setUnreadCount(count || 0);
  };

  const handleTabOrderChange = (newOrder: TabItem[]) => {
    setTabs(newOrder);
  };

  const handleNotificationNavigate = (tab: string) => {
    setActiveTab(tab);
    setShowNotifications(false);
  };

  const renderTab = () => {
    const tabComponents: Record<string, JSX.Element> = {
      home: <HomeTab />,
      tasks: <TasksTab />,
      events: <EventsTab />,
      leads: <LeadsTab />,
      social: <SocialMediaTab />,
      labels: <LabelsTab />,
      donations: <DonationsTab />,
      store: <StoreTab />,
      accounting: <AccountingTab />,
    };

    return tabComponents[activeTab] || <HomeTab />;
  };

  return (
    <div className="h-screen bg-gray-50 overflow-hidden">
      <TopBar
        onNotificationClick={() => setShowNotifications(!showNotifications)}
        onLogoClick={() => setActiveTab('home')}
        unreadCount={unreadCount}
      />
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onTabOrderChange={handleTabOrderChange}
      />
      <NotificationPanel
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onNavigate={handleNotificationNavigate}
      />
      <main className="fixed left-64 right-0 top-16 bottom-12 overflow-y-auto">
        <div className="h-full p-8">
          <div className="max-w-7xl mx-auto h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="h-full"
              >
                {renderTab()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  );
}

export default App;
