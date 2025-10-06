import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './components/TopBar';
import BottomBar from './components/BottomBar';
import Sidebar, { TabItem, tabIconMap } from './components/Sidebar';
import HomeTab from './tabs/Home/HomeTab';
import TasksTab from './tabs/Tasks/TasksTab';
import EventsTab from './tabs/Events/EventsTab';
import LeadsTab from './tabs/Leads/LeadsTab';
import SocialMediaTab from './tabs/SocialMedia/SocialMediaTab';
import LabelsTab from './tabs/Labels/LabelsTab';
import DonationsTab from './tabs/Donations/DonationsTab';
import StoreTab from './tabs/Store/StoreTab';
import AccountingTab from './tabs/Accounting/AccountingTab';

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

  const handleTabOrderChange = (newOrder: TabItem[]) => {
    setTabs(newOrder);
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
        onLogoClick={() => setActiveTab('home')}
      />
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onTabOrderChange={handleTabOrderChange}
      />
      <main className="fixed left-64 right-0 top-16 bottom-12 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto px-8 pt-8">
          <div className="max-w-7xl mx-auto h-full pb-8">
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
