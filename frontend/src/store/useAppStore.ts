import { create } from 'zustand';
import type { Account, UserInfo } from '../types';
import { api } from '../api';

export interface ActiveLocation {
  cityCode: number;
  cityName: string;
  addressName: string;
  longitude: string;
  latitude: string;
}

const getStoredLocation = (): ActiveLocation => {
  try {
    const raw = localStorage.getItem('xiaocan_active_location');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.longitude && parsed.latitude) {
        return parsed;
      }
    }
  } catch (e) {}
  return {
    cityCode: 420100,
    cityName: '武汉',
    addressName: '武昌首义 / 阅马场',
    longitude: '114.305393',
    latitude: '30.593099',
  };
};

const getStoredCurrentAccountKey = (): string => {
  try {
    return localStorage.getItem('xiaocan_current_account_key') || '';
  } catch (e) {
    return '';
  }
};

const getStoredAccounts = (): Account[] => {
  try {
    const raw = localStorage.getItem('xiaocan_cached_accounts');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
};

const getStoredSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem('xiaocan_sidebar_collapsed') === 'true';
  } catch (e) {
    return false;
  }
};

interface AppState {
  activeTab: string;
  accounts: Account[];
  currentAccountKey: string;
  isDarkMode: boolean;
  userInfo: UserInfo | null;
  loading: boolean;
  activeLocation: ActiveLocation;
  isSidebarCollapsed: boolean;
  
  setActiveTab: (tab: string) => void;
  setDarkMode: (dark: boolean) => void;
  setCurrentAccountKey: (key: string) => void;
  setActiveLocation: (loc: Partial<ActiveLocation>) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapse: () => void;
  loadAccounts: () => Promise<void>;
  loadUserInfo: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  const initialAccounts = getStoredAccounts();
  const storedKey = getStoredCurrentAccountKey();
  const initialKey =
    storedKey && initialAccounts.some((a) => a.key === storedKey)
      ? storedKey
      : initialAccounts[0]?.key || storedKey;

  return {
    activeTab: 'dashboard',
    accounts: initialAccounts,
    currentAccountKey: initialKey,
    isDarkMode: false,
    userInfo: null,
    loading: false,
    activeLocation: getStoredLocation(),
    isSidebarCollapsed: getStoredSidebarCollapsed(),

  setActiveTab: (tab: string) => set({ activeTab: tab }),

  setSidebarCollapsed: (collapsed: boolean) => {
    try {
      localStorage.setItem('xiaocan_sidebar_collapsed', String(collapsed));
    } catch (e) {}
    set({ isSidebarCollapsed: collapsed });
  },

  toggleSidebarCollapse: () => {
    const next = !get().isSidebarCollapsed;
    try {
      localStorage.setItem('xiaocan_sidebar_collapsed', String(next));
    } catch (e) {}
    set({ isSidebarCollapsed: next });
  },

  setActiveLocation: (loc: Partial<ActiveLocation>) => {
    const prev = get().activeLocation;
    const updated = { ...prev, ...loc };
    try {
      localStorage.setItem('xiaocan_active_location', JSON.stringify(updated));
    } catch (e) {}
    set({ activeLocation: updated });
  },

  setDarkMode: (dark: boolean) => {
    set({ isDarkMode: dark });
    const body = document.body;
    if (dark) {
      body.setAttribute('theme-mode', 'dark');
    } else {
      body.removeAttribute('theme-mode');
    }
  },

  setCurrentAccountKey: (key: string) => {
    try {
      localStorage.setItem('xiaocan_current_account_key', key);
    } catch (e) {}
    set({ currentAccountKey: key });
  },

  loadAccounts: async () => {
    if (loadAccountsInFlight) {
      return loadAccountsInFlight;
    }
    loadAccountsInFlight = (async () => {
      try {
        set({ loading: true });
        const res = await api.getAccounts();
        const accounts = res.accounts || [];
        try {
          localStorage.setItem('xiaocan_cached_accounts', JSON.stringify(accounts));
        } catch (e) {}
        const current = get().currentAccountKey;
        let newCurrent = current;
        const exists = accounts.some((a) => a.key === current);
        if ((!newCurrent || !exists) && accounts.length > 0) {
          newCurrent = accounts[0].key;
          try {
            localStorage.setItem('xiaocan_current_account_key', newCurrent);
          } catch (e) {}
        }
        set({ accounts, currentAccountKey: newCurrent, loading: false });
      } catch (e) {
        set({ loading: false });
      } finally {
        loadAccountsInFlight = null;
      }
    })();
    return loadAccountsInFlight;
  },

  loadUserInfo: async () => {
    if (loadUserInfoInFlight) {
      return loadUserInfoInFlight;
    }
    loadUserInfoInFlight = (async () => {
      try {
        const res = await api.getMe();
        if (res.ok) {
          set({ userInfo: res.user });
        }
      } catch (e) {
      } finally {
        loadUserInfoInFlight = null;
      }
    })();
    return loadUserInfoInFlight;
  },
  };
});

let loadAccountsInFlight: Promise<void> | null = null;
let loadUserInfoInFlight: Promise<void> | null = null;

