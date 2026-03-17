import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, STORE_NAMES } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type ScanMode = 'single' | 'receipt' | 'flyer';

export default function ScanScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('single');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Single item fields
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [storeName, setStoreName] = useState(STORE_NAMES[0]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');
  // Multi-item selection
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  const pickImage = async (useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission Required', 'Please allow access'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]?.base64) {
      setImageBase64(result.assets[0].base64);
      setScanResult(null);
      setSubmitted(false);
      setSelectedItems(new Set());
    }
  };

  const scanImage = async () => {
    if (!imageBase64) return;
    setScanning(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/scan/shelf-tag`, {
        method: 'POST', headers,
        body: JSON.stringify({ image_base64: imageBase64, scan_type: scanMode }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setScanResult(data);
        if (data.scan_type === 'single') {
          if (data.product_name) setProductName(data.product_name);
          if (data.price) setPrice(data.price.toString());
          if (data.store_name) setStoreName(data.store_name);
          if (data.quantity) setQuantity(data.quantity.toString());
          if (data.unit) setUnit(data.unit);
        } else {
          // Select all items by default
          if (data.items?.length > 0) {
            setSelectedItems(new Set(data.items.map((_: any, i: number) => i)));
          }
          if (data.store_name) setStoreName(data.store_name);
        }
      } else {
        Alert.alert('Scan Failed', 'Could not read the image. Try again or enter manually.');
      }
    } catch { Alert.alert('Error', 'Scan failed'); } finally { setScanning(false); }
  };

  const toggleItemSelection = (idx: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const submitSingle = async () => {
    if (!productName.trim() || !price.trim()) {
      Alert.alert('Missing', 'Please fill in product name and price');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/price-reports`, {
        method: 'POST', headers,
        body: JSON.stringify({
          product_name: productName, store_name: storeName,
          price: parseFloat(price), quantity: parseFloat(quantity) || 1,
          unit, photo_base64: imageBase64?.substring(0, 100) || '',
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSubmitted(true);
        Alert.alert('Success', `Price reported! +${data.points_earned} points`);
      } else if (resp.status === 409) {
        const err = await resp.json().catch(() => ({}));
        const errorMsg = err.detail || 'This price has already been reported';
        setSubmitError(errorMsg);
        Alert.alert('Duplicate Detected', errorMsg);
      } else {
        const errorMsg = 'Failed to submit report. Please try again.';
        setSubmitError(errorMsg);
        Alert.alert('Error', errorMsg);
      }
    } catch {
      const errorMsg = 'Network error. Please check your connection.';
      setSubmitError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally { setSubmitting(false); }
  };

  const submitMultiple = async () => {
    if (selectedItems.size === 0) {
      Alert.alert('None Selected', 'Select at least one item to report');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    let totalPoints = 0;
    let duplicates = 0;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const items = scanResult?.items || [];
      for (const idx of selectedItems) {
        const item = items[idx];
        if (!item || !item.product_name) continue;
        const resp = await fetch(`${BACKEND_URL}/api/price-reports`, {
          method: 'POST', headers,
          body: JSON.stringify({
            product_name: item.product_name, store_name: storeName,
            price: item.price, quantity: item.quantity || 1,
            unit: item.unit || 'each', photo_base64: '',
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          totalPoints += data.points_earned;
        } else if (resp.status === 409) {
          duplicates++;
        }
      }
      const reported = selectedItems.size - duplicates;
      if (duplicates > 0 && reported > 0) {
        setSubmitted(true);
        Alert.alert('Partially Submitted', `${reported} new item(s) reported (+${totalPoints} pts). ${duplicates} skipped as duplicates.`);
      } else if (duplicates > 0 && reported === 0) {
        const errorMsg = `All ${duplicates} items were already reported for this store today.`;
        setSubmitError(errorMsg);
        Alert.alert('All Duplicates', errorMsg);
      } else {
        setSubmitted(true);
        Alert.alert('All Reported!', `${reported} items submitted. +${totalPoints} points total!`);
      }
    } catch {
      const errorMsg = 'Some items failed to submit. Please try again.';
      setSubmitError(errorMsg);
      Alert.alert('Error', errorMsg);
    } finally { setSubmitting(false); }
  };

  const reset = () => {
    setImageBase64(null); setScanResult(null); setProductName(''); setPrice('');
    setStoreName(STORE_NAMES[0]); setQuantity('1'); setUnit('each');
    setSubmitted(false); setSelectedItems(new Set()); setSubmitError(null);
  };

  const s = createStyles(colors);
  const isMulti = scanMode === 'receipt' || scanMode === 'flyer';

  return (
    <SafeAreaView style={s.container} testID="scan-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Quick Scan</Text>
          <Text style={s.subtitle}>Scan price tags, receipts, or sale flyers</Text>

          {/* Scan Mode Selector */}
          <View style={s.modeRow}>
            {([
              { key: 'single', icon: 'pricetag', label: 'Price Tag' },
              { key: 'receipt', icon: 'receipt', label: 'Receipt' },
              { key: 'flyer', icon: 'megaphone', label: 'Sale Flyer' },
            ] as { key: ScanMode; icon: string; label: string }[]).map(m => (
              <TouchableOpacity
                key={m.key}
                testID={`mode-${m.key}`}
                style={[s.modeBtn, scanMode === m.key && { backgroundColor: colors.primary }]}
                onPress={() => { setScanMode(m.key); setScanResult(null); }}
              >
                <Ionicons name={m.icon as any} size={18} color={scanMode === m.key ? colors.primaryForeground : colors.textSecondary} />
                <Text style={[s.modeBtnText, scanMode === m.key && { color: colors.primaryForeground }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Capture Area */}
          {!imageBase64 ? (
            <View style={s.captureCard}>
              <View style={s.captureIcon}>
                <Ionicons name={scanMode === 'flyer' ? 'megaphone' : scanMode === 'receipt' ? 'receipt' : 'camera'} size={48} color={colors.primary} />
              </View>
              <Text style={s.captureTitle}>
                {scanMode === 'receipt' ? 'Scan a Receipt' : scanMode === 'flyer' ? 'Scan a Sale Flyer' : 'Scan a Price Tag'}
              </Text>
              <Text style={s.captureDesc}>
                {scanMode === 'receipt' ? 'AI reads all items & prices from your receipt' : scanMode === 'flyer' ? 'AI extracts all deals from the flyer' : 'AI reads the product & price'}
              </Text>
              <View style={s.captureButtons}>
                <TouchableOpacity testID="camera-btn" style={s.captureBtn} onPress={() => pickImage(true)}>
                  <Ionicons name="camera" size={20} color={colors.primaryForeground} />
                  <Text style={s.captureBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="gallery-btn" style={[s.captureBtn, { backgroundColor: colors.secondary }]} onPress={() => pickImage(false)}>
                  <Ionicons name="images" size={20} color={colors.secondaryForeground} />
                  <Text style={[s.captureBtnText, { color: colors.secondaryForeground }]}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={s.previewCard}>
                <Image source={{ uri: `data:image/jpeg;base64,${imageBase64}` }} style={s.previewImage} resizeMode="cover" />
                <View style={s.previewActions}>
                  <TouchableOpacity testID="retake-btn" style={s.retakeBtn} onPress={reset}>
                    <Ionicons name="refresh" size={18} color={colors.error} />
                    <Text style={{ color: colors.error, fontWeight: '600', fontSize: 14 }}>Retake</Text>
                  </TouchableOpacity>
                  {!scanResult && (
                    <TouchableOpacity testID="scan-btn" style={s.scanBtn} onPress={scanImage} disabled={scanning}>
                      {scanning ? <ActivityIndicator color={colors.primaryForeground} /> : (
                        <><Ionicons name="scan" size={18} color={colors.primaryForeground} /><Text style={s.scanBtnText}>Read {scanMode === 'receipt' ? 'Receipt' : scanMode === 'flyer' ? 'Flyer' : 'Tag'}</Text></>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Results */}
              {scanResult && !submitted && (
                <View style={s.formCard}>
                  {isMulti && scanResult.items?.length > 0 ? (
                    <>
                      <Text style={s.formTitle}>Found {scanResult.items.length} item{scanResult.items.length !== 1 ? 's' : ''}</Text>
                      {scanResult.store_name ? <Text style={s.formDesc}>Store: {scanResult.store_name}</Text> : null}
                      <TextInput testID="multi-store-input" style={s.input} placeholder="Store name" placeholderTextColor={colors.textSecondary} value={storeName} onChangeText={setStoreName} />
                      <Text style={s.selectHint}>Tap items to select/deselect</Text>
                      {scanResult.items.map((item: any, i: number) => {
                        const selected = selectedItems.has(i);
                        return (
                          <TouchableOpacity
                            key={i}
                            testID={`scan-item-${i}`}
                            style={[s.scanItemRow, selected && { backgroundColor: colors.success + '12' }]}
                            onPress={() => toggleItemSelection(i)}
                          >
                            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? colors.success : colors.textSecondary} />
                            <View style={{ flex: 1, marginLeft: Spacing.s }}>
                              <Text style={s.scanItemName}>{item.product_name}</Text>
                              {item.discount_text ? <Text style={s.discountText}>{item.discount_text}</Text> : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              {item.original_price > 0 && <Text style={s.origPrice}>${item.original_price.toFixed(2)}</Text>}
                              <Text style={s.scanItemPrice}>${item.price.toFixed(2)}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {scanResult.total > 0 && <Text style={s.totalText}>Receipt Total: ${scanResult.total.toFixed(2)} TTD</Text>}
                      {submitError && (
                        <View style={s.errorBanner}>
                          <Ionicons name="alert-circle" size={20} color={colors.error} />
                          <Text style={s.errorText}>{submitError}</Text>
                        </View>
                      )}
                      <TouchableOpacity testID="submit-multi-btn" style={s.submitBtn} onPress={submitMultiple} disabled={submitting}>
                        {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : (
                          <><Ionicons name="cloud-upload" size={18} color={colors.primaryForeground} /><Text style={s.submitBtnText}>Report {selectedItems.size} Items</Text></>
                        )}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={s.formTitle}>Verify & Submit</Text>
                      <View style={s.inputGroup}><Text style={s.label}>Product Name</Text><TextInput testID="scan-product-input" style={s.input} value={productName} onChangeText={setProductName} placeholderTextColor={colors.textSecondary} /></View>
                      <View style={s.inputGroup}><Text style={s.label}>Store</Text><TextInput testID="scan-store-input" style={s.input} value={storeName} onChangeText={setStoreName} placeholderTextColor={colors.textSecondary} /></View>
                      <View style={s.rowInputs}>
                        <View style={[s.inputGroup, { flex: 1 }]}><Text style={s.label}>Price (TTD)</Text><TextInput testID="scan-price-input" style={s.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholderTextColor={colors.textSecondary} /></View>
                        <View style={[s.inputGroup, { flex: 0.6 }]}><Text style={s.label}>Qty</Text><TextInput testID="scan-qty-input" style={s.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholderTextColor={colors.textSecondary} /></View>
                        <View style={[s.inputGroup, { flex: 0.6 }]}><Text style={s.label}>Unit</Text><TextInput testID="scan-unit-input" style={s.input} value={unit} onChangeText={setUnit} placeholderTextColor={colors.textSecondary} /></View>
                      </View>
                      {submitError && (
                        <View style={s.errorBanner}>
                          <Ionicons name="alert-circle" size={20} color={colors.error} />
                          <Text style={s.errorText}>{submitError}</Text>
                        </View>
                      )}
                      <TouchableOpacity testID="submit-report-btn" style={s.submitBtn} onPress={submitSingle} disabled={submitting}>
                        {submitting ? <ActivityIndicator color={colors.primaryForeground} /> : (
                          <><Ionicons name="cloud-upload" size={18} color={colors.primaryForeground} /><Text style={s.submitBtnText}>Submit Price Report</Text></>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                  <Text style={s.pointsHint}>{isMulti ? '+1 pt per item reported' : 'Earn 1 point per report! (= $0.10 TTD)'}</Text>
                </View>
              )}

              {submitted && (
                <View style={s.successCard}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                  <Text style={s.successTitle}>Price{isMulti ? 's' : ''} Reported!</Text>
                  <Text style={s.successDesc}>Thank you for helping the community save</Text>
                  <TouchableOpacity testID="scan-another-btn" style={s.scanAnotherBtn} onPress={reset}>
                    <Text style={s.scanAnotherText}>Scan Another</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: Spacing.m },
  modeRow: { flexDirection: 'row', gap: Spacing.s, marginBottom: Spacing.l },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.m, backgroundColor: colors.surface,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  captureCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  captureIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary + '15',
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.m,
  },
  captureTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  captureDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing.l },
  captureButtons: { flexDirection: 'row', gap: Spacing.m },
  captureBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: 6, alignItems: 'center',
  },
  captureBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  previewCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: Spacing.m,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  previewImage: { width: '100%', height: 200 },
  previewActions: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.m, gap: Spacing.m },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  scanBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: 6, alignItems: 'center',
  },
  scanBtnText: { fontSize: 14, fontWeight: '700', color: colors.primaryForeground },
  formCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l, marginBottom: Spacing.m,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  formDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: Spacing.s },
  selectHint: { fontSize: 12, color: colors.textSecondary, marginBottom: Spacing.s, marginTop: Spacing.xs },
  scanItemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.s,
    borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 4,
  },
  scanItemName: { fontSize: 14, fontWeight: '600', color: colors.text },
  discountText: { fontSize: 11, fontWeight: '600', color: colors.error },
  origPrice: { fontSize: 12, color: colors.textSecondary, textDecorationLine: 'line-through' },
  scanItemPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },
  totalText: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'right', marginTop: Spacing.m },
  inputGroup: { marginBottom: Spacing.s },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text, marginBottom: Spacing.xs,
  },
  rowInputs: { flexDirection: 'row', gap: Spacing.s },
  submitBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 50, justifyContent: 'center', alignItems: 'center', gap: Spacing.s, marginTop: Spacing.m,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondaryForeground },
  pointsHint: { fontSize: 12, color: colors.accent, textAlign: 'center', marginTop: Spacing.s, fontWeight: '600' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    backgroundColor: colors.error + '15', borderRadius: Radius.m, padding: Spacing.m,
    marginTop: Spacing.s, borderWidth: 1, borderColor: colors.error + '30',
  },
  errorText: { flex: 1, fontSize: 14, color: colors.error, fontWeight: '600' },
  successCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.success, marginTop: Spacing.m },
  successDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  scanAnotherBtn: {
    backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.m, marginTop: Spacing.l,
  },
  scanAnotherText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
});
