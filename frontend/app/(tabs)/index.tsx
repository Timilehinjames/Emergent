import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const { user, token } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [savings, setSavings] = useState<any>(null);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [myLists, setMyLists] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const [savingsRes, reportsRes, listsRes, bannersRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/savings-summary`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BACKEND_URL}/api/price-reports/recent?limit=3`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${BACKEND_URL}/api/shopping-lists`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${BACKEND_URL}/api/banners`).then(r => r.ok ? r.json() : []),
      ]);
      if (savingsRes) setSavings(savingsRes);
      setRecentReports(reportsRes || []);
      setMyLists(listsRes || []);
      setBanners(bannersRes || []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const s = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} testID="home-dashboard">
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>Hello, {user?.name?.split(' ')[0] || 'Shopper'}</Text>
            <Text style={s.subGreeting}>{user?.region}</Text>
          </View>
          <View style={s.pointsBadge}>
            <Ionicons name="star" size={16} color={colors.accent} />
            <Text style={s.pointsText}>{user?.points || 0} pts</Text>
          </View>
        </View>

        {/* CTA — Start Shopping List */}
        <TouchableOpacity
          testID="start-shopping-list-btn"
          style={s.ctaCard}
          onPress={() => router.push('/shopping-list')}
          activeOpacity={0.85}
        >
          <View style={s.ctaIconWrap}>
            <Ionicons name="list" size={32} color={colors.primaryForeground} />
          </View>
          <View style={s.ctaTextWrap}>
            <Text style={s.ctaTitle}>Start Shopping List</Text>
            <Text style={s.ctaDesc}>Build your list, compare prices & save</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={colors.primaryForeground} />
        </TouchableOpacity>

        {/* Saved Lists */}
        {myLists.length > 0 && (
          <View style={s.savedSection}>
            <Text style={s.sectionTitle}>My Lists</Text>
            {myLists.slice(0, 3).map((list, i) => (
              <TouchableOpacity
                key={list.list_id}
                testID={`saved-list-${i}`}
                style={s.savedListCard}
                onPress={() => router.push(`/shopping-list?listId=${list.list_id}`)}
              >
                <View style={s.savedListIcon}>
                  <Ionicons name="document-text" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.savedListName}>{list.name}</Text>
                  <Text style={s.savedListCount}>{list.items?.length || 0} items</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Ad Banner */}
        {banners.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled style={s.bannerScroll}>
            {banners.map((banner, i) => (
              <TouchableOpacity
                key={banner.banner_id}
                testID={`ad-banner-${i}`}
                style={[s.bannerCard, { backgroundColor: banner.bg_color }]}
                activeOpacity={0.9}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.bannerLabel, { color: banner.text_color + '88' }]}>SPONSORED</Text>
                  <Text style={[s.bannerTitle, { color: banner.text_color }]}>{banner.title}</Text>
                  <Text style={[s.bannerSubtitle, { color: banner.text_color + 'CC' }]}>{banner.subtitle}</Text>
                </View>
                <View style={[s.bannerCta, { borderColor: banner.text_color + '55' }]}>
                  <Text style={[s.bannerCtaText, { color: banner.text_color }]}>{banner.cta_text}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Savings at a Glance */}
        <View style={s.savingsRow}>
          <View style={[s.savingsCard, { backgroundColor: colors.primary }]}>
            <Ionicons name="wallet" size={22} color={colors.primaryForeground} />
            <Text style={[s.savingsValue, { color: colors.primaryForeground }]}>
              ${savings?.this_month_savings?.toFixed(0) || '0'}
            </Text>
            <Text style={[s.savingsLabel, { color: colors.primaryForeground + 'BB' }]}>Saved this month</Text>
          </View>
          <View style={[s.savingsCard, { backgroundColor: colors.secondary }]}>
            <Ionicons name="document-text" size={22} color={colors.secondaryForeground} />
            <Text style={[s.savingsValue, { color: colors.secondaryForeground }]}>
              {savings?.total_reports || 0}
            </Text>
            <Text style={[s.savingsLabel, { color: colors.secondaryForeground + 'BB' }]}>Price reports</Text>
          </View>
        </View>

        {/* Quick Actions — just the essentials */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsGrid}>
          {[
            { icon: 'swap-horizontal', label: 'Compare Prices', color: colors.primary, route: '/(tabs)/compare' },
            { icon: 'scan', label: 'Quick Scan', color: colors.secondary, route: '/(tabs)/scan' },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              testID={`quick-action-${i}`}
              style={s.actionCard}
              onPress={() => router.push(action.route as any)}
              activeOpacity={0.8}
            >
              <View style={[s.actionIcon, { backgroundColor: action.color + '18' }]}>
                <Ionicons name={action.icon as any} size={26} color={action.color} />
              </View>
              <Text style={s.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Price Updates — compact */}
        {recentReports.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Recent Updates</Text>
            {recentReports.map((report, i) => (
              <View key={i} style={s.reportRow} testID={`recent-report-${i}`}>
                <View style={s.reportDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.reportProduct}>{report.product_name}</Text>
                  <Text style={s.reportStore}>{report.store_name}</Text>
                </View>
                <Text style={s.reportPrice}>${report.price?.toFixed(2)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.l },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subGreeting: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  pointsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  pointsText: { fontSize: 15, fontWeight: '700', color: colors.accent },

  // CTA
  ctaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: Radius.xl,
    padding: Spacing.l, gap: Spacing.m, marginBottom: Spacing.l,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
  },
  ctaIconWrap: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  ctaTextWrap: { flex: 1 },
  ctaTitle: { fontSize: 20, fontWeight: '800', color: colors.primaryForeground },
  ctaDesc: { fontSize: 13, color: colors.primaryForeground + 'CC', marginTop: 2 },

  // Saved lists
  savedSection: { marginBottom: Spacing.l },
  savedListCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  savedListIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center',
  },
  savedListName: { fontSize: 15, fontWeight: '600', color: colors.text },
  savedListCount: { fontSize: 12, color: colors.textSecondary },

  // Savings
  savingsRow: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.l },
  savingsCard: {
    flex: 1, borderRadius: Radius.l, padding: Spacing.m, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  savingsValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  savingsLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  // Section
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },

  // Actions Grid
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.m, marginBottom: Spacing.l },
  actionCard: {
    width: '47%', backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  actionIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.s,
  },
  actionLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },

  // Recent reports
  reportRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    paddingVertical: Spacing.s, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  reportDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  reportProduct: { fontSize: 14, fontWeight: '600', color: colors.text },
  reportStore: { fontSize: 12, color: colors.textSecondary },
  reportPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },

  // Banner
  bannerScroll: { marginBottom: Spacing.l },
  bannerCard: {
    width: 300, borderRadius: Radius.l, padding: Spacing.m, marginRight: Spacing.m,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
  },
  bannerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  bannerSubtitle: { fontSize: 12, marginTop: 2 },
  bannerCta: { borderWidth: 1.5, borderRadius: Radius.m, paddingHorizontal: 12, paddingVertical: 6 },
  bannerCtaText: { fontSize: 12, fontWeight: '700' },
});
