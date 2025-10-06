import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  role: 'admin' | 'staff';
}

interface ProfileContextType {
  currentProfile: Profile | null;
  profiles: Profile[];
  switchProfile: (profileId: string) => Promise<void>;
  isAdmin: boolean;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data: profilesData } = await supabase.from('profiles').select('*');

    if (profilesData && profilesData.length > 0) {
      setProfiles(profilesData);

      const { data: activeProfile } = await supabase
        .from('active_profiles')
        .select('profile_id')
        .single();

      if (activeProfile) {
        const active = profilesData.find((p) => p.id === activeProfile.profile_id);
        setCurrentProfile(active || profilesData[0]);
      } else {
        setCurrentProfile(profilesData[0]);
        await supabase.from('active_profiles').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          profile_id: profilesData[0].id,
        });
      }
    }
    setLoading(false);
  };

  const switchProfile = async (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (profile) {
      setCurrentProfile(profile);
      await supabase
        .from('active_profiles')
        .upsert({
          user_id: '00000000-0000-0000-0000-000000000000',
          profile_id: profileId,
        });
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        currentProfile,
        profiles,
        switchProfile,
        isAdmin: currentProfile?.role === 'admin',
        loading,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
