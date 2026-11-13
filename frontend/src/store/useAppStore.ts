import { create } from 'zustand';
import type { Account, UserInfo, LocationHistoryItem } from '../types';
import { api } from '../api';

export interface ActiveLocation {
  cityCode: number;
  cityName: string;
  addressName: string;
  longitude: string;
  latitude: string;
}

const LOCATION_HISTORY_KEY = 'xiaocan_location_history';
const LOCATION_HISTORY_LIMIT = 10;

// 清理旧版游离的全局定位缓存，确保定位严格跟随账号保存到后端
try {
  localStorage.removeItem('xiaocan_active_location');
} catch (e) {}

export const hasValidAccountLocation = (account?: Account | null): boolean => {
  if (!account) return false;
  const code = Number(account.city_code || 0);
  const cityName = String(account.city_name || '').trim();
  const lonStr = String(account.longitude || '').trim();
  const latStr = String(account.latitude || '').trim();
  const lon = Number(lonStr);
  const lat = Number(latStr);
  return (
    Number.isFinite(code) &&
    code > 0 &&
    Boolean(cityName) &&
    cityName !== '未知' &&
    Boolean(lonStr) &&
    Boolean(latStr) &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon !== 0 &&
    lat !== 0
  );
};

export const deriveAccountLocation = (account?: Account | null): ActiveLocation | null => {
  if (!account || !hasValidAccountLocation(account)) return null;
  const cityName = String(account.city_name || '').trim();
  return {
    cityCode: Number(account.city_code),
    cityName,
    addressName: String(account.address_name || '').trim() || `${cityName}已绑定地址`,
    longitude: String(account.longitude || '').trim(),
    latitude: String(account.latitude || '').trim(),
  };
};

const getStoredLocationHistory = (): LocationHistoryItem[] => {
  try {
    const raw = localStorage.getItem(LOCATION_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item) => item && item.longitude && item.latitude && item.cityName
        );
      }
    }
  } catch (e) {}
  return [];
};

const persistLocationHistory = (items: LocationHistoryItem[]) => {
  try {
    localStorage.setItem(LOCATION_HISTORY_KEY, JSON.stringify(items));
  } catch (e) {}
};

const locationHistoryKey = (loc: { longitude: string; latitude: string }) =>
  `${Number(loc.longitude).toFixed(5)},${Number(loc.latitude).toFixed(5)}`;

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
  tabActivationTick: number;
  accounts: Account[];
  currentAccountKey: string;
  isDarkMode: boolean;
  userInfo: UserInfo | null;
  loading: boolean;
  activeLocation: ActiveLocation | null;
  locationHistory: LocationHistoryItem[];
  locationModalVisible: boolean;
  locationModalAccountKey: string | null;
  isSidebarCollapsed: boolean;
  
  setActiveTab: (tab: string) => void;
  setDarkMode: (dark: boolean) => void;
  setCurrentAccountKey: (key: string) => void;
  openLocationModal: (accountKey?: string | null) => void;
  closeLocationModal: () => void;
  bindAccountLocation: (accountKey: string, loc: ActiveLocation) => Promise<Account>;
  addLocationHistory: (loc: ActiveLocation) => void;
  removeLocationHistory: (loc: { longitude: string; latitude: string }) => void;
  clearLocationHistory: () => void;
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

  const initialAccount = initialAccounts.find((a) => a.key === initialKey) || null;

  return {
    activeTab: 'dashboard',
    tabActivationTick: 0,
    accounts: initialAccounts,
    currentAccountKey: initialKey,
    isDarkMode: false,
    userInfo: null,
    loading: false,
    activeLocation: deriveAccountLocation(initialAccount),
    locationHistory: getStoredLocationHistory(),
    locationModalVisible: false,
    locationModalAccountKey: null,
    isSidebarCollapsed: getStoredSidebarCollapsed(),

  setActiveTab: (tab: string) =>
    set((state) => ({
      activeTab: tab,
      tabActivationTick: state.tabActivationTick + 1,
    })),

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

  openLocationModal: (accountKey?: string | null) =>
    set({
      locationModalVisible: true,
      locationModalAccountKey: accountKey || get().currentAccountKey || null,
    }),

  closeLocationModal: () =>
    set({
      locationModalVisible: false,
      locationModalAccountKey: null,
    }),

  bindAccountLocation: async (accountKey: string, loc: ActiveLocation) => {
    const res = await api.updateAccountLocation(accountKey, {
      city_code: loc.cityCode,
      city_name: loc.cityName,
      longitude: loc.longitude,
      latitude: loc.latitude,
      address_name: loc.addressName,
    });
    const updatedAcc = res.account;
    const prevAccounts = get().accounts;
    const nextAccounts = prevAccounts.some((a) => a.key === accountKey)
      ? prevAccounts.map((a) => (a.key === accountKey ? updatedAcc : a))
      : [updatedAcc, ...prevAccounts];
    try {
      localStorage.setItem('xiaocan_cached_accounts', JSON.stringify(nextAccounts));
    } catch (e) {}
    const currentKey = get().currentAccountKey;
    const activeAcc = nextAccounts.find((a) => a.key === currentKey) || null;
    set({
      accounts: nextAccounts,
      activeLocation: deriveAccountLocation(activeAcc),
    });
    return updatedAcc;
  },

  addLocationHistory: (loc: ActiveLocation) => {
    const key = locationHistoryKey(loc);
    const rest = get().locationHistory.filter((item) => locationHistoryKey(item) !== key);
    const next: LocationHistoryItem[] = [
      { ...loc, usedAt: Date.now() },
      ...rest,
    ].slice(0, LOCATION_HISTORY_LIMIT);
    persistLocationHistory(next);
    set({ locationHistory: next });
  },

  removeLocationHistory: (loc: { longitude: string; latitude: string }) => {
    const key = locationHistoryKey(loc);
    const next = get().locationHistory.filter((item) => locationHistoryKey(item) !== key);
    persistLocationHistory(next);
    set({ locationHistory: next });
  },

  clearLocationHistory: () => {
    persistLocationHistory([]);
    set({ locationHistory: [] });
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
    const nextAcc = get().accounts.find((a) => a.key === key) || null;
    set({
      currentAccountKey: key,
      activeLocation: deriveAccountLocation(nextAcc),
    });
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
        if (!newCurrent || !exists) {
          if (accounts.length > 0) {
            newCurrent = accounts[0].key;
            try {
              localStorage.setItem('xiaocan_current_account_key', newCurrent);
            } catch (e) {}
          } else {
            newCurrent = '';
            try {
              localStorage.removeItem('xiaocan_current_account_key');
            } catch (e) {}
          }
        }
        const activeAcc = accounts.find((a) => a.key === newCurrent) || null;
        set({
          accounts,
          currentAccountKey: newCurrent,
          activeLocation: deriveAccountLocation(activeAcc),
          loading: false,
        });
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

