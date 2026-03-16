import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, Shadows, TT_REGIONS } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function CommunityScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [region, setRegion] = useState('');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const [lbRes, statsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/leaderboard?region=${encodeURIComponent(region)}`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`${BACKEND_URL}/api/community/stats`, { headers }).then(r => r.ok ? r.json() : null),
      ]);
      setLeaderboard(lbRes || []);
      if (statsRes) setStats(statsRes);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, region]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const getMedalColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return colors.textSecondary;
  };

  const s = createStyles(colors);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} testID="community-screen">
      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={s.title}>Community</Text>
        <Text style={s.subtitle}>Top Savvy Shoppers of T&T</Text>

        {/* Stats Banner */}
        {stats && (
          <View style={s.statsRow}>
            <View style={[s.statCard, { backgroundColor: colors.primary }]}>
              <Ionicons name="people" size={24} color={colors.primaryForeground} />
              <Text style={[s.statValue, { color: colors.primaryForeground }]}>{stats.total_users}</Text>
              <Text style={[s.statLabel, { color: colors.primaryForeground + 'BB' }]}>Shoppers</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: colors.secondary }]}>
              <Ionicons name="document-text" size={24} color={colors.secondaryForeground} />
              <Text style={[s.statValue, { color: colors.secondaryForeground }]}>{stats.total_reports}</Text>
              <Text style={[s.statLabel, { color: colors.secondaryForeground + 'BB' }]}>Price Reports</Text>
            </View>
          </View>
        )}

        {/* Region Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.regionScroll}>
          <TouchableOpacity
            testID="region-all-btn"
            style={[s.regionChip, !region && { backgroundColor: colors.primary }]}
            onPress={() => setRegion('')}
          >
            <Text style={[s.regionChipText, !region && { color: colors.primaryForeground }]}>All</Text>
          </TouchableOpacity>
          {TT_REGIONS.map((r) => (
            <TouchableOpacity
              key={r}
              testID={`region-filter-${r.toLowerCase()}`}
              style={[s.regionChip, region === r && { backgroundColor: colors.primary }]}
              onPress={() => setRegion(r)}
            >
              <Text style={[s.regionChipText, region === r && { color: colors.primaryForeground }]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Leaderboard */}
        <View style={s.leaderboardCard}>
          <View style={s.leaderboardHeader}>
            <Ionicons name="trophy" size={22} color={colors.accent} />
            <Text style={s.leaderboardTitle}>Leaderboard</Text>
            <Text style={s.leaderboardRegion}>{region || 'All Regions'}</Text>
          </View>

          {leaderboard.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
              <Text style={s.emptyText}>No shoppers in this region yet</Text>
            </View>
          ) : (
            leaderboard.map((user, i) => (
              <View key={i} style={s.leaderRow} testID={`leaderboard-row-${i}`}>
                <View style={[s.rankBadge, { backgroundColor: getMedalColor(user.rank) + '25' }]}>
                  {user.rank <= 3 ? (
                    <Ionicons name="medal" size={20} color={getMedalColor(user.rank)} />
                  ) : (
                    <Text style={[s.rankText, { color: colors.textSecondary }]}>{user.rank}</Text>
                  )}
                </View>
                <View style={s.leaderInfo}>
                  <Text style={s.leaderName}>{user.name}</Text>
                  <Text style={s.leaderRegion}>{user.region}</Text>
                </View>
                <View style={s.pointsCol}>
                  <Text style={s.leaderPoints}>{user.points}</Text>
                  <Text style={s.pointsLabel}>pts</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Recent Community Updates */}
        {stats?.recent_reports?.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Recent Updates</Text>
            {stats.recent_reports.slice(0, 5).map((report: any, i: number) => (
              <View key={i} style={s.updateCard}>
                <View style={s.updateIcon}>
                  <Ionicons name="pricetag" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.updateProduct}>{report.product_name}</Text>
                  <Text style={s.updateDetail}>{report.store_name} - ${report.price?.toFixed(2)} TTD</Text>
                </View>
                <Text style={s.updateTime}>{new Date(report.created_at).toLocaleDateString()}</Text>
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
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: Spacing.l },
  statsRow: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.l },
  statCard: {
    flex: 1, borderRadius: Radius.l, padding: Spacing.m,
    alignItems: 'center', ...Shadows.card,
  },
  statValue: { fontSize: 28, fontWeight: '800', marginTop: Spacing.xs },
  statLabel: { fontSize: 12, fontWeight: '600' },
  regionScroll: { marginBottom: Spacing.l },
  regionChip: {
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, backgroundColor: colors.surface,
    marginRight: Spacing.s, ...Shadows.card,
  },
  regionChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  leaderboardCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl,
    padding: Spacing.l, marginBottom: Spacing.l, ...Shadows.card,
  },
  leaderboardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginBottom: Spacing.m },
  leaderboardTitle: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
  leaderboardRegion: { fontSize: 13, color: colors.textSecondary },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: Spacing.s },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.m, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rankBadge: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.m,
  },
  rankText: { fontSize: 16, fontWeight: '800' },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 15, fontWeight: '700', color: colors.text },
  leaderRegion: { fontSize: 12, color: colors.textSecondary },
  pointsCol: { alignItems: 'flex-end' },
  leaderPoints: { fontSize: 18, fontWeight: '800', color: colors.accent },
  pointsLabel: { fontSize: 11, color: colors.textSecondary },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  updateCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.s, ...Shadows.card,
  },
  updateIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '18', justifyContent: 'center', alignItems: 'center',
  },
  updateProduct: { fontSize: 14, fontWeight: '600', color: colors.text },
  updateDetail: { fontSize: 12, color: colors.textSecondary },
  updateTime: { fontSize: 11, color: colors.textSecondary },
});
