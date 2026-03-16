import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { TT_REGIONS, Spacing, Radius } from '../src/constants/theme';

export default function AuthScreen() {
  const { user, loading, login, register } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('North');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/(tabs)');
    }
  }, [user, loading]);

  const s = createStyles(colors);

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (!isLogin && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    setSubmitting(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim(), region);
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.container} testID="auth-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Hero Section */}
          <View style={s.hero}>
            <View style={s.logoContainer}>
              <Ionicons name="cart" size={48} color={colors.primaryForeground} />
            </View>
            <Text style={s.appName}>TriniSaver</Text>
            <Text style={s.tagline}>Smart Shopping for Trinidad & Tobago</Text>
          </View>

          {/* Form Card */}
          <View style={s.formCard}>
            <Text style={s.formTitle}>{isLogin ? 'Welcome Back' : 'Create Account'}</Text>
            <Text style={s.formSubtitle}>
              {isLogin ? 'Sign in to continue saving' : 'Join the community of savvy shoppers'}
            </Text>

            {!isLogin && (
              <View style={s.inputGroup}>
                <Text style={s.label}>Full Name</Text>
                <View style={s.inputWrapper}>
                  <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={s.inputIcon} />
                  <TextInput
                    testID="auth-name-input"
                    style={s.input}
                    placeholder="e.g. Trini Saver"
                    placeholderTextColor={colors.textSecondary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            <View style={s.inputGroup}>
              <Text style={s.label}>Email</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={s.inputIcon} />
                <TextInput
                  testID="auth-email-input"
                  style={s.input}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={s.inputIcon} />
                <TextInput
                  testID="auth-password-input"
                  style={[s.input, { flex: 1 }]}
                  placeholder="Min 6 characters"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity testID="toggle-password-btn" onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {!isLogin && (
              <View style={s.inputGroup}>
                <Text style={s.label}>Region</Text>
                <View style={s.regionRow}>
                  {TT_REGIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      testID={`region-${r.toLowerCase()}-btn`}
                      style={[s.regionChip, region === r && { backgroundColor: colors.primary }]}
                      onPress={() => setRegion(r)}
                    >
                      <Text style={[s.regionChipText, region === r && { color: colors.primaryForeground }]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity
              testID="auth-submit-btn"
              style={[s.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={s.submitText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity testID="auth-toggle-btn" style={s.toggleBtn} onPress={() => setIsLogin(!isLogin)}>
              <Text style={s.toggleText}>
                {isLogin ? "Don't have an account? " : 'Already have an account? '}
                <Text style={{ color: colors.primary, fontWeight: '700' }}>
                  {isLogin ? 'Sign Up' : 'Sign In'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bottom Feature List */}
          <View style={s.features}>
            {[
              { icon: 'pricetag', text: 'Compare prices across T&T stores' },
              { icon: 'people', text: 'Community-powered price updates' },
              { icon: 'trophy', text: 'Earn points & climb the leaderboard' },
            ].map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={s.featureIcon}>
                  <Ionicons name={f.icon as any} size={18} color={colors.secondary} />
                </View>
                <Text style={s.featureText}>{f.text}</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { flexGrow: 1, paddingHorizontal: Spacing.l, paddingBottom: Spacing.xxl },
  hero: { alignItems: 'center', paddingTop: Spacing.xxl, paddingBottom: Spacing.l },
  logoContainer: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.m,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  appName: { fontSize: 36, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  tagline: { fontSize: 16, color: colors.textSecondary, marginTop: Spacing.xs },
  formCard: {
    backgroundColor: colors.surface, borderRadius: Radius.xl, padding: Spacing.l,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  formTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: Spacing.xs },
  formSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: Spacing.l },
  inputGroup: { marginBottom: Spacing.m },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: Spacing.s },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: Radius.m,
    paddingHorizontal: Spacing.m, height: 50,
  },
  inputIcon: { marginRight: Spacing.s },
  input: { flex: 1, fontSize: 16, color: colors.text },
  eyeBtn: { padding: Spacing.xs },
  regionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  regionChip: {
    paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.full, backgroundColor: colors.inputBg,
  },
  regionChipText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: Radius.full,
    height: 52, justifyContent: 'center', alignItems: 'center',
    marginTop: Spacing.l,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  submitText: { color: colors.primaryForeground, fontSize: 17, fontWeight: '700' },
  toggleBtn: { alignItems: 'center', marginTop: Spacing.m, paddingVertical: Spacing.s },
  toggleText: { fontSize: 15, color: colors.textSecondary },
  features: { marginTop: Spacing.xl, gap: Spacing.m },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m },
  featureIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.secondary + '18',
    justifyContent: 'center', alignItems: 'center',
  },
  featureText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
});
