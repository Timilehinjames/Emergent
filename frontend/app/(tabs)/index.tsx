import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, Shadows } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function HomeScreen() {
  const { user, token } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [savings, setSavings] = useState<any>(null);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [savingsRes, reportsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/savings-summary`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`${BACKEND_URL}/api/price-reports/recent?limit=5`, { headers }).then(r => r.ok ? r.json() : []),
      ]);
      if (savingsRes) setSavings(savingsRes);
      setRecentReports(reportsRes || []);
    } catch (e) {
      console.log('Fetch error:', e);
    } finally {
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
            <Text style={s.subGreeting}>{user?.region} Region</Text>
          </View>
          <View style={s.pointsBadge}>
            <Ionicons name="star" size={16} color={colors.accent} />
            <Text style={s.pointsText}>{user?.points || 0}</Text>
          </View>
        </View>

        {/* Savings Summary Bento Grid */}
        <View style={s.bentoGrid}>
          <View style={[s.bentoLarge, { backgroundColor: colors.primary }]}>
            <Ionicons name="wallet" size={28} color={colors.primaryForeground} />
            <Text style={[s.bentoLabel, { color: colors.primaryForeground + 'CC' }]}>This Month Saved</Text>
            <Text style={[s.bentoValue, { color: colors.primaryForeground }]}>
              ${savings?.this_month_savings?.toFixed(2) || '0.00'} TTD
            </Text>
          </View>
          <View style={s.bentoColumn}>
            <View style={[s.bentoSmall, { backgroundColor: colors.secondary }]}>
              <Ionicons name="document-text" size={22} color={colors.secondaryForeground} />
              <Text style={[s.bentoSmLabel, { color: colors.secondaryForeground + 'CC' }]}>Reports</Text>
              <Text style={[s.bentoSmValue, { color: colors.secondaryForeground }]}>{savings?.total_reports || 0}</Text>
            </View>
            <View style={[s.bentoSmall, { backgroundColor: colors.accent }]}>
              <Ionicons name="trending-up" size={22} color={colors.accentForeground} />
              <Text style={[s.bentoSmLabel, { color: colors.accentForeground + 'CC' }]}>Total Saved</Text>
              <Text style={[s.bentoSmValue, { color: colors.accentForeground }]}>${savings?.estimated_savings_ttd?.toFixed(0) || '0'}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.quickActions}>
          {[
            { icon: 'swap-horizontal', label: 'Compare\nPrices', color: colors.primary, route: '/(tabs)/compare' },
            { icon: 'scan', label: 'Quick\nScan', color: colors.secondary, route: '/(tabs)/scan' },
            { icon: 'car', label: 'Trip\nPlanner', color: colors.accent, route: '/(tabs)/compare' },
            { icon: 'people', label: 'Leader\nboard', color: '#9C27B0', route: '/(tabs)/community' },
          ].map((action, i) => (
            <TouchableOpacity
              key={i}
              testID={`quick-action-${i}`}
              style={s.quickActionBtn}
              onPress={() => router.push(action.route as any)}
            >
              <View style={[s.quickActionIcon, { backgroundColor: action.color + '18' }]}>
                <Ionicons name={action.icon as any} size={24} color={action.color} />
              </View>
              <Text style={s.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Community Updates */}
        <Text style={s.sectionTitle}>Recent Price Updates</Text>
        {recentReports.length === 0 ? (
          <View style={s.emptyCard}>
            <Ionicons name="newspaper-outline" size={40} color={colors.textSecondary} />
            <Text style={s.emptyText}>No recent price updates yet</Text>
            <Text style={s.emptySubText}>Be the first to report a price!</Text>
          </View>
        ) : (
          recentReports.map((report, i) => (
            <View key={i} style={s.reportCard} testID={`recent-report-${i}`}>
              <View style={s.reportRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.reportProduct}>{report.product_name}</Text>
                  <Text style={s.reportStore}>{report.store_name}</Text>
                </View>
                <View style={s.reportPriceBox}>
                  <Text style={s.reportPrice}>${report.price?.toFixed(2)}</Text>
                  <Text style={s.reportUnit}>{report.unit_price ? `$${report.unit_price}/${report.unit}` : ''}</Text>
                </View>
              </View>
              <View style={s.reportFooter}>
                <Text style={s.reportReporter}>by {report.reporter_name}</Text>
                <Text style={s.reportTime}>{new Date(report.created_at).toLocaleDateString()}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.l },
  greeting: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subGreeting: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  pointsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.full, ...Shadows.card,
  },
  pointsText: { fontSize: 16, fontWeight: '700', color: colors.accent },
  bentoGrid: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.l },
  bentoLarge: {
    flex: 1.2, borderRadius: Radius.xl, padding: Spacing.l,
    justifyContent: 'space-between', minHeight: 160, ...Shadows.card,
  },
  bentoColumn: { flex: 1, gap: Spacing.m },
  bentoSmall: {
    flex: 1, borderRadius: Radius.l, padding: Spacing.m,
    justifyContent: 'space-between', ...Shadows.card,
  },
  bentoLabel: { fontSize: 13, fontWeight: '500', marginTop: Spacing.s },
  bentoValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  bentoSmLabel: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  bentoSmValue: { fontSize: 20, fontWeight: '800' },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  quickActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.l },
  quickActionBtn: { alignItems: 'center', width: '22%' },
  quickActionIcon: {
    width: 56, height: 56, borderRadius: Radius.l,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.xs,
  },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', lineHeight: 14 },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl,
    padding: Spacing.xl, alignItems: 'center', ...Shadows.card,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.text, marginTop: Spacing.m },
  emptySubText: { fontSize: 14, color: colors.textSecondary, marginTop: Spacing.xs },
  reportCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.m, ...Shadows.card,
  },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  reportProduct: { fontSize: 15, fontWeight: '700', color: colors.text },
  reportStore: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  reportPriceBox: { alignItems: 'flex-end' },
  reportPrice: { fontSize: 18, fontWeight: '800', color: colors.primary },
  reportUnit: { fontSize: 11, color: colors.textSecondary },
  reportFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: Spacing.s, paddingTop: Spacing.s, borderTopWidth: 1, borderTopColor: colors.border,
  },
  reportReporter: { fontSize: 12, color: colors.textSecondary },
  reportTime: { fontSize: 12, color: colors.textSecondary },
});
