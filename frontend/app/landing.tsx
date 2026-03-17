import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  Dimensions, Animated, Platform, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../src/context/ThemeContext';
import { Spacing, Radius } from '../src/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURES = [
  {
    icon: 'calculator',
    title: 'The PriceSmart Logic',
    description: "Automatically see the 'Price per Roll' or 'Price per Litre.' No more guessing if the bulk buy is actually a deal.",
    color: '#0277BD',
  },
  {
    icon: 'git-branch',
    title: 'The Pennywise Split',
    description: 'Our AI identifies your toiletries and tells you exactly what to buy at Pennywise vs. what to grab at Massy to save the most.',
    color: '#00897B',
  },
  {
    icon: 'car',
    title: "The 'Is It Worth It?' Toggle",
    description: "Real-time traffic integration. If the Uriah Butler is 'locked,' the app reroutes your shopping list to the nearest local spot.",
    color: '#E65100',
  },
];

const TESTIMONIALS = [
  {
    text: "I was going to drive to PriceSmart, but the app told me the savings weren't worth the Friday evening traffic. Saved me $50 in gas and 2 hours of frustration!",
    author: 'Kiran',
    location: 'Chaguanas',
  },
  {
    text: 'Uploaded my receipt from Tru Valu and got enough points for a top-up. Real vibes.',
    author: 'Latoya',
    location: 'Arima',
  },
  {
    text: 'Finally an app that understands Trinidad traffic! The smart split feature is genius.',
    author: 'Marcus',
    location: 'San Fernando',
  },
];

export default function LandingPage() {
  const { colors } = useTheme();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const s = createStyles(colors);

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {/* Hero Section */}
      <LinearGradient
        colors={['#FF6B35', '#F7931E', '#FFB347']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.heroGradient}
      >
        <SafeAreaView edges={['top']}>
          <Animated.View style={[s.heroContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Logo & Title */}
            <View style={s.logoRow}>
              <View style={s.logoIcon}>
                <Ionicons name="cart" size={32} color="#FF6B35" />
              </View>
              <Text style={s.logoText}>DohPayDaTT</Text>
            </View>

            {/* Main Headline */}
            <Text style={s.heroHeadline}>
              Stop Paying the{'\n'}"Highway Tax."
            </Text>
            
            <Text style={s.heroSubheadline}>
              Dodge d' dotish prices! We compare the shelf price <Text style={s.heroEmphasis}>and</Text> the traffic. 
              If saving $20 TTD means sitting in a 2-hour jam, we'll tell you:{'\n'}
              <Text style={s.heroQuote}>"Stay home, it's not worth it."</Text>
            </Text>

            {/* CTA Buttons */}
            <View style={s.ctaRow}>
              <TouchableOpacity 
                style={s.primaryCta}
                onPress={() => router.push('/')}
              >
                <Ionicons name="download" size={20} color="#FF6B35" />
                <Text style={s.primaryCtaText}>Get Started Free</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={s.secondaryCta}
                onPress={() => {/* scroll to features */}}
              >
                <Text style={s.secondaryCtaText}>See Today's Deals</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* App Store Badges */}
            <View style={s.storeRow}>
              <View style={s.storeBadge}>
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                <View>
                  <Text style={s.storeSmall}>Download on the</Text>
                  <Text style={s.storeBig}>App Store</Text>
                </View>
              </View>
              <View style={s.storeBadge}>
                <Ionicons name="logo-google-playstore" size={20} color="#FFFFFF" />
                <View>
                  <Text style={s.storeSmall}>Get it on</Text>
                  <Text style={s.storeBig}>Google Play</Text>
                </View>
              </View>
            </View>

            {/* Floating Phone Mockup Placeholder */}
            <View style={s.phoneMockup}>
              <View style={s.phoneScreen}>
                <Text style={s.phoneText}>📱</Text>
                <Text style={s.phoneLabel}>Smart Shopping</Text>
              </View>
              {/* Floating Icons */}
              <View style={[s.floatingIcon, { top: 20, right: -20 }]}>
                <Text style={{ fontSize: 24 }}>🛒</Text>
              </View>
              <View style={[s.floatingIcon, { bottom: 40, left: -15 }]}>
                <Text style={{ fontSize: 20 }}>🪙</Text>
              </View>
              <View style={[s.floatingIcon, { top: 80, left: -25 }]}>
                <Text style={{ fontSize: 22 }}>🧴</Text>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>

      {/* Trini Factor Features Section */}
      <View style={s.featuresSection}>
        <Text style={s.sectionLabel}>THE "TRINI FACTOR" FEATURES</Text>
        <Text style={s.sectionTitle}>Built Different for T&T</Text>
        
        {FEATURES.map((feature, i) => (
          <View key={i} style={s.featureCard}>
            <View style={[s.featureIconBg, { backgroundColor: feature.color + '15' }]}>
              <Ionicons name={feature.icon as any} size={28} color={feature.color} />
            </View>
            <View style={s.featureContent}>
              <Text style={s.featureTitle}>{feature.title}</Text>
              <Text style={s.featureDesc}>{feature.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* How It Works */}
      <View style={s.howItWorksSection}>
        <Text style={s.sectionLabel}>HOW IT WORKS</Text>
        <Text style={[s.sectionTitle, { color: '#FFFFFF' }]}>Save in 3 Steps</Text>
        
        <View style={s.stepsRow}>
          {[
            { num: '1', icon: 'camera', text: 'Snap a price tag' },
            { num: '2', icon: 'search', text: 'Compare instantly' },
            { num: '3', icon: 'cash', text: 'Save money' },
          ].map((step, i) => (
            <View key={i} style={s.stepItem}>
              <View style={s.stepNum}>
                <Text style={s.stepNumText}>{step.num}</Text>
              </View>
              <View style={s.stepIconCircle}>
                <Ionicons name={step.icon as any} size={28} color="#FF6B35" />
              </View>
              <Text style={s.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Social Proof / Testimonials */}
      <View style={s.testimonialsSection}>
        <Text style={s.sectionLabel}>THE "DOHPAYDATT" COMMUNITY</Text>
        <Text style={s.sectionTitle}>Real Trinis, Real Savings</Text>
        
        {TESTIMONIALS.map((t, i) => (
          <View key={i} style={s.testimonialCard}>
            <View style={s.quoteIcon}>
              <Ionicons name="chatbox-ellipses" size={24} color="#FF6B35" />
            </View>
            <Text style={s.testimonialText}>"{t.text}"</Text>
            <View style={s.testimonialAuthor}>
              <View style={s.testimonialAvatar}>
                <Text style={s.testimonialAvatarText}>{t.author[0]}</Text>
              </View>
              <View>
                <Text style={s.testimonialName}>{t.author}</Text>
                <Text style={s.testimonialLocation}>{t.location}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Stats Section */}
      <View style={s.statsSection}>
        <View style={s.statItem}>
          <Text style={s.statNum}>10K+</Text>
          <Text style={s.statLabel}>Active Users</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statNum}>$500K</Text>
          <Text style={s.statLabel}>TTD Saved</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statNum}>50K+</Text>
          <Text style={s.statLabel}>Price Reports</Text>
        </View>
      </View>

      {/* Final CTA */}
      <LinearGradient
        colors={['#1A237E', '#283593']}
        style={s.finalCta}
      >
        <Text style={s.finalCtaTitle}>Ready to Stop Paying Dotish Prices?</Text>
        <Text style={s.finalCtaSubtitle}>
          Join thousands of Trinis who are shopping smarter.
        </Text>
        <TouchableOpacity 
          style={s.finalCtaBtn}
          onPress={() => router.push('/')}
        >
          <Text style={s.finalCtaBtnText}>Start Saving Today</Text>
          <Ionicons name="arrow-forward" size={20} color="#1A237E" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Footer */}
      <View style={s.footer}>
        <View style={s.footerTop}>
          <View style={s.footerBrand}>
            <Ionicons name="cart" size={24} color="#FF6B35" />
            <Text style={s.footerBrandText}>DohPayDaTT</Text>
          </View>
          <Text style={s.footerTagline}>Dodge d' dotish prices! Shop smart.</Text>
        </View>
        
        <View style={s.footerLinks}>
          <Text style={s.footerLink}>About</Text>
          <Text style={s.footerLink}>Privacy</Text>
          <Text style={s.footerLink}>Terms</Text>
          <Text style={s.footerLink}>Contact</Text>
        </View>

        <View style={s.footerStatus}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>Live Traffic Updates for T&T</Text>
        </View>

        <View style={s.footerPartners}>
          <Text style={s.partnersLabel}>Compatible with</Text>
          <Text style={s.partnersText}>bmobile & Digicel Rewards</Text>
        </View>

        <Text style={s.copyright}>© 2025 DohPayDaTT. Made with ❤️ in Trinidad & Tobago.</Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  
  // Hero
  heroGradient: { minHeight: 700, paddingBottom: 40 },
  heroContent: { paddingHorizontal: Spacing.l, paddingTop: Spacing.l },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginBottom: Spacing.xl },
  logoIcon: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
  },
  logoText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  heroHeadline: {
    fontSize: 42, fontWeight: '900', color: '#FFFFFF', lineHeight: 48,
    marginBottom: Spacing.m,
  },
  heroSubheadline: {
    fontSize: 16, color: 'rgba(255,255,255,0.9)', lineHeight: 26, marginBottom: Spacing.l,
  },
  heroEmphasis: { fontWeight: '700', fontStyle: 'italic' },
  heroQuote: { fontWeight: '700', fontSize: 18 },
  ctaRow: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.l },
  primaryCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    backgroundColor: '#FFFFFF', paddingHorizontal: Spacing.l, paddingVertical: 14,
    borderRadius: Radius.full,
  },
  primaryCtaText: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  secondaryCta: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: Spacing.l, paddingVertical: 14,
    borderRadius: Radius.full, borderWidth: 2, borderColor: '#FFFFFF',
  },
  secondaryCtaText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  storeRow: { flexDirection: 'row', gap: Spacing.m, marginBottom: Spacing.xl },
  storeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: Spacing.m, paddingVertical: Spacing.s,
    borderRadius: Radius.m,
  },
  storeSmall: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  storeBig: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  phoneMockup: {
    alignSelf: 'center', width: 200, height: 350, backgroundColor: '#1A1A2E',
    borderRadius: 30, padding: 8, marginTop: Spacing.m,
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4, shadowRadius: 30, elevation: 20,
  },
  phoneScreen: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  phoneText: { fontSize: 48 },
  phoneLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: Spacing.s },
  floatingIcon: {
    position: 'absolute', width: 50, height: 50, borderRadius: 25,
    backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },

  // Features
  featuresSection: { paddingHorizontal: Spacing.l, paddingVertical: Spacing.xxl, backgroundColor: '#F8F9FA' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: '#FF6B35', letterSpacing: 2,
    marginBottom: Spacing.xs, textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 28, fontWeight: '800', color: '#1A1A2E', textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  featureCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.m,
    backgroundColor: '#FFFFFF', borderRadius: Radius.l, padding: Spacing.l,
    marginBottom: Spacing.m,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  featureIconBg: {
    width: 56, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center',
  },
  featureContent: { flex: 1 },
  featureTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  featureDesc: { fontSize: 14, color: '#666', lineHeight: 22 },

  // How It Works
  howItWorksSection: {
    paddingHorizontal: Spacing.l, paddingVertical: Spacing.xxl,
    backgroundColor: '#1A237E',
  },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.m },
  stepItem: { alignItems: 'center', flex: 1 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#FF6B35',
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.s,
  },
  stepNumText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  stepIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.s,
  },
  stepText: { fontSize: 13, color: '#FFFFFF', textAlign: 'center', fontWeight: '600' },

  // Testimonials
  testimonialsSection: { paddingHorizontal: Spacing.l, paddingVertical: Spacing.xxl, backgroundColor: '#FFFFFF' },
  testimonialCard: {
    backgroundColor: '#F8F9FA', borderRadius: Radius.l, padding: Spacing.l,
    marginBottom: Spacing.m, borderLeftWidth: 4, borderLeftColor: '#FF6B35',
  },
  quoteIcon: { marginBottom: Spacing.s },
  testimonialText: { fontSize: 15, color: '#333', lineHeight: 24, fontStyle: 'italic', marginBottom: Spacing.m },
  testimonialAuthor: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  testimonialAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF6B35',
    justifyContent: 'center', alignItems: 'center',
  },
  testimonialAvatarText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  testimonialName: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  testimonialLocation: { fontSize: 12, color: '#666' },

  // Stats
  statsSection: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingVertical: Spacing.xl, backgroundColor: '#F8F9FA',
  },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 32, fontWeight: '900', color: '#FF6B35' },
  statLabel: { fontSize: 12, color: '#666', fontWeight: '600' },
  statDivider: { width: 1, height: 40, backgroundColor: '#DDD' },

  // Final CTA
  finalCta: { paddingHorizontal: Spacing.l, paddingVertical: Spacing.xxl, alignItems: 'center' },
  finalCtaTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: Spacing.s },
  finalCtaSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: Spacing.l },
  finalCtaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.s,
    backgroundColor: '#FFFFFF', paddingHorizontal: Spacing.xl, paddingVertical: 16,
    borderRadius: Radius.full,
  },
  finalCtaBtnText: { fontSize: 17, fontWeight: '700', color: '#1A237E' },

  // Footer
  footer: { paddingHorizontal: Spacing.l, paddingVertical: Spacing.xl, backgroundColor: '#1A1A2E' },
  footerTop: { alignItems: 'center', marginBottom: Spacing.l },
  footerBrand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, marginBottom: Spacing.xs },
  footerBrandText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  footerTagline: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.l, marginBottom: Spacing.l },
  footerLink: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  footerStatus: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs,
    marginBottom: Spacing.m,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' },
  statusText: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  footerPartners: { alignItems: 'center', marginBottom: Spacing.l },
  partnersLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  partnersText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  copyright: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
});
