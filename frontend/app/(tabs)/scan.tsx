/**
 * frontend/app/scan.tsx  (or  app/(tabs)/scan.tsx  — wherever your Scan tab lives)
 * TriniSaver — Scan / Identify Screen
 *
 * Feature 4: When taking a photo or picking from gallery,
 * the app reads product info from the image (AI OCR) and
 * shows identified details before the user confirms + saves.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
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

interface IdentifiedProduct {
  name: string;
  brand?: string | null;
  size?: string | null;
  price?: number | null;
  store?: string | null;
  barcode?: string | null;
  category?: string | null;
  confidence: number;
  raw_text?: string | null;
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
const ConfidenceBar: React.FC<{ value: number }> = ({ value }) => {
  const pct   = Math.round(value * 100);
  const color = value >= 0.7 ? C.success : value >= 0.4 ? C.accent : C.error;
  return (
    <View style={cbStyles.container}>
      <View style={cbStyles.track}>
        <View style={[cbStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[cbStyles.label, { color }]}>{pct}% confidence</Text>
    </View>
  );
};
const cbStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  track:     { flex: 1, height: 6, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  fill:      { height: '100%', borderRadius: 3 },
  label:     { fontSize: 11, fontWeight: '700', minWidth: 80, textAlign: 'right' },
});

// ─── Field row ────────────────────────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  value: string;
  onChangeText?: (t: string) => void;
  editable?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}> = ({ label, value, onChangeText, editable = true, keyboardType = 'default' }) => (
  <View style={fieldStyles.row}>
    <Text style={fieldStyles.label}>{label}</Text>
    <TextInput
      style={fieldStyles.input}
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      keyboardType={keyboardType}
      placeholderTextColor={C.textSec}
    />
  </View>
);
const fieldStyles = StyleSheet.create({
  row:   { marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: C.textSec, marginBottom: 4 },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
type Step = 'idle' | 'scanning' | 'review' | 'saving';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();

  const [step,        setStep]        = useState<Step>('idle');
  const [previewUri,  setPreviewUri]  = useState<string | null>(null);
  const [imageB64,    setImageB64]    = useState<string | null>(null);
  const [imageMime,   setImageMime]   = useState<string>('image/jpeg');
  const [identified,  setIdentified]  = useState<IdentifiedProduct | null>(null);

  // Editable fields after identification
  const [name,  setName]  = useState('');
  const [brand, setBrand] = useState('');
  const [size,  setSize]  = useState('');
  const [price, setPrice] = useState('');
  const [store, setStore] = useState('');

  // ── Image capture helpers ──────────────────────────────────────────────────
  const processAsset = useCallback(async (uri: string) => {
    setStep('scanning');
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );

      if (!result.base64) throw new Error('Image processing failed.');

      setPreviewUri(result.uri);
      setImageB64(result.base64);
      setImageMime('image/jpeg');

      // Call backend OCR/AI
      const token = await AsyncStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/scan/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ image_data: result.base64, mime_type: 'image/jpeg' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.success && data.product) {
        const p: IdentifiedProduct = data.product;
        setIdentified(p);
        setName(p.name ?? '');
        setBrand(p.brand ?? '');
        setSize(p.size ?? '');
        setPrice(p.price != null ? String(p.price) : '');
        setStore(p.store ?? '');
        setStep('review');
      } else {
        // Partial / low confidence — still go to review so user can fill in manually
        setIdentified({ name: '', confidence: 0.0 });
        setName('');
        setBrand('');
        setSize('');
        setPrice('');
        setStore('');
        setStep('review');
        Alert.alert(
          'Could not read image',
          'We couldn\'t identify the product clearly. Please fill in the details manually.',
        );
      }
    } catch (err: any) {
      setStep('idle');
      Alert.alert('Scan failed', err?.message ?? 'Unknown error. Please try again.');
    }
  }, []);

  const handleCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to scan items.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      await processAsset(result.assets[0].uri);
    }
  };

  const handleGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      await processAsset(result.assets[0].uri);
    }
  };

  const handleReset = () => {
    setStep('idle');
    setPreviewUri(null);
    setImageB64(null);
    setIdentified(null);
    setName(''); setBrand(''); setSize(''); setPrice(''); setStore('');
  };

  // ── Save as price report ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Item name required', 'Please enter or confirm the product name.');
      return;
    }
    const parsedPrice = parseFloat(price);
    if (price && isNaN(parsedPrice)) {
      Alert.alert('Invalid price', 'Please enter a valid number for the price.');
      return;
    }

    setStep('saving');
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to save price reports.');
        setStep('review');
        return;
      }

      // 1. Create price report
      const reportRes = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          item_name:  name.trim(),
          brand:      brand.trim() || undefined,
          size:       size.trim()  || undefined,
          price:      parsedPrice  || undefined,
          store:      store.trim() || undefined,
          image_data: imageB64,
          mime_type:  imageMime,
        }),
      });

      if (!reportRes.ok) {
        const err = await reportRes.json().catch(() => ({}));
        throw new Error(err?.detail ?? `HTTP ${reportRes.status}`);
      }

      Alert.alert('Saved!', 'Price report submitted. Thank you for contributing! 🎉', [
        { text: 'OK', onPress: () => { handleReset(); router.push('/(tabs)'); } },
      ]);
    } catch (err: any) {
      setStep('review');
      Alert.alert('Save failed', err?.message ?? 'Please try again.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="scan-back-btn">
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tap to Compare</Text>
          {step === 'review' && (
            <TouchableOpacity onPress={handleReset} testID="scan-reset-btn">
              <Text style={styles.resetText}>Retake</Text>
            </TouchableOpacity>
          )}
          {step !== 'review' && <View style={{ width: 60 }} />}
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── IDLE: camera/gallery buttons ─────────────────────────────── */}
          {step === 'idle' && (
            <View style={styles.idleContainer}>
              <View style={styles.cameraIconBox}>
                <Text style={styles.cameraEmoji}>📷</Text>
              </View>
              <Text style={styles.idleTitle}>Scan any item</Text>
              <Text style={styles.idleSubtitle}>
                Point at a product, price tag, receipt or flyer.{'\n'}
                We'll read the details automatically.
              </Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleCamera}
                testID="scan-camera-btn"
              >
                <Ionicons name="camera" size={20} color="#FFF" />
                <Text style={styles.primaryBtnText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleGallery}
                testID="scan-gallery-btn"
              >
                <Ionicons name="images" size={20} color={C.primary} />
                <Text style={styles.secondaryBtnText}>Choose from Gallery</Text>
              </TouchableOpacity>

              <View style={styles.tipsBox}>
                <Text style={styles.tipsTitle}>Tips for best results</Text>
                <Text style={styles.tipItem}>📦 Product — show the front label clearly</Text>
                <Text style={styles.tipItem}>🏷️ Price tag — keep text in frame</Text>
                <Text style={styles.tipItem}>🧾 Receipt — lay flat, good lighting</Text>
                <Text style={styles.tipItem}>📰 Flyer — photograph full page</Text>
              </View>
            </View>
          )}

          {/* ── SCANNING: loading ─────────────────────────────────────────── */}
          {step === 'scanning' && (
            <View style={styles.scanningContainer}>
              {previewUri && (
                <Image source={{ uri: previewUri }} style={styles.previewImg} resizeMode="cover" />
              )}
              <View style={styles.scanningOverlay}>
                <ActivityIndicator size="large" color={C.primary} />
                <Text style={styles.scanningText}>Reading product details…</Text>
                <Text style={styles.scanningSubText}>Powered by AI vision</Text>
              </View>
            </View>
          )}

          {/* ── REVIEW: show result + editable form ──────────────────────── */}
          {(step === 'review' || step === 'saving') && (
            <View>
              {/* Preview thumbnail */}
              {previewUri && (
                <Image source={{ uri: previewUri }} style={styles.reviewThumb} resizeMode="cover" />
              )}

              {/* Confidence */}
              {identified && (
                <View style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <Ionicons name="scan-outline" size={16} color={C.primary} />
                    <Text style={styles.reviewCardTitle}>Identified Product</Text>
                  </View>
                  <ConfidenceBar value={identified.confidence} />
                  {identified.confidence < 0.4 && (
                    <Text style={styles.lowConfidenceNote}>
                      Low confidence — please review and correct the details below.
                    </Text>
                  )}
                </View>
              )}

              {/* Editable fields */}
              <View style={styles.formCard}>
                <Text style={styles.formCardTitle}>Confirm Details</Text>
                <Field
                  label="Product Name *"
                  value={name}
                  onChangeText={setName}
                />
                <Field
                  label="Brand"
                  value={brand}
                  onChangeText={setBrand}
                />
                <Field
                  label="Size / Weight"
                  value={size}
                  onChangeText={setSize}
                />
                <Field
                  label="Price (TT$)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Store"
                  value={store}
                  onChangeText={setStore}
                />
              </View>

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveBtn, step === 'saving' && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={step === 'saving'}
                testID="scan-save-btn"
              >
                {step === 'saving' ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.saveBtnText}>Save Price Report</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.discardBtn}
                onPress={handleReset}
                testID="scan-discard-btn"
              >
                <Text style={styles.discardBtnText}>Discard</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  kav:     { flex: 1 },
  content: { padding: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  resetText:   { fontSize: 14, fontWeight: '600', color: C.error },

  // Idle
  idleContainer: { alignItems: 'center', paddingTop: 32, gap: 12 },
  cameraIconBox: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  cameraEmoji:   { fontSize: 44 },
  idleTitle:     { fontSize: 22, fontWeight: '800', color: C.text },
  idleSubtitle:  { fontSize: 14, color: C.textSec, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.primary, borderRadius: 999,
    paddingHorizontal: 32, paddingVertical: 14,
    width: '100%', justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface,
    borderWidth: 1.5, borderColor: C.primary,
    borderRadius: 999, paddingHorizontal: 32, paddingVertical: 14,
    width: '100%', justifyContent: 'center',
  },
  secondaryBtnText: { color: C.primary, fontSize: 16, fontWeight: '700' },
  tipsBox: {
    backgroundColor: C.surface, borderRadius: 14,
    padding: 16, width: '100%', marginTop: 8, gap: 6,
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 4 },
  tipItem:   { fontSize: 13, color: C.textSec },

  // Scanning
  scanningContainer: { position: 'relative', borderRadius: 16, overflow: 'hidden', height: 280 },
  previewImg:        { width: '100%', height: '100%', borderRadius: 16 },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 16,
  },
  scanningText:    { fontSize: 16, fontWeight: '700', color: '#FFF' },
  scanningSubText: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },

  // Review
  reviewThumb: {
    width: '100%', height: 200, borderRadius: 16, marginBottom: 12,
  },
  reviewCard: {
    backgroundColor: C.surface, borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  reviewCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  reviewCardTitle:  { fontSize: 14, fontWeight: '700', color: C.text },
  lowConfidenceNote: { fontSize: 12, color: C.error, marginTop: 4 },

  formCard: {
    backgroundColor: C.surface, borderRadius: 14,
    padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  formCardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.success, borderRadius: 999,
    paddingVertical: 14, justifyContent: 'center', marginBottom: 10,
  },
  saveBtnText:    { color: '#FFF', fontSize: 16, fontWeight: '700' },
  discardBtn:     { paddingVertical: 12, alignItems: 'center' },
  discardBtnText: { fontSize: 14, color: C.error, fontWeight: '600' },
});
