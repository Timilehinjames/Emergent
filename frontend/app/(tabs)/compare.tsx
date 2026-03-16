import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { Spacing, Radius, Shadows, STORE_NAMES, UNITS } from '../../src/constants/theme';

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
  const [items, setItems] = useState<CompareItem[]>([
    { id: '1', product_name: '', store_name: STORE_NAMES[0], price: '', quantity: '1', unit: 'each' },
    { id: '2', product_name: '', store_name: STORE_NAMES[3], price: '', quantity: '1', unit: 'each' },
  ]);
  const [results, setResults] = useState<any>(null);
  const [comparing, setComparing] = useState(false);
  const [tripMode, setTripMode] = useState(false);
  const [tripResult, setTripResult] = useState<any>(null);
  const [timeOfDay, setTimeOfDay] = useState('midday');
  const [showStoreModal, setShowStoreModal] = useState<string | null>(null);
  const [showUnitModal, setShowUnitModal] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async (search = '') => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/products?search=${encodeURIComponent(search)}`);
      if (resp.ok) {
        const data = await resp.json();
        setProducts(data);
      }
    } catch {}
  };

  const updateItem = (id: string, field: string, value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: Date.now().toString(), product_name: '', store_name: STORE_NAMES[0], price: '', quantity: '1', unit: 'each'
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
    const storeNames = [...new Set(items.map(i => i.store_name))];
    if (storeNames.length < 2) {
      Alert.alert('Tip', 'Select different stores to plan a trip between them');
      return;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(`${BACKEND_URL}/api/trip/plan`, {
        method: 'POST', headers,
        body: JSON.stringify({ stores: storeNames, time_of_day: timeOfDay }),
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

  return (
    <SafeAreaView style={s.container} testID="compare-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>Price Compare</Text>
          <Text style={s.subtitle}>Compare unit prices across T&T stores</Text>

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
              <TouchableOpacity
                testID={`store-select-${idx}`}
                style={s.selectBtn}
                onPress={() => setShowStoreModal(item.id)}
              >
                <Ionicons name="storefront-outline" size={18} color={colors.textSecondary} />
                <Text style={s.selectText} numberOfLines={1}>{item.store_name}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
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

      {/* Store Modal */}
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
              data={STORE_NAMES}
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
                  <Text style={s.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
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
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBg,
    borderRadius: Radius.m, paddingHorizontal: Spacing.m, height: 44, gap: Spacing.s, marginBottom: Spacing.s,
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
    padding: Spacing.l, maxHeight: '60%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  modalItem: { paddingVertical: Spacing.m, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalItemText: { fontSize: 16, color: colors.text },
});
