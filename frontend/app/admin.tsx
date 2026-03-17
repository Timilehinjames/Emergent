import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
  RefreshControl, ActivityIndicator, TextInput, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { Spacing, Radius, TT_REGIONS } from '../src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type TabType = 'overview' | 'users' | 'flagged' | 'stores' | 'banners' | 'products';

const PRODUCT_CATEGORIES = [
  'Grains & Rice', 'Cooking Oil', 'Baking', 'Meat & Poultry', 'Dairy',
  'Toiletries', 'Personal Care', 'Cleaning', 'Beverages', 'Snacks', 'General'
];

export default function AdminPanel() {
  const { token } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [flagged, setFlagged] = useState<{ reports: any[]; specials: any[] }>({ reports: [], specials: [] });
  const [stores, setStores] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');

  // Modal states
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [editBanner, setEditBanner] = useState<any>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState<any>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  const checkAdmin = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/admin/check`, { headers: headers() });
      if (resp.ok) {
        const data = await resp.json();
        setIsAdmin(data.is_admin);
        if (!data.is_admin) {
          Alert.alert('Access Denied', 'You do not have admin privileges');
          router.back();
        }
      } else {
        router.back();
      }
    } catch {
      router.back();
    }
  };

  const fetchData = async () => {
    try {
      if (activeTab === 'overview') {
        const resp = await fetch(`${BACKEND_URL}/api/admin/stats`, { headers: headers() });
        if (resp.ok) setStats(await resp.json());
      } else if (activeTab === 'users') {
        const resp = await fetch(`${BACKEND_URL}/api/admin/users?search=${encodeURIComponent(userSearch)}`, { headers: headers() });
        if (resp.ok) {
          const data = await resp.json();
          setUsers(data.users || []);
        }
      } else if (activeTab === 'flagged') {
        const resp = await fetch(`${BACKEND_URL}/api/admin/flagged`, { headers: headers() });
        if (resp.ok) setFlagged(await resp.json());
      } else if (activeTab === 'stores') {
        const resp = await fetch(`${BACKEND_URL}/api/admin/stores`, { headers: headers() });
        if (resp.ok) setStores(await resp.json());
      } else if (activeTab === 'banners') {
        const resp = await fetch(`${BACKEND_URL}/api/admin/banners`, { headers: headers() });
        if (resp.ok) setBanners(await resp.json());
      } else if (activeTab === 'products') {
        const queryParams = new URLSearchParams();
        if (productSearch) queryParams.append('search', productSearch);
        if (productCategoryFilter) queryParams.append('category', productCategoryFilter);
        const resp = await fetch(`${BACKEND_URL}/api/admin/products?${queryParams}`, { headers: headers() });
        if (resp.ok) setProducts(await resp.json());
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      fetchData();
    }
  }, [activeTab, isAdmin, userSearch, productSearch, productCategoryFilter]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // Admin Actions
  const deleteReport = async (reportId: string) => {
    Alert.alert('Delete Report', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/admin/reports/${reportId}`, { method: 'DELETE', headers: headers() });
          if (resp.ok) { Alert.alert('Deleted'); fetchData(); }
        } catch { Alert.alert('Error'); }
      }}
    ]);
  };

  const deleteSpecial = async (specialId: string) => {
    Alert.alert('Delete Special', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/admin/specials/${specialId}`, { method: 'DELETE', headers: headers() });
          if (resp.ok) { Alert.alert('Deleted'); fetchData(); }
        } catch { Alert.alert('Error'); }
      }}
    ]);
  };

  const clearFlags = async (itemType: string, itemId: string) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/admin/clear-flags/${itemType}/${itemId}`, { method: 'PUT', headers: headers() });
      if (resp.ok) { Alert.alert('Flags Cleared'); fetchData(); }
    } catch { Alert.alert('Error'); }
  };

  const updateStoreStatus = async (storeId: string, status: string) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/admin/stores/${storeId}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ status })
      });
      if (resp.ok) { Alert.alert('Store Updated'); fetchData(); }
    } catch { Alert.alert('Error'); }
  };

  const deleteStore = async (storeId: string) => {
    Alert.alert('Delete Store', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/admin/stores/${storeId}`, { method: 'DELETE', headers: headers() });
          if (resp.ok) { Alert.alert('Deleted'); fetchData(); }
        } catch { Alert.alert('Error'); }
      }}
    ]);
  };

  const toggleUserBan = async (userId: string, isBanned: boolean) => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ is_banned: !isBanned })
      });
      if (resp.ok) { Alert.alert(!isBanned ? 'User Banned' : 'User Unbanned'); fetchData(); }
    } catch { Alert.alert('Error'); }
  };

  const saveBanner = async () => {
    if (!editBanner?.title) { Alert.alert('Title required'); return; }
    try {
      const method = editBanner.banner_id ? 'PUT' : 'POST';
      const url = editBanner.banner_id
        ? `${BACKEND_URL}/api/admin/banners/${editBanner.banner_id}`
        : `${BACKEND_URL}/api/admin/banners`;
      const resp = await fetch(url, { method, headers: headers(), body: JSON.stringify(editBanner) });
      if (resp.ok) {
        Alert.alert('Saved');
        setShowBannerModal(false);
        setEditBanner(null);
        fetchData();
      }
    } catch { Alert.alert('Error'); }
  };

  const deleteBanner = async (bannerId: string) => {
    Alert.alert('Delete Banner', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/admin/banners/${bannerId}`, { method: 'DELETE', headers: headers() });
          if (resp.ok) { Alert.alert('Deleted'); fetchData(); }
        } catch { Alert.alert('Error'); }
      }}
    ]);
  };

  // Product Management
  const saveProduct = async () => {
    if (!editProduct?.name || !editProduct?.category) {
      Alert.alert('Name and category required');
      return;
    }
    try {
      const method = editProduct.product_id ? 'PUT' : 'POST';
      const url = editProduct.product_id
        ? `${BACKEND_URL}/api/admin/products/${editProduct.product_id}`
        : `${BACKEND_URL}/api/admin/products`;
      const resp = await fetch(url, { method, headers: headers(), body: JSON.stringify(editProduct) });
      if (resp.ok) {
        Alert.alert('Saved');
        setShowProductModal(false);
        setEditProduct(null);
        fetchData();
      }
    } catch { Alert.alert('Error'); }
  };

  const deleteProduct = async (productId: string) => {
    Alert.alert('Delete Product', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          const resp = await fetch(`${BACKEND_URL}/api/admin/products/${productId}`, { method: 'DELETE', headers: headers() });
          if (resp.ok) { Alert.alert('Deleted'); fetchData(); }
        } catch { Alert.alert('Error'); }
      }}
    ]);
  };

  const s = createStyles(colors);

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} testID="admin-panel">
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Admin Panel</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar}>
        {(['overview', 'users', 'flagged', 'stores', 'banners', 'products'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            testID={`admin-tab-${tab}`}
            style={[s.tabBtn, activeTab === tab && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}
          >
            <Ionicons
              name={tab === 'overview' ? 'stats-chart' : tab === 'users' ? 'people' : tab === 'flagged' ? 'flag' : tab === 'stores' ? 'storefront' : tab === 'products' ? 'cube' : 'megaphone'}
              size={18}
              color={activeTab === tab ? colors.primaryForeground : colors.textSecondary}
            />
            <Text style={[s.tabText, activeTab === tab && { color: colors.primaryForeground }]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && stats && (
              <>
                <Text style={s.sectionTitle}>Dashboard Overview</Text>
                <View style={s.statsGrid}>
                  {[
                    { label: 'Total Users', value: stats.total_users, icon: 'people', color: colors.primary },
                    { label: 'Price Reports', value: stats.total_reports, icon: 'document-text', color: colors.secondary },
                    { label: 'Specials', value: stats.total_specials, icon: 'megaphone', color: colors.accent },
                    { label: 'Stores', value: stats.total_stores, icon: 'storefront', color: '#9C27B0' },
                  ].map((stat, i) => (
                    <View key={i} style={s.statCard}>
                      <Ionicons name={stat.icon as any} size={28} color={stat.color} />
                      <Text style={s.statValue}>{stat.value}</Text>
                      <Text style={s.statLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={s.sectionTitle}>Needs Attention</Text>
                <View style={s.alertsGrid}>
                  <View style={[s.alertCard, { borderLeftColor: colors.warning }]}>
                    <Ionicons name="flag" size={24} color={colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertValue}>{stats.flagged_reports + stats.flagged_specials}</Text>
                      <Text style={s.alertLabel}>Flagged Items</Text>
                    </View>
                  </View>
                  <View style={[s.alertCard, { borderLeftColor: colors.error }]}>
                    <Ionicons name="alert-circle" size={24} color={colors.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertValue}>{stats.outdated_reports + stats.outdated_specials}</Text>
                      <Text style={s.alertLabel}>Outdated Items</Text>
                    </View>
                  </View>
                  <View style={[s.alertCard, { borderLeftColor: colors.primary }]}>
                    <Ionicons name="time" size={24} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertValue}>{stats.pending_stores}</Text>
                      <Text style={s.alertLabel}>Pending Stores</Text>
                    </View>
                  </View>
                </View>

                <Text style={s.sectionTitle}>This Week</Text>
                <View style={s.weekStats}>
                  <View style={s.weekStatItem}>
                    <Text style={s.weekStatValue}>{stats.new_users_week}</Text>
                    <Text style={s.weekStatLabel}>New Users</Text>
                  </View>
                  <View style={s.weekStatItem}>
                    <Text style={s.weekStatValue}>{stats.new_reports_week}</Text>
                    <Text style={s.weekStatLabel}>New Reports</Text>
                  </View>
                </View>
              </>
            )}

            {/* USERS TAB */}
            {activeTab === 'users' && (
              <>
                <TextInput
                  testID="admin-user-search"
                  style={s.searchInput}
                  placeholder="Search users by name or email..."
                  placeholderTextColor={colors.textSecondary}
                  value={userSearch}
                  onChangeText={setUserSearch}
                />
                {users.map((user, i) => (
                  <View key={user.user_id} style={s.userCard} testID={`admin-user-${i}`}>
                    <View style={s.userAvatar}>
                      <Text style={s.userAvatarText}>{(user.name || 'U').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.userName}>{user.name}</Text>
                      <Text style={s.userEmail}>{user.email}</Text>
                      <View style={s.userBadges}>
                        <Text style={s.userBadge}>{user.points || 0} pts</Text>
                        <Text style={s.userBadge}>{user.region}</Text>
                        {user.is_admin && <Text style={[s.userBadge, { backgroundColor: colors.primary + '30', color: colors.primary }]}>Admin</Text>}
                        {user.is_banned && <Text style={[s.userBadge, { backgroundColor: colors.error + '30', color: colors.error }]}>Banned</Text>}
                      </View>
                    </View>
                    <TouchableOpacity
                      testID={`ban-user-${i}`}
                      style={[s.actionBtn, { backgroundColor: user.is_banned ? colors.success + '20' : colors.error + '20' }]}
                      onPress={() => toggleUserBan(user.user_id, user.is_banned)}
                    >
                      <Ionicons name={user.is_banned ? 'checkmark' : 'ban'} size={18} color={user.is_banned ? colors.success : colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {users.length === 0 && <Text style={s.emptyText}>No users found</Text>}
              </>
            )}

            {/* FLAGGED TAB */}
            {activeTab === 'flagged' && (
              <>
                <Text style={s.sectionTitle}>Flagged Reports ({flagged.reports.length})</Text>
                {flagged.reports.map((report, i) => (
                  <View key={report.report_id} style={s.flaggedCard} testID={`flagged-report-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.flaggedTitle}>{report.product_name}</Text>
                      <Text style={s.flaggedSub}>{report.store_name} · ${report.price}</Text>
                      <Text style={s.flaggedMeta}>
                        Flags: {report.flag_count} · {report.is_outdated ? 'OUTDATED' : 'Active'}
                      </Text>
                    </View>
                    <View style={s.flaggedActions}>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.success + '20' }]} onPress={() => clearFlags('report', report.report_id)}>
                        <Ionicons name="checkmark" size={18} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.error + '20' }]} onPress={() => deleteReport(report.report_id)}>
                        <Ionicons name="trash" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {flagged.reports.length === 0 && <Text style={s.emptyText}>No flagged reports</Text>}

                <Text style={[s.sectionTitle, { marginTop: Spacing.l }]}>Flagged Specials ({flagged.specials.length})</Text>
                {flagged.specials.map((special, i) => (
                  <View key={special.special_id} style={s.flaggedCard} testID={`flagged-special-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.flaggedTitle}>{special.title}</Text>
                      <Text style={s.flaggedSub}>{special.store_name} · {special.region}</Text>
                      <Text style={s.flaggedMeta}>
                        Flags: {special.flag_count} · {special.is_outdated ? 'OUTDATED' : 'Active'}
                      </Text>
                    </View>
                    <View style={s.flaggedActions}>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.success + '20' }]} onPress={() => clearFlags('special', special.special_id)}>
                        <Ionicons name="checkmark" size={18} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.error + '20' }]} onPress={() => deleteSpecial(special.special_id)}>
                        <Ionicons name="trash" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {flagged.specials.length === 0 && <Text style={s.emptyText}>No flagged specials</Text>}
              </>
            )}

            {/* STORES TAB */}
            {activeTab === 'stores' && (
              <>
                <Text style={s.sectionTitle}>Manage Stores ({stores.length})</Text>
                {stores.map((store, i) => (
                  <View key={store.store_id} style={s.storeCard} testID={`admin-store-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.storeName}>{store.name}</Text>
                      <Text style={s.storeMeta}>{store.region} · {store.type}</Text>
                      {store.added_by && <Text style={s.storeAddedBy}>Added by user</Text>}
                      {store.status && (
                        <View style={[s.statusBadge, { backgroundColor: store.status === 'approved' ? colors.success + '20' : store.status === 'rejected' ? colors.error + '20' : colors.warning + '20' }]}>
                          <Text style={[s.statusText, { color: store.status === 'approved' ? colors.success : store.status === 'rejected' ? colors.error : colors.warning }]}>
                            {store.status.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={s.storeActions}>
                      {store.status !== 'approved' && (
                        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.success + '20' }]} onPress={() => updateStoreStatus(store.store_id, 'approved')}>
                          <Ionicons name="checkmark" size={18} color={colors.success} />
                        </TouchableOpacity>
                      )}
                      {store.status !== 'rejected' && (
                        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.warning + '20' }]} onPress={() => updateStoreStatus(store.store_id, 'rejected')}>
                          <Ionicons name="close" size={18} color={colors.warning} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.error + '20' }]} onPress={() => deleteStore(store.store_id)}>
                        <Ionicons name="trash" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {stores.length === 0 && <Text style={s.emptyText}>No stores</Text>}
              </>
            )}

            {/* BANNERS TAB */}
            {activeTab === 'banners' && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Ad Banners ({banners.length})</Text>
                  <TouchableOpacity
                    testID="add-banner-btn"
                    style={s.addBtn}
                    onPress={() => { setEditBanner({ title: '', subtitle: '', cta_text: 'Learn More', bg_color: '#0277BD', text_color: '#FFFFFF', active: true, priority: 1 }); setShowBannerModal(true); }}
                  >
                    <Ionicons name="add" size={20} color={colors.primaryForeground} />
                  </TouchableOpacity>
                </View>
                {banners.map((banner, i) => (
                  <View key={banner.banner_id} style={[s.bannerCard, { backgroundColor: banner.bg_color }]} testID={`admin-banner-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.bannerTitle, { color: banner.text_color }]}>{banner.title}</Text>
                      <Text style={[s.bannerSub, { color: banner.text_color + 'CC' }]}>{banner.subtitle}</Text>
                      <Text style={[s.bannerMeta, { color: banner.text_color + '88' }]}>
                        Priority: {banner.priority} · {banner.active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                    <View style={s.bannerActions}>
                      <TouchableOpacity style={s.bannerActionBtn} onPress={() => { setEditBanner(banner); setShowBannerModal(true); }}>
                        <Ionicons name="pencil" size={18} color={banner.text_color} />
                      </TouchableOpacity>
                      <TouchableOpacity style={s.bannerActionBtn} onPress={() => deleteBanner(banner.banner_id)}>
                        <Ionicons name="trash" size={18} color={banner.text_color} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {banners.length === 0 && <Text style={s.emptyText}>No banners</Text>}
              </>
            )}

            {/* PRODUCTS TAB */}
            {activeTab === 'products' && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>Product Categories</Text>
                  <TouchableOpacity
                    testID="add-product-btn"
                    style={s.addBtn}
                    onPress={() => { setEditProduct({ name: '', category: 'General', unit_type: 'each', brand: '', tags: [] }); setShowProductModal(true); }}
                  >
                    <Ionicons name="add" size={20} color={colors.primaryForeground} />
                  </TouchableOpacity>
                </View>
                
                <TextInput
                  testID="admin-product-search"
                  style={s.searchInput}
                  placeholder="Search products..."
                  placeholderTextColor={colors.textSecondary}
                  value={productSearch}
                  onChangeText={setProductSearch}
                />
                
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryFilter}>
                  <TouchableOpacity
                    style={[s.categoryChip, !productCategoryFilter && { backgroundColor: colors.primary }]}
                    onPress={() => setProductCategoryFilter('')}
                  >
                    <Text style={[s.categoryChipText, !productCategoryFilter && { color: colors.primaryForeground }]}>All</Text>
                  </TouchableOpacity>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[s.categoryChip, productCategoryFilter === cat && { backgroundColor: colors.primary }]}
                      onPress={() => setProductCategoryFilter(productCategoryFilter === cat ? '' : cat)}
                    >
                      <Text style={[s.categoryChipText, productCategoryFilter === cat && { color: colors.primaryForeground }]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {products.map((product, i) => (
                  <View key={product.product_id} style={s.productCard} testID={`admin-product-${i}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.productName}>{product.name}</Text>
                      <View style={s.productMeta}>
                        <View style={[s.categoryBadge, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[s.categoryBadgeText, { color: colors.primary }]}>{product.category}</Text>
                        </View>
                        {product.brand && <Text style={s.productBrand}>{product.brand}</Text>}
                      </View>
                      {product.tags?.length > 0 && (
                        <View style={s.tagsRow}>
                          {product.tags.map((tag: string, j: number) => (
                            <View key={j} style={s.tagBadge}>
                              <Text style={s.tagText}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={s.productActions}>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.primary + '20' }]}
                        onPress={() => { setEditProduct(product); setShowProductModal(true); }}
                      >
                        <Ionicons name="pencil" size={18} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, { backgroundColor: colors.error + '20' }]}
                        onPress={() => deleteProduct(product.product_id)}
                      >
                        <Ionicons name="trash" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {products.length === 0 && <Text style={s.emptyText}>No products found. Add products to categorize.</Text>}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Banner Edit Modal */}
      <Modal visible={showBannerModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editBanner?.banner_id ? 'Edit Banner' : 'New Banner'}</Text>
              <TouchableOpacity onPress={() => { setShowBannerModal(false); setEditBanner(null); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={s.inputLabel}>Title</Text>
              <TextInput
                testID="banner-title-input"
                style={s.input}
                value={editBanner?.title || ''}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, title: t }))}
                placeholder="Banner title"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Subtitle</Text>
              <TextInput
                testID="banner-subtitle-input"
                style={s.input}
                value={editBanner?.subtitle || ''}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, subtitle: t }))}
                placeholder="Banner subtitle"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>CTA Text</Text>
              <TextInput
                testID="banner-cta-input"
                style={s.input}
                value={editBanner?.cta_text || ''}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, cta_text: t }))}
                placeholder="Button text"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Background Color (hex)</Text>
              <TextInput
                testID="banner-bg-input"
                style={s.input}
                value={editBanner?.bg_color || ''}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, bg_color: t }))}
                placeholder="#0277BD"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Text Color (hex)</Text>
              <TextInput
                testID="banner-text-color-input"
                style={s.input}
                value={editBanner?.text_color || ''}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, text_color: t }))}
                placeholder="#FFFFFF"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Priority</Text>
              <TextInput
                testID="banner-priority-input"
                style={s.input}
                value={String(editBanner?.priority || 1)}
                onChangeText={t => setEditBanner((p: any) => ({ ...p, priority: parseInt(t) || 1 }))}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity
                style={s.toggleRow}
                onPress={() => setEditBanner((p: any) => ({ ...p, active: !p?.active }))}
              >
                <Text style={s.toggleLabel}>Active</Text>
                <Ionicons
                  name={editBanner?.active ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={editBanner?.active ? colors.success : colors.textSecondary}
                />
              </TouchableOpacity>
              <TouchableOpacity testID="save-banner-btn" style={s.saveBtn} onPress={saveBanner}>
                <Text style={s.saveBtnText}>Save Banner</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Product Edit Modal */}
      <Modal visible={showProductModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editProduct?.product_id ? 'Edit Product' : 'New Product'}</Text>
              <TouchableOpacity onPress={() => { setShowProductModal(false); setEditProduct(null); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <Text style={s.inputLabel}>Product Name</Text>
              <TextInput
                testID="product-name-input"
                style={s.input}
                value={editProduct?.name || ''}
                onChangeText={t => setEditProduct((p: any) => ({ ...p, name: t }))}
                placeholder="e.g., Rice, Cooking Oil"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryPicker}>
                {PRODUCT_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.categoryPickerItem, editProduct?.category === cat && { backgroundColor: colors.primary }]}
                    onPress={() => setEditProduct((p: any) => ({ ...p, category: cat }))}
                  >
                    <Text style={[s.categoryPickerText, editProduct?.category === cat && { color: colors.primaryForeground }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={s.inputLabel}>Brand (optional)</Text>
              <TextInput
                testID="product-brand-input"
                style={s.input}
                value={editProduct?.brand || ''}
                onChangeText={t => setEditProduct((p: any) => ({ ...p, brand: t }))}
                placeholder="e.g., Starlite, Chief"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Unit Type</Text>
              <TextInput
                testID="product-unit-input"
                style={s.input}
                value={editProduct?.unit_type || ''}
                onChangeText={t => setEditProduct((p: any) => ({ ...p, unit_type: t }))}
                placeholder="e.g., each, kg, L"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={s.inputLabel}>Tags (comma-separated)</Text>
              <TextInput
                testID="product-tags-input"
                style={s.input}
                value={(editProduct?.tags || []).join(', ')}
                onChangeText={t => setEditProduct((p: any) => ({ ...p, tags: t.split(',').map((s: string) => s.trim()).filter(Boolean) }))}
                placeholder="e.g., bulk, toiletry, pennywise-special"
                placeholderTextColor={colors.textSecondary}
              />
              <TouchableOpacity testID="save-product-btn" style={s.saveBtn} onPress={saveProduct}>
                <Text style={s.saveBtnText}>Save Product</Text>
              </TouchableOpacity>
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  tabBar: { flexDirection: 'row', paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, backgroundColor: colors.surface, marginRight: Spacing.s,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  scrollContent: { padding: Spacing.m, paddingBottom: Spacing.xxl },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: Spacing.m },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.m, marginBottom: Spacing.l },
  statCard: {
    width: '47%', backgroundColor: colors.surface, borderRadius: Radius.l,
    padding: Spacing.m, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: Spacing.s },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  alertsGrid: { gap: Spacing.s, marginBottom: Spacing.l },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  alertValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  alertLabel: { fontSize: 13, color: colors.textSecondary },
  weekStats: { flexDirection: 'row', gap: Spacing.m },
  weekStatItem: {
    flex: 1, backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  weekStatValue: { fontSize: 24, fontWeight: '800', color: colors.primary },
  weekStatLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  searchInput: {
    backgroundColor: colors.surface, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text, marginBottom: Spacing.m,
    borderWidth: 1, borderColor: colors.border,
  },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  userAvatarText: { fontSize: 18, fontWeight: '700', color: colors.primaryForeground },
  userName: { fontSize: 15, fontWeight: '600', color: colors.text },
  userEmail: { fontSize: 12, color: colors.textSecondary },
  userBadges: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  userBadge: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    backgroundColor: colors.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  actionBtn: {
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
  },
  flaggedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  flaggedTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  flaggedSub: { fontSize: 13, color: colors.textSecondary },
  flaggedMeta: { fontSize: 11, color: colors.warning, fontWeight: '600', marginTop: 4 },
  flaggedActions: { flexDirection: 'row', gap: Spacing.xs },
  storeCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  storeName: { fontSize: 15, fontWeight: '600', color: colors.text },
  storeMeta: { fontSize: 12, color: colors.textSecondary },
  storeAddedBy: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '700' },
  storeActions: { flexDirection: 'row', gap: Spacing.xs },
  bannerCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700' },
  bannerSub: { fontSize: 13 },
  bannerMeta: { fontSize: 11, marginTop: 4 },
  bannerActions: { flexDirection: 'row', gap: Spacing.xs },
  bannerActionBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.l },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.l, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.m },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  inputLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4, marginTop: Spacing.s },
  input: {
    backgroundColor: colors.inputBg, borderRadius: Radius.m, paddingHorizontal: Spacing.m,
    height: 44, fontSize: 15, color: colors.text,
  },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.m },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: Radius.full, height: 50,
    justifyContent: 'center', alignItems: 'center', marginTop: Spacing.l,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: colors.primaryForeground },
  // Products tab styles
  categoryFilter: { marginBottom: Spacing.m },
  categoryChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: colors.surface, marginRight: Spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  productCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.m,
    backgroundColor: colors.surface, borderRadius: Radius.l, padding: Spacing.m, marginBottom: Spacing.s,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  productName: { fontSize: 15, fontWeight: '600', color: colors.text },
  productMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginTop: 4 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.s },
  categoryBadgeText: { fontSize: 11, fontWeight: '700' },
  productBrand: { fontSize: 12, color: colors.textSecondary },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tagBadge: { backgroundColor: colors.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.s },
  tagText: { fontSize: 10, fontWeight: '600', color: colors.accent },
  productActions: { flexDirection: 'row', gap: Spacing.xs },
  categoryPicker: { marginVertical: Spacing.s },
  categoryPickerItem: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.m,
    backgroundColor: colors.inputBg, marginRight: Spacing.xs,
  },
  categoryPickerText: { fontSize: 13, fontWeight: '600', color: colors.text },
});
