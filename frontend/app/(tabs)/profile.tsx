import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  RefreshControl, Switch, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, Shadows, TT_REGIONS } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ProfileScreen() {
  const { user, token, logout, refreshUser } = useAuth();
  const { colors, mode, toggleTheme } = useTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPriceSmart, setIsPriceSmart] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('');

  const fetchProfile = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/profile`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setProfile(data);
        setIsPriceSmart(data.is_pricesmart_member || false);
        setSelectedRegion(data.region || 'North');
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const updateProfile = async (field: string, value: any) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      await fetch(`${BACKEND_URL}/api/profile`, {
        method: 'PUT', headers,
        body: JSON.stringify({ [field]: value }),
      });
      await refreshUser();
    } catch {}
  };

  const togglePriceSmart = async (value: boolean) => {
    setIsPriceSmart(value);
    await updateProfile('is_pricesmart_member', value);
  };

  const changeRegion = async (r: string) => {
    setSelectedRegion(r);
    await updateProfile('region', r);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); router.replace('/'); } },
    ]);
  };

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const s = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} testID="profile-screen">
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Profile Header */}
        <View style={s.profileHeader}>
          <View style={s.avatarContainer}>
            <Text style={s.avatarText}>
              {(profile?.name || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={s.profileName}>{profile?.name || 'User'}</Text>
          <Text style={s.profileEmail}>{profile?.email || ''}</Text>
          <View style={s.profileBadges}>
            <View style={[s.badge, { backgroundColor: colors.accent + '20' }]}>
              <Ionicons name="star" size={14} color={colors.accent} />
              <Text style={[s.badgeText, { color: colors.accent }]}>{profile?.points || 0} Points</Text>
            </View>
            <View style={[s.badge, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={[s.badgeText, { color: colors.primary }]}>{profile?.region || 'North'}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: colors.secondary + '20' }]}>
              <Ionicons name="document-text" size={14} color={colors.secondary} />
              <Text style={[s.badgeText, { color: colors.secondary }]}>{profile?.report_count || 0} Reports</Text>
            </View>
          </View>
        </View>

        {/* PriceSmart Toggle */}
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <View style={[s.settingIcon, { backgroundColor: '#E91E63' + '18' }]}>
              <Ionicons name="card" size={20} color="#E91E63" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>PriceSmart Member</Text>
              <Text style={s.settingDesc}>Show PriceSmart exclusive prices</Text>
            </View>
            <Switch
              testID="pricesmart-toggle"
              value={isPriceSmart}
              onValueChange={togglePriceSmart}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={isPriceSmart ? colors.primary : colors.textSecondary}
            />
          </View>
        </View>

        {/* Region Selector */}
        <View style={s.settingCard}>
          <Text style={s.settingCardTitle}>Your Region</Text>
          <Text style={s.settingCardDesc}>Get prices & leaderboard for your area</Text>
          <View style={s.regionGrid}>
            {TT_REGIONS.map((r) => (
              <TouchableOpacity
                key={r}
                testID={`profile-region-${r.toLowerCase()}`}
                style={[s.regionBtn, selectedRegion === r && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => changeRegion(r)}
              >
                <Ionicons
                  name={r === 'Tobago' ? 'boat' : 'location'}
                  size={18}
                  color={selectedRegion === r ? colors.primaryForeground : colors.textSecondary}
                />
                <Text style={[s.regionBtnText, selectedRegion === r && { color: colors.primaryForeground }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Theme Toggle */}
        <View style={s.settingCard}>
          <View style={s.settingRow}>
            <View style={[s.settingIcon, { backgroundColor: colors.accent + '18' }]}>
              <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Dark Mode</Text>
              <Text style={s.settingDesc}>Toggle dark/light theme</Text>
            </View>
            <Switch
              testID="theme-toggle"
              value={mode === 'dark'}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={mode === 'dark' ? colors.primary : colors.textSecondary}
            />
          </View>
        </View>

        {/* Points & Rewards Info */}
        <View style={s.settingCard}>
          <Text style={s.settingCardTitle}>Points & Rewards</Text>
          <View style={s.rewardRow}>
            <Ionicons name="camera" size={18} color={colors.secondary} />
            <Text style={s.rewardText}>Photo price report: <Text style={s.rewardPoints}>+10 pts</Text></Text>
          </View>
          <View style={s.rewardRow}>
            <Ionicons name="create" size={18} color={colors.primary} />
            <Text style={s.rewardText}>Manual price report: <Text style={s.rewardPoints}>+5 pts</Text></Text>
          </View>
          <View style={s.rewardRow}>
            <Ionicons name="gift" size={18} color={colors.accent} />
            <Text style={s.rewardText}>Redeem for mobile top-ups (Coming Soon)</Text>
          </View>
          <View style={s.rewardRow}>
            <Ionicons name="ticket" size={18} color="#E91E63" />
            <Text style={s.rewardText}>Digital coupons (Coming Soon)</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity testID="logout-btn" style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={s.version}>TriniSaver v1.0 - Made for T&T</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  profileHeader: { alignItems: 'center', paddingVertical: Spacing.xl },
  avatarContainer: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.m,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: colors.primaryForeground },
  profileName: { fontSize: 24, fontWeight: '800', color: colors.text },
  profileEmail: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  profileBadges: { flexDirection: 'row', gap: Spacing.s, marginTop: Spacing.m, flexWrap: 'wrap', justifyContent: 'center' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.m, paddingVertical: 6, borderRadius: Radius.full,
  },
  badgeText: { fontSize: 13, fontWeight: '600' },
  settingCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl,
    padding: Spacing.l, marginBottom: Spacing.m, ...Shadows.card,
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  settingIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  settingLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  settingDesc: { fontSize: 13, color: colors.textSecondary },
  settingCardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
  settingCardDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: Spacing.m },
  regionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  regionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  regionBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingVertical: 8 },
  rewardText: { fontSize: 14, color: colors.text, flex: 1 },
  rewardPoints: { fontWeight: '700', color: colors.secondary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.s, paddingVertical: Spacing.m, marginTop: Spacing.m,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: colors.error },
  version: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.l },
});
