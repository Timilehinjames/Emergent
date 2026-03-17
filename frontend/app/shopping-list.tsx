import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { Spacing, Radius, Shadows } from '../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ListItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  'Grains & Rice': 'leaf',
  'Cooking Oil': 'water',
  'Baking': 'cafe',
  'Meat & Poultry': 'fast-food',
  'Dairy': 'nutrition',
  'Toiletries': 'body',
  'Cleaning': 'sparkles',
  'Personal Care': 'heart',
  'Beverages': 'beer',
  'Snacks': 'pizza',
  'General': 'cart',
};

export default function ShoppingListScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ listId?: string }>();

  const [categories, setCategories] = useState<Record<string, any[]>>({});
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [listName, setListName] = useState('My Shopping List');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState('General');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [existingListId, setExistingListId] = useState<string | null>(params.listId || null);
  
  // Smart Split states
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitResult, setSplitResult] = useState<any>(null);
  const [loadingSplit, setLoadingSplit] = useState(false);
  const [preferSingleStore, setPreferSingleStore] = useState(false);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catRes, listsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/product-categories`, { headers: headers() }).then(r => r.ok ? r.json() : {}),
        existingListId
          ? fetch(`${BACKEND_URL}/api/shopping-lists`, { headers: headers() }).then(r => r.ok ? r.json() : [])
          : Promise.resolve([]),
      ]);
      setCategories(catRes);
      if (existingListId && listsRes.length > 0) {
        const list = listsRes.find((l: any) => l.list_id === existingListId);
        if (list) {
          setListName(list.name);
          setListItems(list.items || []);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const isInList = (productName: string) => listItems.some(i => i.name === productName);

  const addProduct = (product: any, category: string) => {
    if (isInList(product.name)) {
      setListItems(prev => prev.filter(i => i.name !== product.name));
      return;
    }
    setListItems(prev => [...prev, {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: product.name,
      category,
      quantity: 1,
      unit: product.unit_type || 'each',
      checked: false,
    }]);
  };

  const addCustomItem = () => {
    if (!customItemName.trim()) return;
    if (isInList(customItemName.trim())) {
      Alert.alert('Already added', 'This item is already in your list');
      return;
    }
    setListItems(prev => [...prev, {
      id: `custom_${Date.now()}`,
      name: customItemName.trim(),
      category: customItemCategory,
      quantity: 1,
      unit: 'each',
      checked: false,
    }]);
    setCustomItemName('');
    setShowCustomInput(false);
  };

  const updateQuantity = (id: string, delta: number) => {
    setListItems(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.quantity + delta);
        return { ...i, quantity: newQty };
      }
      return i;
    }));
  };

  const removeItem = (id: string) => {
    setListItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleCheck = (id: string) => {
    setListItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const saveList = async () => {
    if (listItems.length === 0) {
      Alert.alert('Empty List', 'Add some items before saving');
      return;
    }
    setSaving(true);
    try {
      if (existingListId) {
        await fetch(`${BACKEND_URL}/api/shopping-lists/${existingListId}`, {
          method: 'PUT', headers: headers(),
          body: JSON.stringify({ name: listName, items: listItems }),
        });
      } else {
        const resp = await fetch(`${BACKEND_URL}/api/shopping-lists`, {
          method: 'POST', headers: headers(),
          body: JSON.stringify({ name: listName, items: listItems }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setExistingListId(data.list_id);
        }
      }
      Alert.alert('Saved!', 'Your shopping list has been saved', [
        { text: 'Keep Editing' },
        { text: 'Go Home', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save list');
    } finally {
      setSaving(false);
    }
  };

  const getSmartSplit = async () => {
    if (listItems.length === 0) {
      Alert.alert('Empty List', 'Add some items to get store recommendations');
      return;
    }
    setLoadingSplit(true);
    setShowSplitModal(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/smart-split`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          items: listItems,
          region: user?.region || 'East-West Corridor',
          is_pricesmart_member: user?.is_pricesmart_member || false,
          prefer_single_store: preferSingleStore,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setSplitResult(data);
      } else {
        Alert.alert('Error', 'Failed to get recommendations');
        setShowSplitModal(false);
      }
    } catch {
      Alert.alert('Error', 'Network error');
      setShowSplitModal(false);
    } finally {
      setLoadingSplit(false);
    }
  };

  const s = createStyles(colors);
  const catKeys = Object.keys(categories);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} testID="shopping-list-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TextInput
            testID="list-name-input"
            style={s.listNameInput}
            value={listName}
            onChangeText={setListName}
            placeholder="List name"
            placeholderTextColor={colors.textSecondary}
          />
          <TouchableOpacity testID="save-list-btn" style={s.saveBtn} onPress={saveList} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Ionicons name="checkmark" size={22} color={colors.primaryForeground} />
            )}
          </TouchableOpacity>
        </View>

        {/* My List Summary */}
        {listItems.length > 0 && (
          <View style={s.listSummary}>
            <Text style={s.summaryText}>{listItems.length} item{listItems.length !== 1 ? 's' : ''} in list</Text>
            <TouchableOpacity testID="clear-list-btn" onPress={() => Alert.alert('Clear List?', 'Remove all items?', [
              { text: 'Cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => setListItems([]) },
            ])}>
              <Text style={s.clearText}>Clear All</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Current List Items */}
          {listItems.length > 0 && (
            <View style={s.currentListCard}>
              {listItems.map((item) => (
                <View key={item.id} style={s.listItemRow} testID={`list-item-${item.id}`}>
                  <TouchableOpacity testID={`check-${item.id}`} onPress={() => toggleCheck(item.id)} style={s.checkbox}>
                    <Ionicons
                      name={item.checked ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={item.checked ? colors.success : colors.textSecondary}
                    />
                  </TouchableOpacity>
                  <View style={s.listItemInfo}>
                    <Text style={[s.listItemName, item.checked && s.listItemChecked]}>{item.name}</Text>
                    <Text style={s.listItemCategory}>{item.category}</Text>
                  </View>
                  <View style={s.qtyControls}>
                    <TouchableOpacity testID={`qty-minus-${item.id}`} onPress={() => updateQuantity(item.id, -1)} style={s.qtyBtn}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={s.qtyText}>{item.quantity}</Text>
                    <TouchableOpacity testID={`qty-plus-${item.id}`} onPress={() => updateQuantity(item.id, 1)} style={s.qtyBtn}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity testID={`remove-${item.id}`} onPress={() => removeItem(item.id)} style={s.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Add Custom Item */}
          <TouchableOpacity
            testID="add-custom-toggle"
            style={s.addCustomToggle}
            onPress={() => setShowCustomInput(!showCustomInput)}
          >
            <Ionicons name="add-circle" size={22} color={colors.secondary} />
            <Text style={s.addCustomText}>Add Custom Item</Text>
          </TouchableOpacity>

          {showCustomInput && (
            <View style={s.customInputCard}>
              <TextInput
                testID="custom-item-input"
                style={s.customInput}
                placeholder="Item name (e.g. Pepper Sauce)"
                placeholderTextColor={colors.textSecondary}
                value={customItemName}
                onChangeText={setCustomItemName}
                onSubmitEditing={addCustomItem}
                returnKeyType="done"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
                {[...catKeys, 'General'].filter((v, i, a) => a.indexOf(v) === i).map(cat => (
                  <TouchableOpacity
                    key={cat}
                    testID={`custom-cat-${cat}`}
                    style={[s.catChip, customItemCategory === cat && { backgroundColor: colors.primary }]}
                    onPress={() => setCustomItemCategory(cat)}
                  >
                    <Text style={[s.catChipText, customItemCategory === cat && { color: colors.primaryForeground }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity testID="add-custom-btn" style={s.addCustomBtn} onPress={addCustomItem}>
                <Ionicons name="add" size={18} color={colors.primaryForeground} />
                <Text style={s.addCustomBtnText}>Add to List</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Browse by Category */}
          <Text style={s.sectionTitle}>Browse Products</Text>
          <Text style={s.sectionSubtitle}>Tap to add items to your list</Text>

          {catKeys.map(cat => {
            const products = categories[cat] || [];
            const isExpanded = expandedCats.has(cat);
            const iconName = CATEGORY_ICONS[cat] || 'grid';
            const addedCount = listItems.filter(i => i.category === cat).length;

            return (
              <View key={cat} style={s.categoryCard}>
                <TouchableOpacity
                  testID={`category-${cat}`}
                  style={s.categoryHeader}
                  onPress={() => toggleCategory(cat)}
                >
                  <View style={[s.categoryIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name={iconName as any} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.categoryName}>{cat}</Text>
                    <Text style={s.categoryCount}>{products.length} items</Text>
                  </View>
                  {addedCount > 0 && (
                    <View style={s.addedBadge}>
                      <Text style={s.addedBadgeText}>{addedCount}</Text>
                    </View>
                  )}
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                {isExpanded && (
                  <View style={s.productList}>
                    {products.map((product) => {
                      const inList = isInList(product.name);
                      return (
                        <TouchableOpacity
                          key={product.product_id}
                          testID={`product-${product.product_id}`}
                          style={[s.productRow, inList && { backgroundColor: colors.success + '12' }]}
                          onPress={() => addProduct(product, cat)}
                        >
                          <Ionicons
                            name={inList ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={inList ? colors.success : colors.textSecondary}
                          />
                          <View style={{ flex: 1, marginLeft: Spacing.s }}>
                            <Text style={s.productName}>{product.name}</Text>
                            {product.brand ? <Text style={s.productBrand}>{product.brand}</Text> : null}
                          </View>
                          {inList && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Floating Buttons */}
        {listItems.length > 0 && (
          <View style={s.floatingBtns}>
            <TouchableOpacity testID="smart-split-btn" style={s.splitBtn} onPress={getSmartSplit}>
              <Ionicons name="git-branch" size={20} color={colors.secondaryForeground} />
              <Text style={s.splitBtnText}>Smart Split</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="floating-save-btn" style={s.floatingBtn} onPress={saveList} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Ionicons name="save" size={20} color={colors.primaryForeground} />
                  <Text style={s.floatingBtnText}>Save ({listItems.length})</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Smart Split Modal */}
        <Modal visible={showSplitModal} transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Smart Split</Text>
                <TouchableOpacity onPress={() => setShowSplitModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              {loadingSplit ? (
                <View style={s.modalCenter}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={s.modalLoadingText}>Analyzing your list...</Text>
                </View>
              ) : splitResult ? (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Traffic Status */}
                  <View style={[s.trafficCard, { backgroundColor: splitResult.traffic_status?.is_peak_hours ? colors.warning + '15' : colors.success + '15' }]}>
                    <Ionicons
                      name={splitResult.traffic_status?.is_peak_hours ? 'car' : 'checkmark-circle'}
                      size={24}
                      color={splitResult.traffic_status?.is_peak_hours ? colors.warning : colors.success}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.trafficTitle, { color: splitResult.traffic_status?.is_peak_hours ? colors.warning : colors.success }]}>
                        {splitResult.traffic_status?.is_peak_hours ? 'Peak Traffic Hours' : 'Low Traffic'}
                      </Text>
                      <Text style={s.trafficDesc}>
                        Est. {splitResult.traffic_status?.delay_per_store_mins} min delay per store in {splitResult.traffic_status?.region}
                      </Text>
                    </View>
                  </View>

                  {/* Recommendation */}
                  <View style={s.recommendCard}>
                    <Ionicons name="bulb" size={22} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.recommendTitle}>Recommendation</Text>
                      <Text style={s.recommendText}>{splitResult.recommendation?.reason}</Text>
                    </View>
                  </View>

                  {/* Single Store Toggle */}
                  <TouchableOpacity
                    style={s.toggleRow}
                    onPress={() => { setPreferSingleStore(!preferSingleStore); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.toggleLabel}>Prefer Single Store</Text>
                      <Text style={s.toggleDesc}>Skip multi-store to save time</Text>
                    </View>
                    <Ionicons
                      name={preferSingleStore ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={preferSingleStore ? colors.primary : colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {/* Store Splits */}
                  <Text style={s.splitsTitle}>
                    Store Breakdown ({splitResult.stores_needed} store{splitResult.stores_needed !== 1 ? 's' : ''})
                  </Text>
                  
                  {splitResult.splits?.map((split: any, i: number) => (
                    <View key={i} style={s.storeCard}>
                      <View style={s.storeHeader}>
                        <Ionicons name="storefront" size={20} color={colors.primary} />
                        <Text style={s.storeName}>{split.store}</Text>
                        <View style={s.savingsBadge}>
                          <Text style={s.savingsText}>~{split.average_savings_percent}% off</Text>
                        </View>
                      </View>
                      <Text style={s.storeSpecialty}>
                        Best for: {split.specialties?.join(', ') || 'General items'}
                      </Text>
                      {split.membership_required && (
                        <View style={s.membershipTag}>
                          <Ionicons name="card" size={14} color={colors.warning} />
                          <Text style={s.membershipText}>Membership Required</Text>
                        </View>
                      )}
                      <View style={s.storeItems}>
                        {split.items?.slice(0, 5).map((item: any, j: number) => (
                          <View key={j} style={s.splitItemRow}>
                            <Ionicons name="checkmark" size={16} color={colors.success} />
                            <Text style={s.splitItemName}>{item.name}</Text>
                            <Text style={s.splitItemQty}>x{item.quantity}</Text>
                          </View>
                        ))}
                        {split.items?.length > 5 && (
                          <Text style={s.moreItemsText}>+{split.items.length - 5} more items</Text>
                        )}
                      </View>
                    </View>
                  ))}

                  {/* Summary */}
                  <View style={s.summaryCard}>
                    <View style={s.summaryRow}>
                      <Text style={s.summaryLabel}>Total Items</Text>
                      <Text style={s.summaryValue}>{splitResult.total_items}</Text>
                    </View>
                    <View style={s.summaryRow}>
                      <Text style={s.summaryLabel}>Est. Travel Time</Text>
                      <Text style={s.summaryValue}>{splitResult.traffic_status?.total_estimated_travel_mins} mins</Text>
                    </View>
                    <View style={s.summaryRow}>
                      <Text style={s.summaryLabel}>Avg. Savings</Text>
                      <Text style={[s.summaryValue, { color: colors.success }]}>~{splitResult.average_savings_percent}%</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={s.refreshSplitBtn}
                    onPress={getSmartSplit}
                  >
                    <Ionicons name="refresh" size={18} color={colors.primary} />
                    <Text style={s.refreshSplitText}>Recalculate</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : null}
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: Spacing.xs },
  listNameInput: {
    flex: 1, fontSize: 18, fontWeight: '700', color: colors.text,
    paddingVertical: Spacing.s,
  },
  saveBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  listSummary: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    backgroundColor: colors.surface,
  },
  summaryText: { fontSize: 14, fontWeight: '600', color: colors.text },
  clearText: { fontSize: 14, fontWeight: '600', color: colors.error },
  scrollContent: { padding: Spacing.m, paddingBottom: 100 },
  currentListCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l,
    marginBottom: Spacing.m, overflow: 'hidden', ...Shadows.card,
  },
  listItemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  checkbox: { marginRight: Spacing.s },
  listItemInfo: { flex: 1 },
  listItemName: { fontSize: 15, fontWeight: '600', color: colors.text },
  listItemChecked: { textDecorationLine: 'line-through', color: colors.textSecondary },
  listItemCategory: { fontSize: 12, color: colors.textSecondary },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: Spacing.s },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.inputBg, justifyContent: 'center', alignItems: 'center',
  },
  qtyText: { fontSize: 15, fontWeight: '700', color: colors.text, minWidth: 20, textAlign: 'center' },
  removeBtn: { padding: 4 },
  addCustomToggle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    paddingVertical: Spacing.m,
  },
  addCustomText: { fontSize: 15, fontWeight: '600', color: colors.secondary },
  customInputCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.l, ...Shadows.card,
  },
  customInput: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m,
    paddingHorizontal: Spacing.m, height: 44, fontSize: 15, color: colors.text,
    marginBottom: Spacing.s,
  },
  catChipScroll: { marginBottom: Spacing.s },
  catChip: {
    paddingHorizontal: Spacing.m, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: colors.inputBg, marginRight: Spacing.xs,
  },
  catChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  addCustomBtn: {
    flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.m,
    height: 40, justifyContent: 'center', alignItems: 'center', gap: Spacing.xs,
  },
  addCustomBtnText: { fontSize: 14, fontWeight: '700', color: colors.secondaryForeground },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: Spacing.s },
  sectionSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: Spacing.m },
  categoryCard: {
    backgroundColor: colors.surface, borderRadius: Radius.l,
    marginBottom: Spacing.s, overflow: 'hidden', ...Shadows.card,
  },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    padding: Spacing.m,
  },
  categoryIcon: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  categoryName: { fontSize: 16, fontWeight: '700', color: colors.text },
  categoryCount: { fontSize: 12, color: colors.textSecondary },
  addedBadge: {
    backgroundColor: colors.success, width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.xs,
  },
  addedBadgeText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  productList: { borderTopWidth: 1, borderTopColor: colors.border },
  productRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.m,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  productName: { fontSize: 14, fontWeight: '600', color: colors.text },
  productBrand: { fontSize: 12, color: colors.textSecondary },
  floatingBtns: {
    position: 'absolute', bottom: 20, left: Spacing.l, right: Spacing.l,
    flexDirection: 'row', gap: Spacing.s,
  },
  splitBtn: {
    flex: 0.45, flexDirection: 'row', backgroundColor: colors.secondary, borderRadius: Radius.full,
    height: 54, justifyContent: 'center', alignItems: 'center', gap: Spacing.xs,
    shadowColor: colors.secondary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  splitBtnText: { fontSize: 14, fontWeight: '700', color: colors.secondaryForeground },
  floatingBtn: {
    flex: 0.55, flexDirection: 'row', backgroundColor: colors.primary, borderRadius: Radius.full,
    height: 54, justifyContent: 'center', alignItems: 'center', gap: Spacing.s,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 10,
  },
  floatingBtnText: { fontSize: 15, fontWeight: '700', color: colors.primaryForeground },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.l, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  modalCenter: { alignItems: 'center', paddingVertical: Spacing.xxl },
  modalLoadingText: { fontSize: 14, color: colors.textSecondary, marginTop: Spacing.m },
  trafficCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.m,
  },
  trafficTitle: { fontSize: 16, fontWeight: '700' },
  trafficDesc: { fontSize: 13, color: colors.textSecondary },
  recommendCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m,
    backgroundColor: colors.accent + '10', borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.m,
  },
  recommendTitle: { fontSize: 14, fontWeight: '700', color: colors.accent },
  recommendText: { fontSize: 13, color: colors.text },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.l,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  toggleDesc: { fontSize: 12, color: colors.textSecondary },
  splitsTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  storeCard: {
    backgroundColor: colors.background, borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.m,
    borderWidth: 1, borderColor: colors.border,
  },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginBottom: 4 },
  storeName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  savingsBadge: {
    backgroundColor: colors.success + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.s,
  },
  savingsText: { fontSize: 12, fontWeight: '700', color: colors.success },
  storeSpecialty: { fontSize: 12, color: colors.textSecondary, marginBottom: Spacing.xs },
  membershipTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: Spacing.s,
  },
  membershipText: { fontSize: 11, color: colors.warning, fontWeight: '600' },
  storeItems: { marginTop: Spacing.s },
  splitItemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 3 },
  splitItemName: { flex: 1, fontSize: 13, color: colors.text },
  splitItemQty: { fontSize: 12, color: colors.textSecondary },
  moreItemsText: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 4 },
  summaryCard: {
    backgroundColor: colors.primary + '08', borderRadius: Radius.l,
    padding: Spacing.m, marginBottom: Spacing.m,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  refreshSplitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    paddingVertical: Spacing.m,
  },
  refreshSplitText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
