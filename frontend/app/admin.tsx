/**
 * frontend/app/admin.tsx
 * TriniSaver — Admin Panel Screen
 *
 * Fixes applied (was needs_retesting):
 *  • Proper token auth on every fetch
 *  • All 5 tabs: Overview, Users, Flagged, Stores, Banners
 *  • Each tab makes real API calls matching server.py endpoints
 *  • Correct testID on all interactive elements
 *  • Non-admin redirect guard
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const C = {
  primary:      '#0277BD',
  primaryLight: '#E3F2FD',
  accent:       '#FFB300',
  accentDark:   '#E65100',
  surface:      '#FFFFFF',
  bg:           '#F5F7FA',
  text:         '#1A1A1A',
  textSec:      '#64748B',
  border:       '#E2E8F0',
  success:      '#2E7D32',
  error:        '#EF4444',
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

type AdminTab = 'overview' | 'users' | 'flagged' | 'stores' | 'banners';

// ─── API helper ───────────────────────────────────────────────────────────────
async function adminFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
const OverviewTab: React.FC<{ token: string }> = ({ token }) => {
  const [stats, setStats]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch('/api/admin/stats', token)
      .then(setStats)
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} />;

  const tiles = [
    { label: 'Users',       value: stats?.total_users   ?? 0, icon: 'people-outline',      color: C.primary },
    { label: 'Reports',     value: stats?.total_reports ?? 0, icon: 'document-text-outline', color: C.success },
    { label: 'Flagged',     value: stats?.flagged_reports ?? 0, icon: 'flag-outline',       color: C.error },
    { label: 'Specials',    value: stats?.total_specials ?? 0, icon: 'pricetag-outline',    color: C.accentDark },
    { label: 'Stores',      value: stats?.total_stores  ?? 0, icon: 'storefront-outline',  color: '#6A1B9A' },
    { label: 'Pending',     value: stats?.pending_stores ?? 0, icon: 'time-outline',        color: C.accent },
  ];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.tabHeading}>Dashboard Overview</Text>
      <View style={styles.statsGrid}>
        {tiles.map(t => (
          <View key={t.label} style={[styles.statTile, { borderLeftColor: t.color }]}>
            <Ionicons name={t.icon as any} size={20} color={t.color} />
            <Text style={[styles.statValue, { color: t.color }]}>{t.value.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{t.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ─── Users Tab ────────────────────────────────────────────────────────────────
const UsersTab: React.FC<{ token: string }> = ({ token }) => {
  const [users,     setUsers]     = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,    setSearch]    = useState('');

  const load = useCallback(async () => {
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search)}` : '';
      const data = await adminFetch(`/api/admin/users${q}`, token);
      setUsers(data.users ?? data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, search]);

  useEffect(() => { load(); }, [load]);

  const toggleAdmin = async (userId: string, current: boolean) => {
    try {
      await adminFetch(`/api/admin/users/${userId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_admin: !current }),
      });
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, is_admin: !current } : u));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const toggleBan = async (userId: string, current: boolean) => {
    try {
      await adminFetch(`/api/admin/users/${userId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_banned: !current }),
      });
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, is_banned: !current } : u));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} />;

  return (
    <View style={styles.tabContent}>
      <TextInput
        style={styles.searchBox}
        placeholder="Search users…"
        placeholderTextColor={C.textSec}
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={load}
        returnKeyType="search"
        testID="admin-user-search"
      />
      <FlatList
        data={users}
        keyExtractor={u => u._id ?? u.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
        renderItem={({ item: u }) => (
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{(u.name ?? '?').substring(0, 2).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{u.name}</Text>
              <Text style={styles.userEmail}>{u.email}</Text>
              <Text style={styles.userPoints}>{u.points ?? 0} pts</Text>
            </View>
            <View style={styles.userActions}>
              <TouchableOpacity
                style={[styles.userActionBtn, u.is_admin && styles.userActionBtnActive]}
                onPress={() => toggleAdmin(u._id, u.is_admin)}
                testID={`admin-toggle-${u._id}`}
              >
                <Text style={styles.userActionBtnText}>{u.is_admin ? 'Admin ✓' : 'Admin'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.userActionBtn, u.is_banned && styles.userActionBtnDanger]}
                onPress={() => toggleBan(u._id, u.is_banned)}
                testID={`ban-toggle-${u._id}`}
              >
                <Text style={styles.userActionBtnText}>{u.is_banned ? 'Unban' : 'Ban'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
      />
    </View>
  );
};

// ─── Flagged Tab ──────────────────────────────────────────────────────────────
const FlaggedTab: React.FC<{ token: string }> = ({ token }) => {
  const [items,   setItems]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [type,    setType]    = useState<'report' | 'special'>('report');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/flagged?type=${type}`, token);
      setItems(data.items ?? data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [token, type]);

  useEffect(() => { load(); }, [load]);

  const clearFlags = async (itemId: string) => {
    try {
      await adminFetch(`/api/admin/clear-flags/${type}/${itemId}`, token, { method: 'PUT' });
      setItems(prev => prev.filter(i => (i._id ?? i.id) !== itemId));
      Alert.alert('Done', 'Flags cleared.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const deleteItem = async (itemId: string) => {
    Alert.alert('Delete', 'Delete this item permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const path = type === 'report' ? 'reports' : 'specials';
            await adminFetch(`/api/admin/${path}/${itemId}`, token, { method: 'DELETE' });
            setItems(prev => prev.filter(i => (i._id ?? i.id) !== itemId));
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.tabContent}>
      {/* Type toggle */}
      <View style={styles.toggleRow}>
        {(['report', 'special'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.toggleBtn, type === t && styles.toggleBtnActive]}
            onPress={() => setType(t)}
            testID={`flagged-type-${t}`}
          >
            <Text style={[styles.toggleBtnText, type === t && styles.toggleBtnTextActive]}>
              {t === 'report' ? 'Price Reports' : 'Specials'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.centred} color={C.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i._id ?? i.id}
          renderItem={({ item }) => {
            const id = item._id ?? item.id;
            return (
              <View style={styles.flaggedRow}>
                <View style={styles.flaggedInfo}>
                  <Text style={styles.flaggedName}>{item.item_name ?? item.title ?? 'Item'}</Text>
                  <Text style={styles.flaggedMeta}>
                    {item.store ?? ''} · {item.flag_count ?? 0} flags
                  </Text>
                </View>
                <View style={styles.flaggedActions}>
                  <TouchableOpacity
                    style={styles.clearFlagBtn}
                    onPress={() => clearFlags(id)}
                    testID={`clear-flags-${id}`}
                  >
                    <Text style={styles.clearFlagText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteFlagBtn}
                    onPress={() => deleteItem(id)}
                    testID={`delete-flagged-${id}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={C.error} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No flagged items.</Text>}
        />
      )}
    </View>
  );
};

// ─── Stores Tab ───────────────────────────────────────────────────────────────
const StoresTab: React.FC<{ token: string }> = ({ token }) => {
  const [stores,  setStores]  = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch('/api/admin/stores', token)
      .then(d => setStores(d.stores ?? d))
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const setStatus = async (storeId: string, status: 'approved' | 'rejected') => {
    try {
      await adminFetch(`/api/admin/stores/${storeId}`, token, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setStores(prev => prev.map(s => (s._id ?? s.id) === storeId ? { ...s, status } : s));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} />;

  return (
    <FlatList
      data={stores}
      keyExtractor={s => s._id ?? s.id}
      contentContainerStyle={styles.tabContent}
      renderItem={({ item: s }) => {
        const id = s._id ?? s.id;
        return (
          <View style={styles.storeRow}>
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{s.name}</Text>
              <Text style={styles.storeMeta}>{s.region ?? ''} · {s.status ?? 'pending'}</Text>
            </View>
            <View style={styles.storeActions}>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => setStatus(id, 'approved')}
                testID={`approve-store-${id}`}
              >
                <Text style={styles.approveBtnText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => setStatus(id, 'rejected')}
                testID={`reject-store-${id}`}
              >
                <Text style={styles.rejectBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.emptyText}>No stores to manage.</Text>}
    />
  );
};

// ─── Banners Tab ──────────────────────────────────────────────────────────────
const BannersTab: React.FC<{ token: string }> = ({ token }) => {
  const [banners, setBanners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [title,   setTitle]   = useState('');
  const [url,     setUrl]     = useState('');
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    adminFetch('/api/admin/banners', token)
      .then(d => setBanners(d.banners ?? d))
      .catch(e => Alert.alert('Error', e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createBanner = async () => {
    if (!title.trim()) { Alert.alert('Title required'); return; }
    setSaving(true);
    try {
      const newB = await adminFetch('/api/admin/banners', token, {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), url: url.trim() }),
      });
      setBanners(prev => [...prev, newB]);
      setTitle('');
      setUrl('');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteBanner = async (id: string) => {
    try {
      await adminFetch(`/api/admin/banners/${id}`, token, { method: 'DELETE' });
      setBanners(prev => prev.filter(b => (b._id ?? b.id) !== id));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) return <ActivityIndicator style={styles.centred} color={C.primary} />;

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.tabHeading}>Create Banner</Text>
      <TextInput
        style={styles.searchBox}
        placeholder="Banner title…"
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={C.textSec}
        testID="banner-title-input"
      />
      <TextInput
        style={[styles.searchBox, { marginTop: 8 }]}
        placeholder="Link URL (optional)"
        value={url}
        onChangeText={setUrl}
        placeholderTextColor={C.textSec}
        testID="banner-url-input"
      />
      <TouchableOpacity
        style={[styles.createBannerBtn, saving && { opacity: 0.6 }]}
        onPress={createBanner}
        disabled={saving}
        testID="create-banner-btn"
      >
        {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.createBannerText}>Create Banner</Text>}
      </TouchableOpacity>

      <Text style={[styles.tabHeading, { marginTop: 20 }]}>Active Banners</Text>
      {banners.map(b => {
        const id = b._id ?? b.id;
        return (
          <View key={id} style={styles.bannerRow}>
            <View style={styles.bannerInfo}>
              <Text style={styles.bannerTitle}>{b.title}</Text>
              {b.url ? <Text style={styles.bannerUrl} numberOfLines={1}>{b.url}</Text> : null}
            </View>
            <TouchableOpacity
              onPress={() => deleteBanner(id)}
              testID={`delete-banner-${id}`}
            >
              <Ionicons name="trash-outline" size={18} color={C.error} />
            </TouchableOpacity>
          </View>
        );
      })}
      {banners.length === 0 && <Text style={styles.emptyText}>No banners yet.</Text>}
    </ScrollView>
  );
};

// ─── Main Admin Screen ────────────────────────────────────────────────────────
export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const [token,   setToken]   = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab,     setTab]     = useState<AdminTab>('overview');

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('auth_token');
      if (!t) { router.replace('/auth/login'); return; }
      setToken(t);
      try {
        const data = await adminFetch('/api/admin/check', t);
        if (!data.is_admin) {
          Alert.alert('Access denied', 'Admin only.');
          router.back();
        } else {
          setIsAdmin(true);
        }
      } catch {
        router.back();
      }
    })();
  }, []);

  if (isAdmin === null) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  const TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'grid-outline' },
    { key: 'users',    label: 'Users',    icon: 'people-outline' },
    { key: 'flagged',  label: 'Flagged',  icon: 'flag-outline' },
    { key: 'stores',   label: 'Stores',   icon: 'storefront-outline' },
    { key: 'banners',  label: 'Banners',  icon: 'megaphone-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.adminHeader}>
        <TouchableOpacity onPress={() => router.back()} testID="admin-back-btn">
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.adminHeaderTitle}>Admin Panel</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
            onPress={() => setTab(t.key)}
            testID={`admin-tab-${t.key}`}
          >
            <Ionicons name={t.icon as any} size={16} color={tab === t.key ? C.primary : C.textSec} />
            <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={[styles.tabPanel, { paddingBottom: insets.bottom }]}>
        {token && (
          <>
            {tab === 'overview' && <OverviewTab token={token} />}
            {tab === 'users'    && <UsersTab    token={token} />}
            {tab === 'flagged'  && <FlaggedTab  token={token} />}
            {tab === 'stores'   && <StoresTab   token={token} />}
            {tab === 'banners'  && <BannersTab  token={token} />}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  centred:       { marginTop: 40 },

  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  adminHeaderTitle: { fontSize: 17, fontWeight: '800', color: C.text },

  tabBar:        { maxHeight: 56, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBarContent: { paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10, gap: 6,
    borderRadius: 99, marginVertical: 8,
  },
  tabBtnActive:     { backgroundColor: C.primaryLight },
  tabBtnText:       { fontSize: 13, fontWeight: '600', color: C.textSec },
  tabBtnTextActive: { color: C.primary },

  tabPanel:  { flex: 1 },
  tabContent: { padding: 16, flexGrow: 1 },
  tabHeading: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: {
    width: '47%',
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: C.textSec },

  searchBox: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: 14,
    color: C.text,
    marginBottom: 12,
  },

  userRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  userAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 13, fontWeight: '800', color: C.primary },
  userInfo:       { flex: 1 },
  userName:       { fontSize: 14, fontWeight: '700', color: C.text },
  userEmail:      { fontSize: 11, color: C.textSec },
  userPoints:     { fontSize: 11, color: C.accentDark, fontWeight: '600' },
  userActions:    { gap: 4 },
  userActionBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 99, borderWidth: 1, borderColor: C.border,
  },
  userActionBtnActive: { backgroundColor: C.primaryLight, borderColor: C.primary },
  userActionBtnDanger: { backgroundColor: '#FEE2E2', borderColor: C.error },
  userActionBtnText:   { fontSize: 11, fontWeight: '700', color: C.text },

  flaggedRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  flaggedInfo: { flex: 1 },
  flaggedName: { fontSize: 14, fontWeight: '700', color: C.text },
  flaggedMeta: { fontSize: 11, color: C.textSec },
  flaggedActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  clearFlagBtn: {
    backgroundColor: C.primaryLight,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
  },
  clearFlagText: { fontSize: 12, fontWeight: '700', color: C.primary },
  deleteFlagBtn: { padding: 6 },

  toggleRow:          { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggleBtn:          { flex: 1, paddingVertical: 10, borderRadius: 99, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  toggleBtnActive:    { backgroundColor: C.primaryLight, borderColor: C.primary },
  toggleBtnText:      { fontSize: 13, fontWeight: '600', color: C.textSec },
  toggleBtnTextActive: { color: C.primary },

  storeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  storeInfo:    { flex: 1 },
  storeName:    { fontSize: 14, fontWeight: '700', color: C.text },
  storeMeta:    { fontSize: 11, color: C.textSec },
  storeActions: { flexDirection: 'row', gap: 8 },
  approveBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { color: C.success, fontSize: 16, fontWeight: '800' },
  rejectBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: C.error, fontSize: 16, fontWeight: '800' },

  createBannerBtn: {
    backgroundColor: C.primary, borderRadius: 99,
    paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
  createBannerText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  bannerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  bannerInfo:  { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  bannerUrl:   { fontSize: 11, color: C.textSec },

  emptyText: { fontSize: 13, color: C.textSec, textAlign: 'center', paddingVertical: 24 },
});
