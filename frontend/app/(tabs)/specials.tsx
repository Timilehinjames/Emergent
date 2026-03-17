import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl,
  ActivityIndicator, Alert, Image, TextInput, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, TT_REGIONS } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function SpecialsScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const [specials, setSpecials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [flyerImage, setFlyerImage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [flyerTitle, setFlyerTitle] = useState('');
  const [flyerStore, setFlyerStore] = useState('');
  const [expandedSpecial, setExpandedSpecial] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  const fetchSpecials = useCallback(async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/specials?region=${encodeURIComponent(region)}&limit=30`, { headers: headers() });
      if (resp.ok) setSpecials(await resp.json());
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [token, region]);

  useEffect(() => { fetchSpecials(); }, [fetchSpecials]);
  const onRefresh = () => { setRefreshing(true); fetchSpecials(); };

  const pickImage = async (useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission Required', 'Please allow access'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]?.base64) {
      setFlyerImage(result.assets[0].base64);
      setScanResult(null);
    }
  };

  const scanFlyer = async () => {
    if (!flyerImage) return;
    setScanning(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/scan/shelf-tag`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ image_base64: flyerImage, scan_type: 'flyer' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setScanResult(data);
        if (data.store_name) setFlyerStore(data.store_name);
        setFlyerTitle(`Sale at ${data.store_name || 'Store'}`);
      } else {
        Alert.alert('Scan Failed', 'Could not read flyer. You can still post it manually.');
      }
    } catch { Alert.alert('Error', 'Scan failed'); } finally { setScanning(false); }
  };

  const postSpecial = async () => {
    if (!flyerTitle.trim()) { Alert.alert('Missing', 'Please add a title'); return; }
    setUploading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/specials`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          title: flyerTitle,
          store_name: flyerStore,
          items: scanResult?.items || [],
          valid_until: scanResult?.valid_until || '',
          photo_base64: flyerImage || '',
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        Alert.alert('Posted!', `Special shared! You earned ${data.points_earned} points.`);
        resetUpload();
        fetchSpecials();
      }
    } catch { Alert.alert('Error', 'Failed to post'); } finally { setUploading(false); }
  };

  const resetUpload = () => {
    setShowUpload(false); setFlyerImage(null); setScanResult(null);
    setFlyerTitle(''); setFlyerStore('');
  };

  const s = createStyles(colors);

  return (
    <SafeAreaView style={s.container} testID="specials-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={s.header}>
            <View>
              <Text style={s.title}>Specials & Sales</Text>
              <Text style={s.subtitle}>Latest deals across T&T</Text>
            </View>
            <TouchableOpacity testID="upload-flyer-btn" style={s.uploadBtn} onPress={() => setShowUpload(true)}>
              <Ionicons name="add" size={22} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>

          {/* Region Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
            <TouchableOpacity
              testID="specials-region-all"
              style={[s.filterChip, !region && { backgroundColor: colors.primary }]}
              onPress={() => setRegion('')}
            >
              <Text style={[s.filterText, !region && { color: colors.primaryForeground }]}>All</Text>
            </TouchableOpacity>
            {TT_REGIONS.map(r => (
              <TouchableOpacity
                key={r}
                testID={`specials-region-${r}`}
                style={[s.filterChip, region === r && { backgroundColor: colors.primary }]}
                onPress={() => setRegion(r)}
              >
                <Text style={[s.filterText, region === r && { color: colors.primaryForeground }]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : specials.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="megaphone-outline" size={48} color={colors.textSecondary} />
              <Text style={s.emptyTitle}>No specials yet</Text>
              <Text style={s.emptyDesc}>Be the first to share a sale flyer!</Text>
              <TouchableOpacity testID="empty-upload-btn" style={s.emptyBtn} onPress={() => setShowUpload(true)}>
                <Ionicons name="camera" size={18} color={colors.primaryForeground} />
                <Text style={s.emptyBtnText}>Upload Flyer</Text>
              </TouchableOpacity>
            </View>
          ) : (
            specials.map((sp, i) => {
              const isExpanded = expandedSpecial === sp.special_id;
              return (
                <TouchableOpacity
                  key={sp.special_id}
                  testID={`special-card-${i}`}
                  style={s.specialCard}
                  onPress={() => setExpandedSpecial(isExpanded ? null : sp.special_id)}
                  activeOpacity={0.8}
                >
                  <View style={s.specialHeader}>
                    <View style={[s.specialBadge, { backgroundColor: colors.error + '20' }]}>
                      <Ionicons name="pricetag" size={18} color={colors.error} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.specialTitle}>{sp.title}</Text>
                      <Text style={s.specialStore}>{sp.store_name || 'Store'} · {sp.region}</Text>
                    </View>
                    {sp.items?.length > 0 && (
                      <View style={s.itemCountBadge}>
                        <Text style={s.itemCountText}>{sp.items.length}</Text>
                      </View>
                    )}
                  </View>
                  {sp.valid_until ? (
                    <Text style={s.validUntil}>Valid until: {sp.valid_until}</Text>
                  ) : null}
                  {isExpanded && sp.items?.length > 0 && (
                    <View style={s.specialItems}>
                      {sp.items.map((item: any, j: number) => (
                        <View key={j} style={s.specialItemRow}>
                          <Text style={s.specialItemName} numberOfLines={1}>{item.product_name}</Text>
                          <View style={s.specialPrices}>
                            {item.original_price > 0 && (
                              <Text style={s.originalPrice}>${item.original_price.toFixed(2)}</Text>
                            )}
                            <Text style={s.salePrice}>${item.price.toFixed(2)}</Text>
                          </View>
                          {item.discount_text ? <Text style={s.discountTag}>{item.discount_text}</Text> : null}
                        </View>
                      ))}
                    </View>
                  )}
                  <View style={s.specialFooter}>
                    <Text style={s.specialPostedBy}>by {sp.posted_by_name}</Text>
                    <Text style={s.specialDate}>{new Date(sp.created_at).toLocaleDateString()}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Upload Flyer Modal */}
      <Modal visible={showUpload} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Share a Sale / Flyer</Text>
              <TouchableOpacity testID="close-upload-modal" onPress={resetUpload}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {!flyerImage ? (
                <View style={s.captureArea}>
                  <Ionicons name="megaphone" size={48} color={colors.primary} />
                  <Text style={s.captureText}>Take a photo of a sales flyer or receipt</Text>
                  <View style={s.captureRow}>
                    <TouchableOpacity testID="flyer-camera-btn" style={s.captureBtn} onPress={() => pickImage(true)}>
                      <Ionicons name="camera" size={20} color={colors.primaryForeground} />
                      <Text style={s.captureBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="flyer-gallery-btn" style={[s.captureBtn, { backgroundColor: colors.secondary }]} onPress={() => pickImage(false)}>
                      <Ionicons name="images" size={20} color={colors.secondaryForeground} />
                      <Text style={[s.captureBtnText, { color: colors.secondaryForeground }]}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Image source={{ uri: `data:image/jpeg;base64,${flyerImage}` }} style={s.previewImg} resizeMode="cover" />
                  {!scanResult && (
                    <TouchableOpacity testID="scan-flyer-btn" style={s.scanFlyerBtn} onPress={scanFlyer} disabled={scanning}>
                      {scanning ? <ActivityIndicator color={colors.primaryForeground} /> : (
                        <><Ionicons name="scan" size={18} color={colors.primaryForeground} /><Text style={s.scanFlyerText}>Read Deals from Image</Text></>
                      )}
                    </TouchableOpacity>
                  )}
                  {scanResult && scanResult.items?.length > 0 && (
                    <View style={s.scanResultCard}>
                      <Text style={s.scanResultTitle}>Found {scanResult.items.length} deal{scanResult.items.length !== 1 ? 's' : ''}</Text>
                      {scanResult.items.slice(0, 5).map((item: any, i: number) => (
                        <View key={i} style={s.scanResultRow}>
                          <Text style={s.scanResultName} numberOfLines={1}>{item.product_name}</Text>
                          <Text style={s.scanResultPrice}>${item.price.toFixed(2)}</Text>
                        </View>
                      ))}
                      {scanResult.items.length > 5 && <Text style={s.moreItems}>+{scanResult.items.length - 5} more items</Text>}
                    </View>
                  )}
                  <TextInput testID="flyer-title-input" style={s.input} placeholder="Title (e.g. Massy Weekend Sale)" placeholderTextColor={colors.textSecondary} value={flyerTitle} onChangeText={setFlyerTitle} />
                  <TextInput testID="flyer-store-input" style={s.input} placeholder="Store name" placeholderTextColor={colors.textSecondary} value={flyerStore} onChangeText={setFlyerStore} />
                  <TouchableOpacity testID="post-special-btn" style={s.postBtn} onPress={postSpecial} disabled={uploading}>
                    {uploading ? <ActivityIndicator color={colors.primaryForeground} /> : (
                      <><Ionicons name="megaphone" size={18} color={colors.primaryForeground} /><Text style={s.postBtnText}>Post Special (+15 pts)</Text></>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  uploadBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  filterScroll: { marginBottom: Spacing.l },
  filterChip: {
    paddingHorizontal: Spacing.m, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: colors.surface, marginRight: Spacing.xs,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  emptyCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', marginTop: Spacing.l,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: Spacing.m },
  emptyDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  emptyBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: Spacing.xs, marginTop: Spacing.l, alignItems: 'center',
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  specialCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.m,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  specialHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  specialBadge: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  specialTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  specialStore: { fontSize: 13, color: colors.textSecondary },
  itemCountBadge: {
    backgroundColor: colors.error, width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
  },
  itemCountText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  validUntil: { fontSize: 12, color: colors.warning, fontWeight: '600', marginTop: Spacing.xs, marginLeft: 52 },
  specialItems: { marginTop: Spacing.s, paddingTop: Spacing.s, borderTopWidth: 1, borderTopColor: colors.border },
  specialItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  specialItemName: { flex: 1, fontSize: 14, color: colors.text },
  specialPrices: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  originalPrice: { fontSize: 13, color: colors.textSecondary, textDecorationLine: 'line-through' },
  salePrice: { fontSize: 16, fontWeight: '800', color: colors.error },
  discountTag: {
    fontSize: 10, fontWeight: '700', color: colors.error,
    backgroundColor: colors.error + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  specialFooter: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: Spacing.s, paddingTop: Spacing.xs,
  },
  specialPostedBy: { fontSize: 12, color: colors.textSecondary },
  specialDate: { fontSize: 12, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.l, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  captureArea: { alignItems: 'center', paddingVertical: Spacing.xl },
  captureText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.m, marginBottom: Spacing.l },
  captureRow: { flexDirection: 'row', gap: Spacing.m },
  captureBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: Spacing.xs, alignItems: 'center',
  },
  captureBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  previewImg: { width: '100%', height: 200, borderRadius: Radius.l, marginBottom: Spacing.m },
  scanFlyerBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.m,
    height: 44, justifyContent: 'center', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.m,
  },
  scanFlyerText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
  scanResultCard: {
    backgroundColor: colors.success + '10', borderRadius: Radius.m, padding: Spacing.m, marginBottom: Spacing.m,
    borderWidth: 1, borderColor: colors.success + '30',
  },
  scanResultTitle: { fontSize: 14, fontWeight: '700', color: colors.success, marginBottom: Spacing.s },
  scanResultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  scanResultName: { flex: 1, fontSize: 13, color: colors.text },
  scanResultPrice: { fontSize: 14, fontWeight: '700', color: colors.primary },
  moreItems: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text, marginBottom: Spacing.s,
  },
  postBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 50, justifyContent: 'center', alignItems: 'center', gap: Spacing.s, marginTop: Spacing.s,
  },
  postBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondaryForeground },
});
