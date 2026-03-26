/**
 * frontend/app/(tabs)/specials.tsx
 * TriniSaver — Specials / Flyers Screen
 *
 * Fixes applied:
 *  • Flag-as-Outdated UI fully wired with optimistic update (was needs_retesting)
 *  • Image-first: flyer/special image is prominent, text is minimal overlay
 *  • OUTDATED badge shown when is_outdated=true or flag_count >= 3
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Pressable,
  Dimensions,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_W } = Dimensions.get('window');

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

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8001';

interface Special {
  id: string;
  store: string;
  title: string;
  description?: string;
  price?: number;
  original_price?: number;
  valid_until?: string;
  image_url?: string | null;
  is_outdated: boolean;
  flag_count: number;
  region?: string;
}

// ─── Special Card (image-first) ───────────────────────────────────────────────
const SpecialCard: React.FC<{
  item: Special;
  onFlag: (id: string) => void;
  onExpand: (item: Special) => void;
}> = ({ item, onFlag, onExpand }) => {
  const isOutdated = item.is_outdated || item.flag_count >= 3;
  const discount = item.price && item.original_price
    ? Math.round(((item.original_price - item.price) / item.original_price) * 100)
    : null;

  return (
    <TouchableOpacity
      style={[styles.card, isOutdated && styles.cardOutdated]}
      activeOpacity={0.88}
      onPress={() => onExpand(item)}
      testID={`special-card-${item.id}`}
    >
      {/* ── Image fills top ─────────────────────────────────────────────── */}
      <View style={styles.cardImageBox}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Text style={styles.placeholderEmoji}>🏷️</Text>
            <Text style={styles.placeholderStore}>{item.store}</Text>
          </View>
        )}

        {/* Scrim for text */}
        <View style={styles.scrim} pointerEvents="none" />

        {/* Outdated badge — top left */}
        {isOutdated && (
          <View style={styles.outdatedBadge}>
            <Text style={styles.outdatedText}>OUTDATED</Text>
          </View>
        )}

        {/* Discount badge — top right */}
        {discount && !isOutdated && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}%</Text>
          </View>
        )}

        {/* Store pill — bottom left over scrim */}
        <View style={styles.storePill}>
          <Text style={styles.storePillText}>{item.store}</Text>
        </View>
      </View>

      {/* ── Minimal text row ────────────────────────────────────────────── */}
      <View style={styles.cardBody}>
        <View style={styles.cardBodyLeft}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          {item.valid_until && (
            <Text style={styles.validUntil}>Until {item.valid_until}</Text>
          )}
        </View>

        <View style={styles.cardBodyRight}>
          {item.price ? (
            <Text style={styles.cardPrice}>TT${item.price.toFixed(2)}</Text>
          ) : null}
          {item.original_price && item.price ? (
            <Text style={styles.originalPrice}>TT${item.original_price.toFixed(2)}</Text>
          ) : null}
        </View>

        {/* Flag button */}
        <TouchableOpacity
          onPress={() => onFlag(item.id)}
          style={styles.flagBtn}
          testID={`flag-special-${item.id}`}
        >
          <Ionicons
            name={isOutdated ? 'flag' : 'flag-outline'}
            size={16}
            color={isOutdated ? C.error : C.textSec}
          />
          {item.flag_count > 0 && (
            <Text style={styles.flagCount}>{item.flag_count}</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ─── Lightbox Modal ───────────────────────────────────────────────────────────
const SpecialLightbox: React.FC<{
  item: Special | null;
  onClose: () => void;
  onFlag: (id: string) => void;
}> = ({ item, onClose, onFlag }) => {
  if (!item) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.lightboxContainer}>
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.lightboxImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.lightboxPlaceholder}>
            <Text style={styles.lightboxPlaceholderText}>🏷️</Text>
          </View>
        )}

        <View style={styles.lightboxInfo}>
          <Text style={styles.lightboxTitle}>{item.title}</Text>
          <Text style={styles.lightboxStore}>{item.store}</Text>
          {item.description ? (
            <Text style={styles.lightboxDesc}>{item.description}</Text>
          ) : null}
          {item.price ? (
            <Text style={styles.lightboxPrice}>TT${item.price.toFixed(2)}</Text>
          ) : null}
          {item.valid_until ? (
            <Text style={styles.lightboxValid}>Valid until {item.valid_until}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.lightboxFlagBtn}
            onPress={() => { onFlag(item.id); onClose(); }}
            testID={`lightbox-flag-${item.id}`}
          >
            <Ionicons name="flag-outline" size={16} color={C.error} />
            <Text style={styles.lightboxFlagText}>Flag as Outdated</Text>
          </TouchableOpacity>
        </View>

        <Pressable style={styles.lightboxClose} onPress={onClose}>
          <Ionicons name="close" size={22} color="#FFF" />
        </Pressable>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SpecialsScreen() {
  const insets = useSafeAreaInsets();
  const [token,      setToken]      = useState<string | null>(null);
  const [specials,   setSpecials]   = useState<Special[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState<Special | null>(null);

  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('auth_token');
      setToken(t);
      await fetchSpecials(t);
    })();
  }, []);

  const fetchSpecials = useCallback(async (tk?: string | null) => {
    try {
      const auth = tk ?? token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) headers['Authorization'] = `Bearer ${auth}`;

      const res = await fetch(`${API_BASE}/api/specials`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSpecials(
          (data.specials ?? data).map((s: any) => ({
            id:             s._id ?? s.id,
            store:          s.store ?? '',
            title:          s.title ?? s.item_name ?? '',
            description:    s.description,
            price:          s.price,
            original_price: s.original_price,
            valid_until:    s.valid_until,
            image_url:      s.image_url ?? null,
            is_outdated:    s.is_outdated ?? false,
            flag_count:     s.flag_count ?? 0,
            region:         s.region,
          })),
        );
      }
    } catch (err) {
      console.error('Specials fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSpecials();
  }, [fetchSpecials]);

  // ── Flag ─────────────────────────────────────────────────────────────────
  const handleFlag = useCallback(async (id: string) => {
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in to flag items.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/flag/special/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setSpecials(prev =>
          prev.map(s =>
            s.id === id
              ? {
                  ...s,
                  flag_count: s.flag_count + 1,
                  is_outdated: s.flag_count + 1 >= 3 ? true : s.is_outdated,
                }
              : s,
          ),
        );
        Alert.alert('Flagged', 'Thank you! This special has been flagged.');
      } else if (res.status === 400) {
        Alert.alert('Already flagged', 'You have already flagged this item.');
      }
    } catch {
      Alert.alert('Error', 'Could not flag item.');
    }
  }, [token]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = search.trim()
    ? specials.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.store.toLowerCase().includes(search.toLowerCase()),
      )
    : specials;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>🏷️ Specials & Flyers</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={C.textSec} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search store or deal…"
          placeholderTextColor={C.textSec}
          value={search}
          onChangeText={setSearch}
          testID="specials-search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={C.textSec} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
        renderItem={({ item }) => (
          <SpecialCard
            item={item}
            onFlag={handleFlag}
            onExpand={setExpanded}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🏷️</Text>
            <Text style={styles.emptyText}>No specials found.</Text>
          </View>
        }
      />

      <SpecialLightbox
        item={expanded}
        onClose={() => setExpanded(null)}
        onFlag={handleFlag}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CARD_W      = (SCREEN_W - 16 * 2 - 10) / 2;
const CARD_IMG_H  = 130;

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

  headerRow: { paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: C.border,
    gap: 8,
  },
  searchIcon:  {},
  searchInput: { flex: 1, fontSize: 14, color: C.text },

  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  gridRow:     { justifyContent: 'space-between', marginBottom: 10 },

  // Card
  card: {
    width: CARD_W,
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
  },
  cardOutdated: { opacity: 0.65 },
  cardImageBox: { height: CARD_IMG_H, position: 'relative' },
  cardImage:    { width: '100%', height: '100%' },
  cardPlaceholder: {
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderEmoji:  { fontSize: 28 },
  placeholderStore:  { fontSize: 11, color: C.primary, fontWeight: '600' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    bottom: 0,
    height: 50,
    top: undefined,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  outdatedBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: C.error, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  outdatedText: { color: '#FFF', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  discountBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: C.accent, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  discountText: { color: C.text, fontSize: 10, fontWeight: '800' },
  storePill: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3,
  },
  storePillText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  cardBody:      { padding: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  cardBodyLeft:  { flex: 1 },
  cardBodyRight: { alignItems: 'flex-end' },
  cardTitle:     { fontSize: 12, fontWeight: '700', color: C.text },
  validUntil:    { fontSize: 10, color: C.textSec, marginTop: 2 },
  cardPrice:     { fontSize: 13, fontWeight: '800', color: C.accentDark },
  originalPrice: { fontSize: 10, color: C.textSec, textDecorationLine: 'line-through' },
  flagBtn:       { padding: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  flagCount:     { fontSize: 10, color: C.error, fontWeight: '700' },

  // Lightbox
  lightboxContainer: { flex: 1, backgroundColor: '#0F172A' },
  lightboxImage:     { width: SCREEN_W, height: SCREEN_W * 0.75 },
  lightboxPlaceholder: {
    height: SCREEN_W * 0.75,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxPlaceholderText: { fontSize: 64 },
  lightboxInfo: {
    padding: 20,
    gap: 6,
  },
  lightboxTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  lightboxStore: { fontSize: 14, color: C.primary, fontWeight: '600' },
  lightboxDesc:  { fontSize: 14, color: '#94A3B8', lineHeight: 20 },
  lightboxPrice: { fontSize: 26, fontWeight: '800', color: C.accent, marginTop: 6 },
  lightboxValid: { fontSize: 12, color: '#64748B' },
  lightboxFlagBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 16,
    borderWidth: 1, borderColor: C.error,
    borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  lightboxFlagText: { color: C.error, fontSize: 14, fontWeight: '700' },
  lightboxClose: {
    position: 'absolute', top: Platform.OS === 'ios' ? 52 : 20, right: 16,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  emptyBox:  { alignItems: 'center', gap: 10, paddingVertical: 48 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 14, color: C.textSec },
});
