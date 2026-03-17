import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal, FlatList, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, Shadows, UNITS, TT_REGIONS } from '../../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface CompareItem {
  id: string;
  product_name: string;
  store_name: string;
  price: string;
  quantity: string;
  unit: string;
}

export default function CompareScreen() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const [storeNames, setStoreNames] = useState<string[]>([]);
  const [items, setItems] = useState<CompareItem[]>([
    { id: '1', product_name: '', store_name: '', price: '', quantity: '1', unit: 'each' },
    { id: '2', product_name: '', store_name: '', price: '', quantity: '1', unit: 'each' },
  ]);
  const [results, setResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);
  const [tripMode, setTripMode] = useState(false);
  const [tripResult, setTripResult] = useState<any>(null);
  const [timeOfDay, setTimeOfDay] = useState('midday');
  const [showStoreModal, setShowStoreModal] = useState<string | null>(null);
  const [showUnitModal, setShowUnitModal] = useState<string | null>(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreRegion, setNewStoreRegion] = useState('East-West Corridor');
  const [newStoreType, setNewStoreType] = useState('supermarket');
  const [addingStore, setAddingStore] = useState(false);
  
  // Scan to Compare states
  const [showScanModal, setShowScanModal] = useState(false);
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [communityPrices, setCommunityPrices] = useState<any[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/stores`);
      if (resp.ok) {
        const data = await resp.json();
        const names = data.map((s: any) => s.name);
        setStoreNames(names);
        // Set default stores for items if not yet set
        setItems(prev => prev.map((item, idx) => ({
          ...item,
          store_name: item.store_name || names[idx] || names[0] || ''
        })));
      }
    } catch {}
  };

  const addStore = async () => {
    if (!newStoreName.trim()) {
      Alert.alert('Error', 'Please enter a store name');
      return;
    }
    setAddingStore(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/stores`, {
        method: 'POST', headers,
        body: JSON.stringify({
          name: newStoreName.trim(),
          type: newStoreType,
          region: newStoreRegion,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        Alert.alert('Store Added!', `${data.store.name} added. You earned ${data.points_earned} points!`);
        setNewStoreName('');
        setShowAddStoreModal(false);
        fetchStores();
      } else {
        const err = await resp.json().catch(() => ({}));
        Alert.alert('Error', err.detail || 'Failed to add store');
      }
    } catch {
      Alert.alert('Error', 'Failed to add store');
    } finally {
      setAddingStore(false);
    }
  };

  // Scan to Compare functions
  const pickImage = async (useCamera: boolean) => {
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', `Please allow ${useCamera ? 'camera' : 'gallery'} access`);
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });

      if (!result.canceled && result.assets[0].base64) {
        setScannedImage(result.assets[0].base64);
        setScanResult(null);
        setCommunityPrices([]);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const scanForPrice = async () => {
    if (!scannedImage) return;
    setScanning(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const resp = await fetch(`${BACKEND_URL}/api/scan/shelf-tag`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image_base64: scannedImage }),
      });
      
      if (resp.ok) {
        const data = await resp.json();
        setScanResult(data);
        // Search for community prices of this product
        if (data.product_name) {
          fetchCommunityPrices(data.product_name);
        }
      } else {
        Alert.alert('Scan Failed', 'Could not read the price tag. Try again.');
      }
    } catch {
      Alert.alert('Error', 'Failed to scan');
    } finally {
      setScanning(false);
    }
  };

  const fetchCommunityPrices = async (productName: string) => {
    setLoadingPrices(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const resp = await fetch(`${BACKEND_URL}/api/price-reports/search?product=${encodeURIComponent(productName)}&limit=10`, {
        headers
      });
      
      if (resp.ok) {
        const data = await resp.json();
        setCommunityPrices(data);
      }
    } catch {} finally {
      setLoadingPrices(false);
    }
  };

  const addScannedToCompare = () => {
    if (!scanResult) return;
    const newItem: CompareItem = {
      id: Date.now().toString(),
      product_name: scanResult.product_name || 'Scanned Product',
      store_name: storeNames[0] || '',
      price: scanResult.price?.toString() || '',
      quantity: scanResult.quantity?.toString() || '1',
      unit: scanResult.unit || 'each',
    };
    setItems(prev => [...prev, newItem]);
    setShowScanModal(false);
    resetScan();
    Alert.alert('Added!', 'Product added to comparison list');
  };

  const resetScan = () => {
    setScannedImage(null);
    setScanResult(null);
    setCommunityPrices([]);
  };

  const updateItem = (id: string, field: string, value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now().toString(), product_name: '', store_name: storeNames[0] || '', price: '', quantity: '1', unit: 'each'
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 2) return;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const compare = async () => {
    const validItems = items.filter(i => i.price && parseFloat(i.price) > 0);
    if (validItems.length < 2) {
      Alert.alert('Error', 'Add at least 2 items with prices');
      return;
    }
    setComparing(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/compare/unit-price`, {
        method: 'POST', headers,
        body: JSON.stringify({
          items: validItems.map(i => ({
            product_name: i.product_name || 'Product',
            store_name: i.store_name,
            price: parseFloat(i.price),
            quantity: parseFloat(i.quantity) || 1,
            unit: i.unit,
          }))
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to compare prices');
    } finally {
      setComparing(false);
    }
  };

  const planTrip = async () => {
    const uniqueStores = [...new Set(items.map(i => i.store_name))];
    if (uniqueStores.length < 2) {
      Alert.alert('Tip', 'Select different stores to plan a trip between them');
      return;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/trip/plan`, {
        method: 'POST', headers,
        body: JSON.stringify({ stores: uniqueStores, time_of_day: timeOfDay }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setTripResult(data);
      }
    } catch {
      Alert.alert('Error', 'Failed to plan trip');
    }
  };

  const s = createStyles(colors);
  const STORE_TYPES = ['supermarket', 'wholesale', 'pharmacy', 'convenience', 'market'];

  return (
    <SafeAreaView style={s.container} testID="compare-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Price Compare</Text>
          <Text style={s.subtitle}>Compare unit prices across T&T stores</Text>

          {/* Scan to Compare Button */}
          <TouchableOpacity
            testID="scan-compare-btn"
            style={s.scanCompareBtn}
            onPress={() => setShowScanModal(true)}
          >
            <Ionicons name="camera" size={22} color={colors.primaryForeground} />
            <Text style={s.scanCompareBtnText}>Scan Price Tag to Compare</Text>
          </TouchableOpacity>

          {/* Toggle: Compare vs Trip */}
          <View style={s.toggleRow}>
            <TouchableOpacity
              testID="compare-mode-btn"
              style={[s.toggleBtn, !tripMode && s.toggleActive]}
              onPress={() => setTripMode(false)}
            >
              <Ionicons name="swap-horizontal" size={18} color={!tripMode ? colors.primaryForeground : colors.textSecondary} />
              <Text style={[s.toggleText, !tripMode && s.toggleActiveText]}>Compare</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="trip-mode-btn"
              style={[s.toggleBtn, tripMode && s.toggleActive]}
              onPress={() => setTripMode(true)}
            >
              <Ionicons name="car" size={18} color={tripMode ? colors.primaryForeground : colors.textSecondary} />
              <Text style={[s.toggleText, tripMode && s.toggleActiveText]}>Trip Planner</Text>
            </TouchableOpacity>
          </View>

          {/* Items */}
          {items.map((item, idx) => (
            <View key={item.id} style={s.itemCard}>
              <View style={s.itemHeader}>
                <Text style={s.itemLabel}>Item {idx + 1}</Text>
                {items.length > 2 && (
                  <TouchableOpacity testID={`remove-item-${idx}`} onPress={() => removeItem(item.id)}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                testID={`product-name-${idx}`}
                style={s.textInput}
                placeholder="Product name (e.g. Rice 5kg)"
                placeholderTextColor={colors.textSecondary}
                value={item.product_name}
                onChangeText={(v) => updateItem(item.id, 'product_name', v)}
              />
              <View style={s.storeSelectRow}>
                <TouchableOpacity
                  testID={`store-select-${idx}`}
                  style={[s.selectBtn, { flex: 1 }]}
                  onPress={() => setShowStoreModal(item.id)}
                >
                  <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
                  <Text style={s.selectText} numberOfLines={1}>{item.store_name || 'Select Store'}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={s.priceRow}>
                <View style={[s.priceInput, { flex: 1.5 }]}>
                  <Text style={s.priceLabel}>Price (TTD)</Text>
                  <TextInput
                    testID={`price-input-${idx}`}
                    style={s.textInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    value={item.price}
                    onChangeText={(v) => updateItem(item.id, 'price', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[s.priceInput, { flex: 1 }]}>
                  <Text style={s.priceLabel}>Qty</Text>
                  <TextInput
                    testID={`qty-input-${idx}`}
                    style={s.textInput}
                    placeholder="1"
                    placeholderTextColor={colors.textSecondary}
                    value={item.quantity}
                    onChangeText={(v) => updateItem(item.id, 'quantity', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={[s.priceInput, { flex: 1 }]}>
                  <Text style={s.priceLabel}>Unit</Text>
                  <TouchableOpacity
                    testID={`unit-select-${idx}`}
                    style={s.unitBtn}
                    onPress={() => setShowUnitModal(item.id)}
                  >
                    <Text style={s.unitBtnText}>{item.unit}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity testID="add-item-btn" style={s.addBtn} onPress={addItem}>
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={s.addBtnText}>Add Another Item</Text>
          </TouchableOpacity>

          {/* Compare Button */}
          <TouchableOpacity testID="compare-submit-btn" style={s.compareBtn} onPress={compare} disabled={comparing}>
            {comparing ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="analytics" size={20} color={colors.primaryForeground} />
                <Text style={s.compareBtnText}>Compare Unit Prices</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Results */}
          {results && (
            <View style={s.resultsCard}>
              <Text style={s.resultsTitle}>Results</Text>
              {results.cheapest && (
                <View style={s.winnerBanner}>
                  <Ionicons name="trophy" size={22} color={colors.accent} />
                  <View style={{ flex: 1, marginLeft: Spacing.s }}>
                    <Text style={s.winnerLabel}>Best Value</Text>
                    <Text style={s.winnerStore}>{results.cheapest.store_name}</Text>
                    <Text style={s.winnerPrice}>${results.cheapest.unit_price} per {results.cheapest.per_unit}</Text>
                  </View>
                </View>
              )}
              {results.potential_savings_per_unit > 0 && (
                <Text style={s.savingsText}>
                  Save ${results.potential_savings_per_unit} per {results.results[0]?.per_unit} by choosing the cheapest option
                </Text>
              )}
              {results.results?.map((r: any, i: number) => (
                <View key={i} style={[s.resultRow, i === 0 && { borderLeftColor: colors.success, borderLeftWidth: 3 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultStore}>{r.store_name}</Text>
                    <Text style={s.resultDetail}>{r.product_name} - {r.quantity} {r.unit} @ ${r.original_price}</Text>
                  </View>
                  <Text style={[s.resultUnitPrice, i === 0 && { color: colors.success }]}>
                    ${r.unit_price}/{r.per_unit}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Trip Planner Section */}
          {tripMode && (
            <View style={s.tripCard}>
              <Text style={s.tripTitle}>Time vs Money</Text>
              <Text style={s.tripSubtitle}>Is the split trip worth the drive?</Text>
              <View style={s.timeRow}>
                {['morning', 'midday', 'afternoon', 'evening_rush'].map(t => (
                  <TouchableOpacity
                    key={t}
                    testID={`time-${t}-btn`}
                    style={[s.timeChip, timeOfDay === t && { backgroundColor: colors.primary }]}
                    onPress={() => setTimeOfDay(t)}
                  >
                    <Text style={[s.timeChipText, timeOfDay === t && { color: colors.primaryForeground }]}>
                      {t === 'evening_rush' ? 'Rush Hour' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity testID="plan-trip-btn" style={s.tripBtn} onPress={planTrip}>
                <Ionicons name="navigate" size={18} color={colors.secondaryForeground} />
                <Text style={s.tripBtnText}>Calculate Trip</Text>
              </TouchableOpacity>
              {tripResult && (
                <View style={s.tripResults}>
                  <View style={[s.tripAlert, { backgroundColor: tripResult.is_worth_it ? colors.success + '20' : colors.warning + '20' }]}>
                    <Ionicons
                      name={tripResult.is_worth_it ? 'checkmark-circle' : 'warning'}
                      size={22}
                      color={tripResult.is_worth_it ? colors.success : colors.warning}
                    />
                    <Text style={[s.tripAlertText, { color: tripResult.is_worth_it ? colors.success : colors.warning }]}>
                      {tripResult.suggestion}
                    </Text>
                  </View>
                  <View style={s.tripStats}>
                    <View style={s.tripStat}>
                      <Text style={s.tripStatValue}>{tripResult.total_distance_km} km</Text>
                      <Text style={s.tripStatLabel}>Distance</Text>
                    </View>
                    <View style={s.tripStat}>
                      <Text style={s.tripStatValue}>{tripResult.total_time_min} min</Text>
                      <Text style={s.tripStatLabel}>Est. Time</Text>
                    </View>
                    <View style={s.tripStat}>
                      <Text style={[s.tripStatValue, { color: colors.warning }]}>{tripResult.traffic_condition}</Text>
                      <Text style={s.tripStatLabel}>Traffic</Text>
                    </View>
                  </View>
                  {tripResult.legs?.map((leg: any, i: number) => (
                    <View key={i} style={s.legRow}>
                      <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                      <Text style={s.legText}>{leg.from} → {leg.to} ({leg.distance_km}km, ~{leg.adjusted_time_min}min)</Text>
                    </View>
                  ))}
                  <Text style={s.mockedBadge}>Traffic data is MOCKED for demo</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Store Selection Modal */}
      <Modal visible={!!showStoreModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Store</Text>
              <TouchableOpacity testID="close-store-modal" onPress={() => setShowStoreModal(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={storeNames}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`store-option-${item}`}
                  style={s.modalItem}
                  onPress={() => {
                    if (showStoreModal) updateItem(showStoreModal, 'store_name', item);
                    setShowStoreModal(null);
                  }}
                >
                  <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
                  <Text style={s.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
              ListFooterComponent={
                <TouchableOpacity
                  testID="add-new-store-btn"
                  style={s.addStoreBtn}
                  onPress={() => { setShowStoreModal(null); setShowAddStoreModal(true); }}
                >
                  <Ionicons name="add-circle" size={22} color={colors.secondary} />
                  <Text style={[s.modalItemText, { color: colors.secondary, fontWeight: '700' }]}>Add New Store</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Unit Modal */}
      <Modal visible={!!showUnitModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Unit</Text>
              <TouchableOpacity testID="close-unit-modal" onPress={() => setShowUnitModal(null)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={UNITS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`unit-option-${item}`}
                  style={s.modalItem}
                  onPress={() => {
                    if (showUnitModal) updateItem(showUnitModal, 'unit', item);
                    setShowUnitModal(null);
                  }}
                >
                  <Text style={s.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Add Store Modal */}
      <Modal visible={showAddStoreModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add New Store</Text>
              <TouchableOpacity testID="close-add-store-modal" onPress={() => setShowAddStoreModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={s.addStoreForm}>
                <Text style={s.addStoreLabel}>Store Name</Text>
                <TextInput
                  testID="new-store-name-input"
                  style={s.textInput}
                  placeholder="e.g. Randy's Supermarket - San Juan"
                  placeholderTextColor={colors.textSecondary}
                  value={newStoreName}
                  onChangeText={setNewStoreName}
                />
                <Text style={s.addStoreLabel}>Store Type</Text>
                <View style={s.typeRow}>
                  {STORE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      testID={`store-type-${t}`}
                      style={[s.typeChip, newStoreType === t && { backgroundColor: colors.primary }]}
                      onPress={() => setNewStoreType(t)}
                    >
                      <Text style={[s.typeChipText, newStoreType === t && { color: colors.primaryForeground }]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={s.addStoreLabel}>Zone</Text>
                <View style={s.typeRow}>
                  {TT_REGIONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      testID={`new-store-region-${r}`}
                      style={[s.typeChip, newStoreRegion === r && { backgroundColor: colors.primary }]}
                      onPress={() => setNewStoreRegion(r)}
                    >
                      <Text style={[s.typeChipText, newStoreRegion === r && { color: colors.primaryForeground }]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity testID="submit-new-store-btn" style={s.submitStoreBtn} onPress={addStore} disabled={addingStore}>
                  {addingStore ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Ionicons name="add-circle" size={20} color={colors.primaryForeground} />
                      <Text style={s.submitStoreBtnText}>Add Store (+1 pt)</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Scan to Compare Modal */}
      <Modal visible={showScanModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.scanModalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Scan to Compare</Text>
              <TouchableOpacity onPress={() => { setShowScanModal(false); resetScan(); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {!scannedImage ? (
                <>
                  <Text style={s.scanInstructions}>
                    Take a photo of a price tag or product label to scan and compare prices
                  </Text>
                  <View style={s.scanButtons}>
                    <TouchableOpacity
                      testID="scan-camera-btn"
                      style={s.scanCameraBtn}
                      onPress={() => pickImage(true)}
                    >
                      <Ionicons name="camera" size={32} color={colors.primaryForeground} />
                      <Text style={s.scanCameraBtnText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="scan-gallery-btn"
                      style={s.scanGalleryBtn}
                      onPress={() => pickImage(false)}
                    >
                      <Ionicons name="images" size={28} color={colors.primary} />
                      <Text style={s.scanGalleryBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${scannedImage}` }}
                    style={s.scannedPreview}
                    resizeMode="contain"
                  />
                  
                  {!scanResult && (
                    <TouchableOpacity
                      testID="scan-price-btn"
                      style={s.readPriceBtn}
                      onPress={scanForPrice}
                      disabled={scanning}
                    >
                      {scanning ? (
                        <ActivityIndicator color={colors.primaryForeground} />
                      ) : (
                        <>
                          <Ionicons name="scan" size={20} color={colors.primaryForeground} />
                          <Text style={s.readPriceBtnText}>Read Price</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {scanResult && (
                    <View style={s.scanResultCard}>
                      <Text style={s.scanResultTitle}>Scanned Product</Text>
                      <View style={s.scanResultRow}>
                        <Text style={s.scanResultLabel}>Product:</Text>
                        <Text style={s.scanResultValue}>{scanResult.product_name || 'Unknown'}</Text>
                      </View>
                      <View style={s.scanResultRow}>
                        <Text style={s.scanResultLabel}>Price:</Text>
                        <Text style={[s.scanResultValue, { color: colors.primary, fontWeight: '800' }]}>
                          ${scanResult.price?.toFixed(2) || '0.00'} TTD
                        </Text>
                      </View>
                      {scanResult.quantity && scanResult.unit && (
                        <View style={s.scanResultRow}>
                          <Text style={s.scanResultLabel}>Size:</Text>
                          <Text style={s.scanResultValue}>{scanResult.quantity} {scanResult.unit}</Text>
                        </View>
                      )}
                      
                      <TouchableOpacity
                        testID="add-to-compare-btn"
                        style={s.addToCompareBtn}
                        onPress={addScannedToCompare}
                      >
                        <Ionicons name="add-circle" size={20} color={colors.primaryForeground} />
                        <Text style={s.addToCompareBtnText}>Add to Compare List</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Community Prices */}
                  {scanResult && (
                    <View style={s.communitySection}>
                      <Text style={s.communityTitle}>Community Prices</Text>
                      {loadingPrices ? (
                        <ActivityIndicator color={colors.primary} style={{ marginVertical: Spacing.m }} />
                      ) : communityPrices.length > 0 ? (
                        communityPrices.map((report, i) => (
                          <View key={i} style={s.communityPriceCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={s.communityStoreName}>{report.store_name}</Text>
                              <Text style={s.communityProductName}>{report.product_name}</Text>
                            </View>
                            <View style={s.communityPriceCol}>
                              <Text style={[s.communityPrice, {
                                color: report.price < scanResult.price ? colors.success : 
                                       report.price > scanResult.price ? colors.error : colors.text
                              }]}>
                                ${report.price?.toFixed(2)}
                              </Text>
                              {report.price < scanResult.price && (
                                <Text style={s.savingsTag}>
                                  Save ${(scanResult.price - report.price).toFixed(2)}
                                </Text>
                              )}
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={s.noCommunityPrices}>
                          No community reports found for this product yet.
                        </Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={s.retakeBtn}
                    onPress={resetScan}
                  >
                    <Ionicons name="refresh" size={18} color={colors.primary} />
                    <Text style={s.retakeBtnText}>Take New Photo</Text>
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
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: Spacing.l },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: Radius.l, padding: 4, marginBottom: Spacing.l },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.m, gap: Spacing.xs,
  },
  toggleActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  toggleActiveText: { color: colors.primaryForeground },
  itemCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m,
    marginBottom: Spacing.m, ...Shadows.card,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.s },
  itemLabel: { fontSize: 14, fontWeight: '700', color: colors.primary },
  textInput: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text, marginBottom: Spacing.s,
  },
  storeSelectRow: { flexDirection: 'row', gap: Spacing.s, marginBottom: Spacing.s },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg,
    borderRadius: Radius.m, paddingHorizontal: Spacing.m, height: 44, gap: Spacing.s,
  },
  selectText: { flex: 1, fontSize: 14, color: colors.text },
  priceRow: { flexDirection: 'row', gap: Spacing.s },
  priceInput: {},
  priceLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  unitBtn: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  unitBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.s, paddingVertical: Spacing.m,
  },
  addBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  compareBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    height: 52, justifyContent: 'center', alignItems: 'center', gap: Spacing.s,
    marginBottom: Spacing.l, ...Shadows.floating,
  },
  compareBtnText: { fontSize: 17, fontWeight: '700', color: colors.primaryForeground },
  resultsCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l,
    marginBottom: Spacing.l, ...Shadows.card,
  },
  resultsTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  winnerBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.accent + '15', borderRadius: Radius.m, padding: Spacing.m, marginBottom: Spacing.m,
  },
  winnerLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  winnerStore: { fontSize: 16, fontWeight: '700', color: colors.text },
  winnerPrice: { fontSize: 14, fontWeight: '600', color: colors.secondary },
  savingsText: { fontSize: 14, color: colors.success, fontWeight: '600', marginBottom: Spacing.m },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.s, paddingLeft: Spacing.s,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultStore: { fontSize: 14, fontWeight: '600', color: colors.text },
  resultDetail: { fontSize: 12, color: colors.textSecondary },
  resultUnitPrice: { fontSize: 16, fontWeight: '800', color: colors.primary },
  tripCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l,
    marginTop: Spacing.m, ...Shadows.card,
  },
  tripTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  tripSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: Spacing.m },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s, marginBottom: Spacing.m },
  timeChip: {
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, backgroundColor: colors.inputBg,
  },
  timeChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tripBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.s,
  },
  tripBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondaryForeground },
  tripResults: { marginTop: Spacing.m },
  tripAlert: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    padding: Spacing.m, borderRadius: Radius.m, marginBottom: Spacing.m,
  },
  tripAlertText: { flex: 1, fontSize: 14, fontWeight: '600' },
  tripStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: Spacing.m },
  tripStat: { alignItems: 'center' },
  tripStatValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  tripStatLabel: { fontSize: 12, color: colors.textSecondary },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, paddingVertical: 4 },
  legText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  mockedBadge: {
    fontSize: 11, fontWeight: '600', color: colors.warning,
    textAlign: 'center', marginTop: Spacing.m,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.l, maxHeight: '70%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    paddingVertical: Spacing.m, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modalItemText: { fontSize: 16, color: colors.text },
  addStoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    paddingVertical: Spacing.l, borderTopWidth: 2, borderTopColor: colors.border, marginTop: Spacing.s,
  },
  addStoreForm: { paddingBottom: Spacing.xl },
  addStoreLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: Spacing.xs, marginTop: Spacing.m },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s, marginBottom: Spacing.s },
  typeChip: {
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, backgroundColor: colors.inputBg,
  },
  typeChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  submitStoreBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 48, justifyContent: 'center', alignItems: 'center', gap: Spacing.s, marginTop: Spacing.l,
  },
  submitStoreBtnText: { fontSize: 16, fontWeight: '700', color: colors.secondaryForeground },
  // Scan to Compare styles
  scanCompareBtn: {
    flexDirection: 'row', backgroundColor: colors.accent, borderRadius: Radius.l,
    paddingVertical: Spacing.m, paddingHorizontal: Spacing.l, alignItems: 'center',
    justifyContent: 'center', gap: Spacing.s, marginBottom: Spacing.l,
  },
  scanCompareBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  scanModalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.l, maxHeight: '90%',
  },
  scanInstructions: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    marginBottom: Spacing.l, lineHeight: 22,
  },
  scanButtons: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.l },
  scanCameraBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: Radius.l,
    paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.s,
  },
  scanCameraBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
  scanGalleryBtn: {
    flex: 0.5, backgroundColor: colors.primary + '15', borderRadius: Radius.l,
    paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.s,
    borderWidth: 2, borderColor: colors.primary,
  },
  scanGalleryBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  scannedPreview: {
    width: '100%', height: 200, borderRadius: Radius.l,
    backgroundColor: colors.inputBg, marginBottom: Spacing.m,
  },
  readPriceBtn: {
    flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    height: 50, justifyContent: 'center', alignItems: 'center', gap: Spacing.s, marginBottom: Spacing.m,
  },
  readPriceBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
  scanResultCard: {
    backgroundColor: colors.background, borderRadius: Radius.l, padding: Spacing.m,
    marginBottom: Spacing.m, borderWidth: 1, borderColor: colors.border,
  },
  scanResultTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: Spacing.s },
  scanResultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  scanResultLabel: { fontSize: 14, color: colors.textSecondary },
  scanResultValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  addToCompareBtn: {
    flexDirection: 'row', backgroundColor: colors.success, borderRadius: Radius.full,
    height: 44, justifyContent: 'center', alignItems: 'center', gap: Spacing.s, marginTop: Spacing.m,
  },
  addToCompareBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  communitySection: { marginTop: Spacing.m },
  communityTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: Spacing.s },
  communityPriceCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background,
    borderRadius: Radius.m, padding: Spacing.m, marginBottom: Spacing.s,
    borderWidth: 1, borderColor: colors.border,
  },
  communityStoreName: { fontSize: 14, fontWeight: '600', color: colors.text },
  communityProductName: { fontSize: 12, color: colors.textSecondary },
  communityPriceCol: { alignItems: 'flex-end' },
  communityPrice: { fontSize: 18, fontWeight: '800' },
  savingsTag: {
    fontSize: 11, fontWeight: '700', color: colors.success,
    backgroundColor: colors.success + '15', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, marginTop: 2,
  },
  noCommunityPrices: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.m },
  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, paddingVertical: Spacing.m,
  },
  retakeBtnText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
