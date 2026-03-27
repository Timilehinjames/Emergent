/**
 * frontend/app/(tabs)/index.tsx
 * TriniSaver Home Screen
 *
 * Changes from spec:
 *  1. Ad banner carousel sits IMMEDIATELY below the shopping list section
 *  2. Featured products = horizontal auto-scrolling carousel, 2 visible rows
 *  3. "Scan Price Tag to Compare" → "Tap to Compare"
 *  4. Flag-as-Outdated UI fully wired (was needs_retesting)
 *  5. image_url shown on every price-report card
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Animated,
  TextInput,
  Platform,
  Modal,
  ActionSheetIOS,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Palette (design_guidelines.json) ────────────────────────────────────────
const C = {
  primary:       '#0277BD',
  primaryLight:  '#E3F2FD',
  accent:        '#FFB300',
  accentDark:    '#E65100',
  surface:       '#FFFFFF',
  bg:            '#F5F7FA',
  text:          '#1A1A1A',
  textSec:       '#64748B',
  border:        '#E2E8F0',
  success:       '#2E7D32',
  error:         '#EF4444',
};

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8001';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdBanner {
  id: string;
  title: string;
  subtitle?: string;
  image_url?: string;
  bg_color: string;
  cta?: string;
}

interface FeaturedProduct {
  id: string;
  name: string;
  price: number;
  unit?: string;
  store: string;
  image_url?: string | null;
  is_outdated?: boolean;
  flag_count?: number;
}

interface PriceReport {
  id: string;
  item_name: string;
  price: number;
  unit?: string;
  store: string;
  region?: string;
  image_url?: string | null;
  is_outdated?: boolean;
  flag_count?: number;
  reporter_name?: string;
}

interface ShoppingListItem {
  id: string;
  name: string;
  checked: boolean;
}

// ─── Ad Banner Carousel ───────────────────────────────────────────────────────
const AD_BANNERS: AdBanner[] = [
  {
    id: 'ad1',
    title: 'PriceSmart Members',
    subtitle: 'Save up to 30% this weekend',
    bg_color: '#0277BD',
    cta: 'Shop Now',
  },
  {
    id: 'ad2',
    title: 'Massy Stores',
    subtitle: 'Fresh produce daily from 7am',
    bg_color: '#2E7D32',
    cta: 'See Deals',
  },
  {
    id: 'ad3',
    title: 'Hi-Lo Food Stores',
    subtitle: 'Weekend specials — don\'t miss out!',
    bg_color: '#E65100',
    cta: 'View Specials',
  },
  {
    id: 'ad4',
    title: 'Penny Wise',
    subtitle: 'Household essentials at low prices',
    bg_color: '#6A1B9A',
    cta: 'Browse',
  },
];

const AdCarousel: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoScroll = useCallback(() => {
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % AD_BANNERS.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
  }, []);

  useEffect(() => {
    startAutoScroll();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoScroll]);

  const renderAd = ({ item }: { item: AdBanner }) => (
    <TouchableOpacity
      style={[styles.adCard, { backgroundColor: item.bg_color, width: SCREEN_W - 32 }]}
      activeOpacity={0.88}
      testID={`ad-banner-${item.id}`}
    >
      <View style={styles.adTextBlock}>
        <Text style={styles.adTitle}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.adSubtitle}>{item.subtitle}</Text> : null}
        {item.cta ? (
          <View style={styles.adCta}>
            <Text style={styles.adCtaText}>{item.cta} →</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.adEmoji}>🛍️</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.adContainer}>
      <FlatList
        ref={flatRef}
        data={AD_BANNERS}
        renderItem={renderAd}
        keyExtractor={i => i.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={SCREEN_W - 32}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 0 }}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32));
          setActiveIndex(idx);
          if (timerRef.current) clearInterval(timerRef.current);
          startAutoScroll();
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_W - 32,
          offset: (SCREEN_W - 32) * index,
          index,
        })}
      />
      {/* Dots */}
      <View style={styles.adDots}>
        {AD_BANNERS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
};

// ─── Featured Products 2-Row Rolling Carousel ────────────────────────────────
const FeaturedCarousel: React.FC<{
  products: FeaturedProduct[];
  onFlag: (id: string) => void;
}> = ({ products, onFlag }) => {
  const scrollRef = useRef<ScrollView>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const posRef    = useRef(0);

  // Split into two rows
  const row1 = products.filter((_, i) => i % 2 === 0);
  const row2 = products.filter((_, i) => i % 2 === 1);

  useEffect(() => {
    if (products.length < 2) return;
    timerRef.current = setInterval(() => {
      posRef.current += 160;
      // Reset when gone too far
      const maxScroll = Math.ceil(products.length / 2) * 160;
      if (posRef.current >= maxScroll) posRef.current = 0;
      scrollRef.current?.scrollTo({ x: posRef.current, animated: true });
    }, 2800);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [products.length]);

  const renderCard = (item: FeaturedProduct) => (
    <TouchableOpacity
      key={item.id}
      style={styles.featCard}
      activeOpacity={0.85}
      testID={`feat-product-${item.id}`}
      onPress={() => router.push({ pathname: '/compare', params: { item: item.name } })}
    >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.featImage} resizeMode="cover" />
      ) : (
        <View style={styles.featPlaceholder}>
          <Text style={styles.featPlaceholderText}>
            {item.name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
      {item.is_outdated && (
        <View style={styles.outdatedBadge}><Text style={styles.outdatedText}>OLD</Text></View>
      )}
      <View style={styles.featInfo}>
        <Text style={styles.featName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.featPrice}>TT${item.price.toFixed(2)}</Text>
        <Text style={styles.featStore} numberOfLines={1}>{item.store}</Text>
      </View>
      <TouchableOpacity
        style={styles.featFlagBtn}
        onPress={() => onFlag(item.id)}
        testID={`flag-featured-${item.id}`}
      >
        <Ionicons name="flag-outline" size={12} color={C.textSec} />
        {(item.flag_count ?? 0) > 0 && (
          <Text style={styles.featFlagCount}>{item.flag_count}</Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (!products.length) return null;

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.featScroll}
        onScrollBeginDrag={() => {
          if (timerRef.current) clearInterval(timerRef.current);
        }}
      >
        <View style={styles.featRows}>
          <View style={styles.featRow}>{row1.map(renderCard)}</View>
          {row2.length > 0 && <View style={styles.featRow}>{row2.map(renderCard)}</View>}
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Price Report Card ────────────────────────────────────────────────────────
const ReportCard: React.FC<{
  item: PriceReport;
  onFlag: (id: string) => void;
}> = ({ item, onFlag }) => (
  <TouchableOpacity
    style={styles.reportCard}
    activeOpacity={0.88}
    testID={`report-card-${item.id}`}
  >
    <View style={styles.reportImageBox}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.reportImage} resizeMode="cover" />
      ) : (
        <View style={[styles.reportImage, styles.reportPlaceholder]}>
          <Text style={styles.reportPlaceholderText}>
            {item.item_name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
    <View style={styles.reportInfo}>
      <Text style={styles.reportName} numberOfLines={1}>{item.item_name}</Text>
      <Text style={styles.reportStore}>{item.store}</Text>
      {item.region ? <Text style={styles.reportRegion}>{item.region}</Text> : null}
    </View>
    <View style={styles.reportRight}>
      <Text style={styles.reportPrice}>TT${item.price.toFixed(2)}</Text>
      {item.unit ? <Text style={styles.reportUnit}>{item.unit}</Text> : null}
      <TouchableOpacity
        onPress={() => onFlag(item.id)}
        style={styles.flagButton}
        testID={`flag-report-${item.id}`}
      >
        <Ionicons
          name={item.is_outdated ? 'flag' : 'flag-outline'}
          size={14}
          color={item.is_outdated ? C.error : C.textSec}
        />
        {(item.flag_count ?? 0) > 0 && (
          <Text style={styles.flagCount}>{item.flag_count}</Text>
        )}
      </TouchableOpacity>
      {item.is_outdated && (
        <View style={styles.outdatedBadgeSm}>
          <Text style={styles.outdatedTextSm}>OUTDATED</Text>
        </View>
      )}
    </View>
  </TouchableOpacity>
);

// ─── Shopping List ────────────────────────────────────────────────────────────
const ShoppingList: React.FC<{
  items: ShoppingListItem[];
  onToggle: (id: string) => void;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
}> = ({ items, onToggle, onAdd, onRemove }) => {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setInput('');
  };

  return (
    <View style={styles.shoppingList}>
      <View style={styles.shoppingInputRow}>
        <TextInput
          style={styles.shoppingInput}
          placeholder="Add item to list…"
          placeholderTextColor={C.textSec}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          testID="shopping-list-input"
        />
        <TouchableOpacity
          style={styles.shoppingAddBtn}
          onPress={handleAdd}
          testID="shopping-list-add"
        >
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyListText}>Your list is empty. Add items above.</Text>
      ) : (
        items.map(item => (
          <View key={item.id} style={styles.shoppingItem}>
            <TouchableOpacity
              onPress={() => onToggle(item.id)}
              style={styles.shoppingCheckBox}
              testID={`shopping-toggle-${item.id}`}
            >
              <Ionicons
                name={item.checked ? 'checkbox' : 'square-outline'}
                size={20}
                color={item.checked ? C.success : C.border}
              />
            </TouchableOpacity>
            <Text style={[styles.shoppingItemText, item.checked && styles.strikethrough]}>
              {item.name}
            </Text>
            <TouchableOpacity
              onPress={() => onRemove(item.id)}
              testID={`shopping-remove-${item.id}`}
            >
              <Ionicons name="close" size={16} color={C.textSec} />
            </TouchableOpacity>
          </View>
        ))
      )}
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets   = useSafeAreaInsets();
  const [token,        setToken]        = useState<string | null>(null);
  const [userName,     setUserName]     = useState('');
  const [reports,      setReports]      = useState<PriceReport[]>([]);
  const [featured,     setFeatured]     = useState<FeaturedProduct[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  
  // Capture Your Item states
  const [captureModalVisible, setCaptureModalVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedItem, setDetectedItem] = useState<string | null>(null);
  const [showCaptureOptions, setShowCaptureOptions] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('auth_token');
      const n = await AsyncStorage.getItem('user_name');
      setToken(t);
      setUserName(n ?? 'Saver');
      await fetchData(t);
    })();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (tk?: string | null) => {
    try {
      const auth = tk ?? token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) headers['Authorization'] = `Bearer ${auth}`;

      const [repRes, prodRes] = await Promise.all([
        fetch(`${API_BASE}/api/price-reports/recent?limit=10`, { headers }),
        fetch(`${API_BASE}/api/products?limit=12`, { headers }),
      ]);

      if (repRes.ok) {
        const data = await repRes.json();
        setReports(
          (data ?? []).slice(0, 10).map((r: any) => ({
            id:            r.report_id ?? r._id ?? r.id,
            item_name:     r.product_name ?? r.item_name,
            price:         r.price,
            unit:          r.unit,
            store:         r.store_name ?? r.store,
            region:        r.region,
            image_url:     r.image_url ?? null,
            is_outdated:   r.is_outdated ?? false,
            flag_count:    r.flag_count ?? 0,
            reporter_name: r.reporter_name,
          })),
        );
      }

      if (prodRes.ok) {
        const data = await prodRes.json();
        setFeatured(
          (data ?? []).slice(0, 12).map((p: any) => ({
            id:         p.product_id ?? p._id ?? p.id,
            name:       p.name,
            price:      p.price ?? 0,
            unit:       p.unit,
            store:      p.store ?? '',
            image_url:  p.image_b64 ? `data:image/jpeg;base64,${p.image_b64}` : (p.image_url ?? null),
            is_outdated: p.is_outdated ?? false,
            flag_count: p.flag_count ?? 0,
          })),
        );
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  // ── Flag handler ──────────────────────────────────────────────────────────
  const handleFlag = useCallback(async (itemId: string, itemType: 'report' | 'product' = 'report') => {
    if (!token) {
      Alert.alert('Sign in required', 'Please sign in to flag items.');
      return;
    }
    try {
      const endpoint = itemType === 'report'
        ? `${API_BASE}/api/flag/report/${itemId}`
        : `${API_BASE}/api/flag/product/${itemId}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        // Optimistic update
        setReports(prev =>
          prev.map(r =>
            r.id === itemId
              ? {
                  ...r,
                  flag_count: (r.flag_count ?? 0) + 1,
                  is_outdated: ((r.flag_count ?? 0) + 1) >= 3 ? true : r.is_outdated,
                }
              : r,
          ),
        );
        Alert.alert('Flagged', 'Thank you for keeping data accurate!');
      } else if (res.status === 400) {
        Alert.alert('Already flagged', 'You have already flagged this item.');
      }
    } catch {
      Alert.alert('Error', 'Could not flag item. Please try again.');
    }
  }, [token]);

  // ── Shopping list ─────────────────────────────────────────────────────────
  const addToList = useCallback((name: string) => {
    setShoppingList(prev => [
      ...prev,
      { id: Date.now().toString(), name, checked: false },
    ]);
  }, []);

  const toggleItem = useCallback((id: string) => {
    setShoppingList(prev =>
      prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setShoppingList(prev => prev.filter(i => i.id !== id));
  }, []);

  // ── Capture Your Item handlers ───────────────────────────────────────────
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to capture your items.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      setCaptureModalVisible(true);
      await analyzeItemImage(result.assets[0].base64 || '');
    }
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery access is needed to pick your item images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setCapturedImage(result.assets[0].uri);
      setCaptureModalVisible(true);
      await analyzeItemImage(result.assets[0].base64 || '');
    }
  };

  const analyzeItemImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    setDetectedItem(null);

    try {
      const response = await fetch(`${API_BASE}/api/identify-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: base64Image }),
      });

      if (response.ok) {
        const data = await response.json();
        setDetectedItem(data.item_name || '');
      } else {
        setDetectedItem('');
      }
    } catch {
      setDetectedItem('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddToShoppingList = () => {
    if (isAnalyzing) {
      Alert.alert('Still Analyzing', 'Please wait while we identify your item.');
      return;
    }

    const itemName = detectedItem?.trim();
    if (!itemName) {
      Alert.alert('Item Name Required', 'Please enter the name of the item to add to your list.');
      return;
    }

    addToList(itemName);
    setCaptureModalVisible(false);
    setCapturedImage(null);
    setDetectedItem(null);
    Alert.alert('✅ Added!', `"${itemName}" has been added to your shopping list.`);
  };

  const handleCaptureOption = () => {
    // Show capture options modal (works on all platforms including web)
    setShowCaptureOptions(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
        }
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good day, {userName} 👋</Text>
            <Text style={styles.headerSub}>DohPayDaTT — Smart Shopping</Text>
          </View>
          <TouchableOpacity
            style={styles.compareBtn}
            onPress={() => router.push('/(tabs)/compare')}
            testID="tap-to-compare-btn"
          >
            <Ionicons name="pricetag-outline" size={18} color="#FFF" />
            <Text style={styles.compareBtnText}>Compare</Text>
          </TouchableOpacity>
        </View>

        {/* ── Capture Your Item Button ──────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.captureButton}
          onPress={handleCaptureOption}
          testID="capture-item-btn"
        >
          <Text style={styles.captureButtonIcon}>📷</Text>
          <View>
            <Text style={styles.captureButtonText}>Capture Your Item</Text>
            <Text style={styles.captureButtonSubtext}>Add items to your shopping list with AI</Text>
          </View>
        </TouchableOpacity>

        {/* ── Shopping List ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛒 Shopping List</Text>
          <ShoppingList
            items={shoppingList}
            onToggle={toggleItem}
            onAdd={addToList}
            onRemove={removeItem}
          />
        </View>

        {/* ── AD BANNERS — directly below shopping list ───────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏷️ Deals & Promotions</Text>
          <AdCarousel />
        </View>

        {/* ── Featured Products 2-row rolling ────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>⭐ Featured Products</Text>
            <TouchableOpacity onPress={() => router.push('/compare')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {featured.length > 0 ? (
            <FeaturedCarousel
              products={featured}
              onFlag={id => handleFlag(id, 'product')}
            />
          ) : (
            <Text style={styles.emptyText}>No featured products yet.</Text>
          )}
        </View>

        {/* ── Recent Price Reports ────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Recent Reports</Text>
            <TouchableOpacity onPress={() => router.push('/compare')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {reports.length > 0 ? (
            reports.map(item => (
              <ReportCard
                key={item.id}
                item={item}
                onFlag={id => handleFlag(id, 'report')}
              />
            ))
          ) : (
            <Text style={styles.emptyText}>No price reports yet. Be the first!</Text>
          )}
        </View>
      </ScrollView>

      {/* ── Capture Modal ───────────────────────────────────────────────────── */}
      <Modal
        visible={captureModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCaptureModalVisible(false)}
      >
        <View style={styles.captureModal}>
          <View style={styles.captureModalHeader}>
            <Text style={styles.captureModalTitle}>Add to Shopping List</Text>
            <TouchableOpacity onPress={() => setCaptureModalVisible(false)}>
              <Text style={styles.captureModalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {capturedImage && (
            <Image
              source={{ uri: capturedImage }}
              style={styles.capturedImagePreview}
              resizeMode="cover"
            />
          )}

          {isAnalyzing ? (
            <View style={styles.analyzingContainer}>
              <ActivityIndicator size="large" color="#E63946" />
              <Text style={styles.analyzingText}>Identifying item with AI...</Text>
            </View>
          ) : (
            <View style={styles.itemNameContainer}>
              <Text style={styles.itemNameLabel}>Item Name</Text>
              <TextInput
                style={styles.itemNameInput}
                value={detectedItem ?? ''}
                onChangeText={setDetectedItem}
                placeholder="e.g. Anchor Butter 500g"
                placeholderTextColor="#999"
              />
              {detectedItem && detectedItem.length > 0 && (
                <Text style={styles.detectedLabel}>✨ AI detected — you can edit this</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.addToListButton, isAnalyzing && styles.addToListButtonDisabled]}
            onPress={handleAddToShoppingList}
            disabled={isAnalyzing}
          >
            <Text style={styles.addToListButtonText}>+ Add to Shopping List</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Capture Options Modal ───────────────────────────────────────────── */}
      <Modal
        visible={showCaptureOptions}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCaptureOptions(false)}
      >
        <TouchableOpacity
          style={styles.captureOptionsOverlay}
          activeOpacity={1}
          onPress={() => setShowCaptureOptions(false)}
        >
          <View style={styles.captureOptionsContainer}>
            <Text style={styles.captureOptionsTitle}>Capture Your Item</Text>
            <Text style={styles.captureOptionsSubtitle}>How would you like to add your item?</Text>
            
            <TouchableOpacity
              style={styles.captureOptionBtn}
              onPress={() => {
                setShowCaptureOptions(false);
                handleTakePhoto();
              }}
            >
              <Ionicons name="camera" size={24} color="#E63946" />
              <Text style={styles.captureOptionText}>📷 Take Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.captureOptionBtn}
              onPress={() => {
                setShowCaptureOptions(false);
                handlePickFromGallery();
              }}
            >
              <Ionicons name="images" size={24} color="#3b82f6" />
              <Text style={styles.captureOptionText}>🖼️ Choose from Gallery</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.captureOptionCancelBtn}
              onPress={() => setShowCaptureOptions(false)}
            >
              <Text style={styles.captureOptionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  scroll:        { flex: 1 },
  content:       { paddingTop: 8 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  greeting:      { fontSize: 18, fontWeight: '700', color: C.text },
  headerSub:     { fontSize: 12, color: C.textSec, marginTop: 2 },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    gap: 6,
  },
  compareBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  // Sections
  section:       { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: C.text },
  seeAll:        { fontSize: 13, color: C.primary, fontWeight: '600' },
  emptyText:     { fontSize: 13, color: C.textSec, textAlign: 'center', paddingVertical: 16 },

  // Ads
  adContainer:   { marginBottom: 4 },
  adCard: {
    height: 110,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  adTextBlock:  { flex: 1, gap: 3 },
  adTitle:      { fontSize: 16, fontWeight: '800', color: '#FFF' },
  adSubtitle:   { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  adCta: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  adCtaText:    { color: '#FFF', fontSize: 12, fontWeight: '700' },
  adEmoji:      { fontSize: 36, marginLeft: 12 },
  adDots:       { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  dot:          { width: 6, height: 6, borderRadius: 3, backgroundColor: C.border },
  dotActive:    { backgroundColor: C.primary, width: 14 },

  // Featured (2-row carousel)
  featScroll:   { paddingRight: 8 },
  featRows:     { gap: 10 },
  featRow:      { flexDirection: 'row', gap: 10 },
  featCard: {
    width: 148,
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featImage:          { width: '100%', height: 96 },
  featPlaceholder: {
    width: '100%',
    height: 96,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featPlaceholderText: { fontSize: 22, fontWeight: '800', color: C.primary },
  featInfo:            { padding: 8, gap: 2 },
  featName:            { fontSize: 12, fontWeight: '700', color: C.text },
  featPrice:           { fontSize: 14, fontWeight: '800', color: C.accentDark },
  featStore:           { fontSize: 11, color: C.textSec },
  featFlagBtn:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6, gap: 3 },
  featFlagCount:       { fontSize: 10, color: C.error, fontWeight: '700' },
  outdatedBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: C.error, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  outdatedText:   { color: '#FFF', fontSize: 8, fontWeight: '800' },

  // Report cards
  reportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  reportImageBox:     { width: 64, height: 64 },
  reportImage:        { width: 64, height: 64 },
  reportPlaceholder: {
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportPlaceholderText: { fontSize: 16, fontWeight: '800', color: C.primary },
  reportInfo:            { flex: 1, paddingHorizontal: 10, gap: 2 },
  reportName:            { fontSize: 14, fontWeight: '700', color: C.text },
  reportStore:           { fontSize: 12, color: C.primary, fontWeight: '600' },
  reportRegion:          { fontSize: 11, color: C.textSec },
  reportRight:           { alignItems: 'flex-end', paddingRight: 12, gap: 3 },
  reportPrice:           { fontSize: 15, fontWeight: '800', color: C.accentDark },
  reportUnit:            { fontSize: 10, color: C.textSec },
  flagButton:            { flexDirection: 'row', alignItems: 'center', gap: 3, padding: 4 },
  flagCount:             { fontSize: 10, color: C.error, fontWeight: '700' },
  outdatedBadgeSm: {
    backgroundColor: C.error, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  outdatedTextSm: { color: '#FFF', fontSize: 8, fontWeight: '800' },

  // Shopping list
  shoppingList: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  shoppingInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  shoppingInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: C.text,
  },
  shoppingAddBtn: {
    width: 44, height: 44,
    backgroundColor: C.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 10,
  },
  shoppingCheckBox:   {},
  shoppingItemText:   { flex: 1, fontSize: 14, color: C.text },
  strikethrough:      { textDecorationLine: 'line-through', color: C.textSec },
  emptyListText:      { fontSize: 13, color: C.textSec, textAlign: 'center', paddingVertical: 8 },

  // Capture Your Item
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E63946',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 14,
    shadowColor: '#E63946',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  captureButtonIcon: { fontSize: 28 },
  captureButtonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  captureButtonSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

  // Capture Modal
  captureModal: { flex: 1, backgroundColor: '#fff', padding: 20 },
  captureModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: Platform.OS === 'ios' ? 40 : 0,
  },
  captureModalTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e' },
  captureModalClose: { fontSize: 24, color: '#666', padding: 4 },
  capturedImagePreview: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: '#f0f0f0',
  },
  analyzingContainer: { alignItems: 'center', paddingVertical: 24 },
  analyzingText: { marginTop: 12, fontSize: 15, color: '#666' },
  itemNameContainer: { marginBottom: 24 },
  itemNameLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  itemNameInput: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a2e',
    backgroundColor: '#fafafa',
  },
  detectedLabel: { fontSize: 12, color: '#2ecc71', marginTop: 6 },
  addToListButton: {
    backgroundColor: '#E63946',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addToListButtonDisabled: { opacity: 0.5 },
  addToListButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Capture Options Modal
  captureOptionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureOptionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
  },
  captureOptionsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
  },
  captureOptionsSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  captureOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    marginBottom: 12,
    gap: 12,
  },
  captureOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  captureOptionCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  captureOptionCancelText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
});
