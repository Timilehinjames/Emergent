/**
 * frontend/app/(tabs)/profile.tsx
 * TriniSaver — Profile Screen
 *
 * Changes applied:
 *  1. "Your Region" → full location picker (T&T parishes) + catchment radius slider
 *  2. "Points & Rewards" — removed "1point = $0.10TTD" line
 *  3. Admin Panel button — visible only to admin users (was needs_retesting, now fixed)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/context/ThemeContext';

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

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8001';

// ─── T&T Regions ─────────────────────────────────────────────────────────────
const TT_REGIONS = [
  { label: 'Port of Spain',         value: 'port_of_spain' },
  { label: 'San Fernando',          value: 'san_fernando' },
  { label: 'Chaguanas',             value: 'chaguanas' },
  { label: 'Arima',                 value: 'arima' },
  { label: 'Point Fortin',          value: 'point_fortin' },
  { label: 'Diego Martin',          value: 'diego_martin' },
  { label: 'Siparia',               value: 'siparia' },
  { label: 'Tunapuna/Piarco',       value: 'tunapuna_piarco' },
  { label: 'San Juan/Laventille',   value: 'san_juan_laventille' },
  { label: 'Princes Town',          value: 'princes_town' },
  { label: 'Couva/Tabaquite/Talparo', value: 'couva_tabaquite_talparo' },
  { label: 'Penal/Debe',            value: 'penal_debe' },
  { label: 'Sangre Grande',         value: 'sangre_grande' },
  { label: 'Rio Claro/Mayaro',      value: 'rio_claro_mayaro' },
  { label: 'Tobago',                value: 'tobago' },
];

// ─── Region Picker Modal ──────────────────────────────────────────────────────
const RegionPickerModal: React.FC<{
  visible: boolean;
  currentValue: string;
  onSelect: (value: string, label: string) => void;
  onClose: () => void;
}> = ({ visible, currentValue, onSelect, onClose }) => (
  <Modal
    visible={visible}
    animationType="slide"
    transparent
    onRequestClose={onClose}
    statusBarTranslucent
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} />
        <Text style={styles.modalTitle}>Select Your Region</Text>
        <FlatList
          data={TT_REGIONS}
          keyExtractor={i => i.value}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.regionOption,
                item.value === currentValue && styles.regionOptionActive,
              ]}
              onPress={() => { onSelect(item.value, item.label); onClose(); }}
              testID={`region-option-${item.value}`}
            >
              <Text
                style={[
                  styles.regionOptionText,
                  item.value === currentValue && styles.regionOptionTextActive,
                ]}
              >
                {item.label}
              </Text>
              {item.value === currentValue && (
                <Ionicons name="checkmark-circle" size={18} color={C.primary} />
              )}
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
        />
        <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

// ─── Settings Row ─────────────────────────────────────────────────────────────
const SettingRow: React.FC<{
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  testID?: string;
}> = ({ icon, label, value, onPress, rightElement, testID }) => (
  <TouchableOpacity
    style={styles.settingRow}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    testID={testID}
  >
    <View style={styles.settingIcon}>
      <Ionicons name={icon as any} size={18} color={C.primary} />
    </View>
    <View style={styles.settingLabel}>
      <Text style={styles.settingLabelText}>{label}</Text>
      {value ? <Text style={styles.settingValue}>{value}</Text> : null}
    </View>
    {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={C.textSec} /> : null)}
  </TouchableOpacity>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { mode, toggleTheme } = useTheme();

  const [loading,        setLoading]        = useState(true);
  const [token,          setToken]          = useState<string | null>(null);
  const [userName,       setUserName]       = useState('');
  const [userEmail,      setUserEmail]      = useState('');
  const [isAdmin,        setIsAdmin]        = useState(false);
  const [points,         setPoints]         = useState(0);
  const [totalSaved,     setTotalSaved]     = useState(0);
  const [regionValue,    setRegionValue]    = useState('port_of_spain');
  const [regionLabel,    setRegionLabel]    = useState('Port of Spain');
  const [catchmentKm,    setCatchmentKm]    = useState(5);          // km radius
  const [regionModal,    setRegionModal]    = useState(false);
  const [notifEnabled,   setNotifEnabled]   = useState(true);
  const [savingRegion,   setSavingRegion]   = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // ── Load profile ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const t = await AsyncStorage.getItem('auth_token');
      setToken(t);
      if (!t) { setLoading(false); return; }

      try {
        // Check admin status
        const [profileRes, adminRes] = await Promise.all([
          fetch(`${API_BASE}/api/profile`, {
            headers: { Authorization: `Bearer ${t}` },
          }),
          fetch(`${API_BASE}/api/admin/check`, {
            headers: { Authorization: `Bearer ${t}` },
          }),
        ]);

        if (profileRes.ok) {
          const p = await profileRes.json();
          setUserName(p.name ?? '');
          setUserEmail(p.email ?? '');
          setPoints(p.points ?? 0);
          setTotalSaved(p.total_saved ?? 0);
          if (p.region) {
            setRegionValue(p.region);
            const found = TT_REGIONS.find(r => r.value === p.region);
            if (found) setRegionLabel(found.label);
          }
          if (p.catchment_km) setCatchmentKm(p.catchment_km);
        }

        if (adminRes.ok) {
          const a = await adminRes.json();
          setIsAdmin(a.is_admin === true);
        }
      } catch (err) {
        console.error('Profile load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save region + catchment ────────────────────────────────────────────────
  const saveRegion = useCallback(async (value: string, label: string, km: number) => {
    if (!token) return;
    setSavingRegion(true);
    try {
      await fetch(`${API_BASE}/api/profile/region`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: value, catchment_km: km }),
      });
    } catch (err) {
      console.error('Save region error:', err);
    } finally {
      setSavingRegion(false);
    }
  }, [token]);

  const handleRegionSelect = (value: string, label: string) => {
    setRegionValue(value);
    setRegionLabel(label);
    saveRegion(value, label, catchmentKm);
  };

  const handleCatchmentChange = (km: number) => {
    const rounded = Math.round(km);
    setCatchmentKm(rounded);
  };

  const handleCatchmentCommit = (km: number) => {
    const rounded = Math.round(km);
    setCatchmentKm(rounded);
    saveRegion(regionValue, regionLabel, rounded);
  };

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = () => {
    // Use modal instead of Alert for cross-platform compatibility
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutModal(false);
    await AsyncStorage.multiRemove(['auth_token', 'user_name', 'user_email']);
    router.replace('/');
  };

  // ── Tier logic ─────────────────────────────────────────────────────────────
  const getTier = (pts: number) => {
    if (pts >= 5000) return { label: 'Gold', emoji: '🥇', color: '#FFB300' };
    if (pts >= 1000) return { label: 'Silver', emoji: '🥈', color: '#9E9E9E' };
    return { label: 'Bronze', emoji: '🥉', color: '#CD7F32' };
  };
  const tier = getTier(points);

  // ── Render ─────────────────────────────────────────────────────────────────
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar & Name ────────────────────────────────────────────── */}
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>
              {userName ? userName.substring(0, 2).toUpperCase() : '??'}
            </Text>
          </View>
          <Text style={styles.userName}>{userName || 'Guest User'}</Text>
          <Text style={styles.userEmail}>{userEmail}</Text>
          {isAdmin && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={12} color="#FFF" />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>

        {/* ── Points & Rewards ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Points & Rewards</Text>
          <View style={styles.pointsRow}>
            <View style={styles.pointsStat}>
              <Text style={styles.pointsValue}>{points.toLocaleString()}</Text>
              <Text style={styles.pointsLabel}>Points</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.pointsStat}>
              <Text style={styles.pointsValue}>TT${totalSaved.toFixed(2)}</Text>
              <Text style={styles.pointsLabel}>Total Saved</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.pointsStat}>
              <Text style={[styles.pointsValue, { color: tier.color }]}>
                {tier.emoji} {tier.label}
              </Text>
              <Text style={styles.pointsLabel}>Tier</Text>
            </View>
          </View>
          {/* NOTE: "1point = $0.10TTD" intentionally removed per spec */}
          <TouchableOpacity style={styles.redeemBtn} testID="redeem-points-btn">
            <Text style={styles.redeemBtnText}>Redeem Points</Text>
          </TouchableOpacity>
        </View>

        {/* ── Your Region ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📍 Your Region</Text>

          {/* Location picker */}
          <TouchableOpacity
            style={styles.regionPickerBtn}
            onPress={() => setRegionModal(true)}
            testID="region-picker-btn"
          >
            <Ionicons name="location" size={18} color={C.primary} />
            <Text style={styles.regionPickerLabel}>{regionLabel}</Text>
            <View style={{ flex: 1 }} />
            {savingRegion ? (
              <ActivityIndicator size="small" color={C.primary} />
            ) : (
              <Ionicons name="chevron-down" size={16} color={C.textSec} />
            )}
          </TouchableOpacity>

          {/* Catchment radius slider */}
          <View style={styles.catchmentBlock}>
            <View style={styles.catchmentHeader}>
              <Text style={styles.catchmentLabel}>Catchment Radius</Text>
              <Text style={styles.catchmentValue}>{catchmentKm} km</Text>
            </View>
            <Text style={styles.catchmentHint}>
              See prices reported within {catchmentKm} km of your region
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={1}
              maximumValue={50}
              step={1}
              value={catchmentKm}
              onValueChange={handleCatchmentChange}
              onSlidingComplete={handleCatchmentCommit}
              minimumTrackTintColor={C.primary}
              maximumTrackTintColor={C.border}
              thumbTintColor={C.primary}
              testID="catchment-slider"
            />
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>1 km</Text>
              <Text style={styles.sliderLabelText}>25 km</Text>
              <Text style={styles.sliderLabelText}>50 km</Text>
            </View>
          </View>
        </View>

        {/* ── Account Settings ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <SettingRow
            icon="person-outline"
            label="Edit Profile"
            onPress={() => router.push('/edit-profile')}
            testID="edit-profile-btn"
          />
          <SettingRow
            icon="notifications-outline"
            label="Notifications"
            rightElement={
              <Switch
                value={notifEnabled}
                onValueChange={setNotifEnabled}
                trackColor={{ true: C.primary, false: C.border }}
                testID="notifications-switch"
              />
            }
          />
          <SettingRow
            icon="moon-outline"
            label="Dark Mode"
            rightElement={
              <Switch
                value={mode === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ true: C.primary, false: C.border }}
                testID="dark-mode-switch"
              />
            }
          />
          <SettingRow
            icon="lock-closed-outline"
            label="Change Password"
            onPress={() => router.push('/change-password')}
            testID="change-password-btn"
          />
        </View>

        {/* ── Admin Panel — only shown to admins ───────────────────────── */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.adminBtn}
            onPress={() => router.push('/admin')}
            testID="admin-panel-btn"
          >
            <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
            <Text style={styles.adminBtnText}>Admin Panel</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {/* ── Sign Out ──────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          testID="sign-out-btn"
        >
          <Ionicons name="log-out-outline" size={18} color={C.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <RegionPickerModal
        visible={regionModal}
        currentValue={regionValue}
        onSelect={handleRegionSelect}
        onClose={() => setRegionModal(false)}
      />

      {/* Sign Out Confirmation Modal */}
      <Modal
        visible={showSignOutModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowSignOutModal(false)}
      >
        <TouchableOpacity
          style={styles.signOutOverlay}
          activeOpacity={1}
          onPress={() => setShowSignOutModal(false)}
        >
          <View style={styles.signOutModalContainer}>
            <Ionicons name="log-out-outline" size={40} color={C.error} style={{ marginBottom: 16 }} />
            <Text style={styles.signOutModalTitle}>Sign Out</Text>
            <Text style={styles.signOutModalText}>Are you sure you want to sign out?</Text>
            
            <View style={styles.signOutModalButtons}>
              <TouchableOpacity
                style={styles.signOutModalCancelBtn}
                onPress={() => setShowSignOutModal(false)}
              >
                <Text style={styles.signOutModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.signOutModalConfirmBtn}
                onPress={confirmSignOut}
              >
                <Text style={styles.signOutModalConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.bg },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  content:       { paddingTop: 8, paddingHorizontal: 16 },

  // Avatar
  avatarBlock: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  avatarInitials: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  userName:       { fontSize: 20, fontWeight: '800', color: C.text },
  userEmail:      { fontSize: 13, color: C.textSec },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.accent, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 4,
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF' },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 12 },

  // Points
  pointsRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pointsStat: { flex: 1, alignItems: 'center' },
  pointsValue: { fontSize: 16, fontWeight: '800', color: C.text },
  pointsLabel: { fontSize: 11, color: C.textSec, marginTop: 2 },
  divider:    { width: 1, height: 36, backgroundColor: C.border },
  redeemBtn: {
    backgroundColor: C.primary,
    borderRadius: 99,
    paddingVertical: 11,
    alignItems: 'center',
  },
  redeemBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },

  // Region
  regionPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 16,
  },
  regionPickerLabel: { fontSize: 15, fontWeight: '600', color: C.primary },

  catchmentBlock: { gap: 4 },
  catchmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catchmentLabel:  { fontSize: 14, fontWeight: '600', color: C.text },
  catchmentValue: {
    fontSize: 14, fontWeight: '800', color: C.primary,
    backgroundColor: C.primaryLight, paddingHorizontal: 10, paddingVertical: 2,
    borderRadius: 99,
  },
  catchmentHint: { fontSize: 12, color: C.textSec, marginBottom: 4 },
  slider:        { width: '100%', height: 40 },
  sliderLabels:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabelText: { fontSize: 10, color: C.textSec },

  // Setting rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  settingIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: C.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  settingLabel:     { flex: 1 },
  settingLabelText: { fontSize: 14, fontWeight: '600', color: C.text },
  settingValue:     { fontSize: 12, color: C.textSec, marginTop: 1 },

  // Admin button
  adminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accentDark,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 14,
  },
  adminBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: C.error,
    borderRadius: 14,
    marginBottom: 8,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: C.error },

  // Region modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 12 },
  regionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  regionOptionActive:     { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8 },
  regionOptionText:       { flex: 1, fontSize: 15, color: C.text },
  regionOptionTextActive: { color: C.primary, fontWeight: '700' },
  modalCancel: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: C.textSec },

  // Sign Out Modal
  signOutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    alignItems: 'center',
  },
  signOutModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  signOutModalText: {
    fontSize: 14,
    color: C.textSec,
    marginBottom: 24,
    textAlign: 'center',
  },
  signOutModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  signOutModalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  signOutModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  signOutModalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: C.error,
    alignItems: 'center',
  },
  signOutModalConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
