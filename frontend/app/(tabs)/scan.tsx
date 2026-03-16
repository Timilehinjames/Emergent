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
import { Spacing, Radius, Shadows, STORE_NAMES } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ScanScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Editable fields after scan
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [storeName, setStoreName] = useState(STORE_NAMES[0]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');

  const pickImage = async (useCamera: boolean) => {
    const permResult = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to continue');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]?.base64) {
      setImageBase64(result.assets[0].base64);
      setScanResult(null);
      setSubmitted(false);
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
        body: JSON.stringify({ image_base64: imageBase64 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setScanResult(data);
        if (data.product_name) setProductName(data.product_name);
        if (data.price) setPrice(data.price.toString());
        if (data.store_name) setStoreName(data.store_name);
        if (data.quantity) setQuantity(data.quantity.toString());
        if (data.unit) setUnit(data.unit);
      } else {
        const err = await resp.json().catch(() => ({}));
        Alert.alert('Scan Failed', err.detail || 'Could not read the image');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to scan image');
    } finally {
      setScanning(false);
    }
  };

  const submitReport = async () => {
    if (!productName.trim() || !price.trim()) {
      Alert.alert('Missing Info', 'Please fill in product name and price');
      return;
    }
    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/price-reports`, {
        method: 'POST', headers,
        body: JSON.stringify({
          product_name: productName,
          store_name: storeName,
          price: parseFloat(price),
          quantity: parseFloat(quantity) || 1,
          unit: unit,
          photo_base64: imageBase64 ? imageBase64.substring(0, 100) : '',
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSubmitted(true);
        Alert.alert('Success', `Price reported! You earned ${data.points_earned} points.`);
      }
    } catch {
      Alert.alert('Error', 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setImageBase64(null);
    setScanResult(null);
    setProductName('');
    setPrice('');
    setStoreName(STORE_NAMES[0]);
    setQuantity('1');
    setUnit('each');
    setSubmitted(false);
  };

  const s = createStyles(colors);

  return (
    <SafeAreaView style={s.container} testID="scan-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Quick Scan</Text>
          <Text style={s.subtitle}>Snap a shelf tag or receipt to report prices</Text>

          {/* Image Capture */}
          {!imageBase64 ? (
            <View style={s.captureCard}>
              <View style={s.captureIcon}>
                <Ionicons name="camera" size={48} color={colors.primary} />
              </View>
              <Text style={s.captureTitle}>Capture a Price Tag</Text>
              <Text style={s.captureDesc}>Take a photo of a shelf price tag or receipt</Text>
              <View style={s.captureButtons}>
                <TouchableOpacity testID="camera-btn" style={s.captureBtn} onPress={() => pickImage(true)}>
                  <Ionicons name="camera" size={22} color={colors.primaryForeground} />
                  <Text style={s.captureBtnText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="gallery-btn" style={[s.captureBtn, { backgroundColor: colors.secondary }]} onPress={() => pickImage(false)}>
                  <Ionicons name="images" size={22} color={colors.secondaryForeground} />
                  <Text style={[s.captureBtnText, { color: colors.secondaryForeground }]}>Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Preview */}
              <View style={s.previewCard}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                  style={s.previewImage}
                  resizeMode="cover"
                />
                <View style={s.previewActions}>
                  <TouchableOpacity testID="retake-btn" style={s.retakeBtn} onPress={reset}>
                    <Ionicons name="refresh" size={18} color={colors.error} />
                    <Text style={[s.retakeBtnText, { color: colors.error }]}>Retake</Text>
                  </TouchableOpacity>
                  {!scanResult && (
                    <TouchableOpacity testID="scan-btn" style={s.scanBtn} onPress={scanImage} disabled={scanning}>
                      {scanning ? (
                        <ActivityIndicator color={colors.primaryForeground} />
                      ) : (
                        <>
                          <Ionicons name="scan" size={18} color={colors.primaryForeground} />
                          <Text style={s.scanBtnText}>Read Price Tag</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Scan Result / Edit Form */}
              {(scanResult || submitted) && (
                <View style={s.formCard}>
                  {submitted ? (
                    <View style={s.successBox}>
                      <Ionicons name="checkmark-circle" size={48} color={colors.success} />
                      <Text style={s.successTitle}>Price Reported!</Text>
                      <Text style={s.successDesc}>Thank you for contributing to the community</Text>
                      <TouchableOpacity testID="scan-another-btn" style={s.scanAnotherBtn} onPress={reset}>
                        <Text style={s.scanAnotherText}>Scan Another</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={s.formTitle}>Verify & Submit</Text>
                      <Text style={s.formDesc}>Edit the details if the scan missed anything</Text>
                      <View style={s.inputGroup}>
                        <Text style={s.label}>Product Name</Text>
                        <TextInput testID="scan-product-input" style={s.input} value={productName} onChangeText={setProductName} placeholderTextColor={colors.textSecondary} placeholder="Product name" />
                      </View>
                      <View style={s.inputGroup}>
                        <Text style={s.label}>Store</Text>
                        <TextInput testID="scan-store-input" style={s.input} value={storeName} onChangeText={setStoreName} placeholderTextColor={colors.textSecondary} placeholder="Store name" />
                      </View>
                      <View style={s.rowInputs}>
                        <View style={[s.inputGroup, { flex: 1 }]}>
                          <Text style={s.label}>Price (TTD)</Text>
                          <TextInput testID="scan-price-input" style={s.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholderTextColor={colors.textSecondary} placeholder="0.00" />
                        </View>
                        <View style={[s.inputGroup, { flex: 0.6 }]}>
                          <Text style={s.label}>Qty</Text>
                          <TextInput testID="scan-qty-input" style={s.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholderTextColor={colors.textSecondary} placeholder="1" />
                        </View>
                        <View style={[s.inputGroup, { flex: 0.6 }]}>
                          <Text style={s.label}>Unit</Text>
                          <TextInput testID="scan-unit-input" style={s.input} value={unit} onChangeText={setUnit} placeholderTextColor={colors.textSecondary} placeholder="each" />
                        </View>
                      </View>
                      <TouchableOpacity testID="submit-report-btn" style={s.submitBtn} onPress={submitReport} disabled={submitting}>
                        {submitting ? (
                          <ActivityIndicator color={colors.primaryForeground} />
                        ) : (
                          <>
                            <Ionicons name="cloud-upload" size={20} color={colors.primaryForeground} />
                            <Text style={s.submitBtnText}>Submit Price Report</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <Text style={s.pointsHint}>Earn 10 points for photo reports!</Text>
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* How It Works */}
          <View style={s.howCard}>
            <Text style={s.howTitle}>How It Works</Text>
            {[
              { icon: 'camera', text: 'Take a photo of any shelf price tag' },
              { icon: 'scan', text: 'AI reads the product name & price' },
              { icon: 'checkmark', text: 'Verify and submit to help the community' },
              { icon: 'star', text: 'Earn points for every verified report' },
            ].map((step, i) => (
              <View key={i} style={s.howRow}>
                <View style={s.howStep}>
                  <Text style={s.howStepNum}>{i + 1}</Text>
                </View>
                <Text style={s.howText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: Spacing.l },
  captureCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.xl,
    alignItems: 'center', ...Shadows.card, marginBottom: Spacing.l,
  },
  captureIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary + '15', justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.m,
  },
  captureTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  captureDesc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs, marginBottom: Spacing.l },
  captureButtons: { flexDirection: 'row', gap: Spacing.m },
  captureBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: Spacing.s, alignItems: 'center',
  },
  captureBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  previewCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, overflow: 'hidden',
    marginBottom: Spacing.m, ...Shadows.card,
  },
  previewImage: { width: '100%', height: 220 },
  previewActions: {
    flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.m, gap: Spacing.m,
  },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.s, paddingHorizontal: Spacing.m,
  },
  retakeBtnText: { fontSize: 14, fontWeight: '600' },
  scanBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.m, gap: Spacing.s, alignItems: 'center',
  },
  scanBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  formCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l,
    marginBottom: Spacing.m, ...Shadows.card,
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  formDesc: { fontSize: 13, color: colors.textSecondary, marginBottom: Spacing.m },
  inputGroup: { marginBottom: Spacing.m },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text,
  },
  rowInputs: { flexDirection: 'row', gap: Spacing.s },
  submitBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 50, justifyContent: 'center', alignItems: 'center', gap: Spacing.s,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondaryForeground },
  pointsHint: { fontSize: 12, color: colors.accent, textAlign: 'center', marginTop: Spacing.s, fontWeight: '600' },
  successBox: { alignItems: 'center', paddingVertical: Spacing.l },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.success, marginTop: Spacing.m },
  successDesc: { fontSize: 14, color: colors.textSecondary, marginTop: Spacing.xs },
  scanAnotherBtn: {
    backgroundColor: colors.primary, borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.m, marginTop: Spacing.l,
  },
  scanAnotherText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
  howCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l,
    ...Shadows.card,
  },
  howTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, marginBottom: Spacing.m },
  howStep: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '20',
    justifyContent: 'center', alignItems: 'center',
  },
  howStepNum: { fontSize: 14, fontWeight: '800', color: colors.primary },
  howText: { fontSize: 14, color: colors.text, flex: 1 },
});
