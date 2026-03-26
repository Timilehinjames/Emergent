/**
 * frontend/components/ReportPriceModal.tsx  (UPDATED)
 *
 * Drop-in replacement for your existing report price modal/sheet.
 * Key changes:
 *   - Imports ProductImagePicker
 *   - Adds imageData state
 *   - Sends image_data field in POST /api/price-reports
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProductImagePicker from './ProductImagePicker';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://shop-link-tt.preview.emergentagent.com/api';

interface ReportPriceModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  authToken: string;
}

export default function ReportPriceModal({
  visible,
  onClose,
  onSuccess,
  authToken,
}: ReportPriceModalProps) {
  const [productName, setProductName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');
  const [imageData, setImageData] = useState<string | null>(null); // ← NEW
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setProductName('');
    setStoreName('');
    setPrice('');
    setQuantity('1');
    setUnit('each');
    setImageData(null);
  };

  const handleSubmit = async () => {
    if (!productName.trim()) {
      Alert.alert('Missing Info', 'Please enter a product name.');
      return;
    }
    if (!storeName.trim()) {
      Alert.alert('Missing Info', 'Please enter the store name.');
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        product_name: productName.trim(),
        store_name: storeName.trim(),
        price: priceNum,
        quantity: parseFloat(quantity) || 1,
        unit: unit.trim() || 'each',
      };

      // Only include image_data when user attached one
      if (imageData) {
        payload.image_data = imageData;
      }

      const res = await fetch(`${BACKEND_URL}/price-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        Alert.alert('✅ Report Submitted', 'Thanks for helping the community!');
        reset();
        onSuccess();
        onClose();
      } else {
        Alert.alert('Error', data.detail ?? data.message ?? 'Failed to submit report.');
      }
    } catch (e) {
      Alert.alert('Network Error', 'Could not connect to the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Report a Price</Text>
            <TouchableOpacity onPress={onClose} testID="close-modal-btn" style={styles.closeBtn}>
              <Ionicons name="close" size={26} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* Product Name */}
          <Text style={styles.label}>Product Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Anchor Butter 500g"
            value={productName}
            onChangeText={setProductName}
            testID="product-name-input"
            returnKeyType="next"
          />

          {/* Store Name */}
          <Text style={styles.label}>Store Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. PriceSmart, Xtra Foods"
            value={storeName}
            onChangeText={setStoreName}
            testID="store-name-input"
            returnKeyType="next"
          />

          {/* Price Row */}
          <View style={styles.row}>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.label}>Price (TTD) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                testID="price-input"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.label}>Qty</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                testID="quantity-input"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.label}>Unit</Text>
              <TextInput
                style={styles.input}
                placeholder="each"
                value={unit}
                onChangeText={setUnit}
                testID="unit-input"
              />
            </View>
          </View>

          {/* ── PRODUCT IMAGE PICKER (NEW) ── */}
          <ProductImagePicker onImageSelected={setImageData} />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            testID="submit-report-btn"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>Submit Report</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  closeBtn: { padding: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1A1A1A',
  },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  submitBtn: {
    backgroundColor: '#0277BD',
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
