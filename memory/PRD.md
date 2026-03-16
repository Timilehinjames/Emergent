# TriniSaver - Product Requirements Document

## Overview
Community-driven shopping optimization mobile app for Trinidad & Tobago. Helps shoppers compare prices, plan trips, and earn rewards for community price reporting.

## Tech Stack
- **Frontend**: React Native (Expo SDK 54), Expo Router, TypeScript
- **Backend**: FastAPI (Python), Motor (async MongoDB driver)
- **Database**: MongoDB
- **AI/OCR**: OpenAI GPT-5.2 via emergentintegrations (Emergent LLM Key)
- **Auth**: JWT + Emergent Google OAuth

## Core Features

### 1. Authentication
- JWT-based email/password registration & login
- Google OAuth via Emergent Auth
- Secure token storage with AsyncStorage

### 2. Unit Price Comparison (Bulk vs Retail)
- Normalize different package sizes to standard unit prices (per 100g, per L, etc.)
- Compare across T&T stores: Massy, PriceSmart, Pennywise, Hi-Lo, JTA
- Automatic cheapest option identification with savings calculation

### 3. Traffic & Time Logic ("Is it Worth it?")
- **MOCKED** traffic data for T&T routes
- Time-of-day traffic patterns: morning, midday, afternoon, evening rush
- "Time vs Money" analysis - warns users when split trips aren't worth the drive
- Ready for Google Maps API integration (user to add API key later)

### 4. Community Rewards ("The Shop-Link")
- Points for price reports: +10 for photo, +5 for manual
- Regional leaderboards: North, South, Central, Tobago
- Future-proofed for bmobile/Digicel mobile top-up redemptions

### 5. Quick-Scan OCR
- Camera/gallery photo capture of shelf price tags
- GPT-5.2 vision reads product name, price, quantity, unit
- One-tap submit after verification

### 6. PriceSmart & Pennywise Logic
- PriceSmart Member toggle in profile
- Pennywise Split: auto-identifies toiletries/cosmetics for Pennywise comparison

### 7. Savings Dashboard
- Monthly savings summary
- Report count tracking
- Points balance display
- Bento grid UI with quick actions

### 8. Gas Stations Map (**MOCKED**)
- NP and Unipet stations across T&T regions
- Price per litre display

## Database Collections
- `users` - User accounts with points, region, PriceSmart membership
- `user_sessions` - OAuth session tokens
- `products` - Product catalog (seeded with 15 T&T products)
- `price_reports` - Community price submissions
- `stores` - 10 T&T stores
- `gas_stations` - Mocked gas station data

## API Endpoints
- Auth: /api/auth/register, /login, /me, /google-session, /logout
- Products: /api/products, /api/products/{id}/prices
- Reports: /api/price-reports, /api/price-reports/recent
- Compare: /api/compare/unit-price, /api/compare/pennywise-split
- Trip: /api/trip/plan (MOCKED), /api/gas-stations (MOCKED)
- Community: /api/leaderboard, /api/community/stats
- Scan: /api/scan/shelf-tag (GPT-5.2 vision)
- Profile: /api/profile, /api/savings-summary

## Design System
- Colors: Caribbean Deep Ocean Blue (#0277BD), Palm Green (#2E7D32), Golden Sun (#FFB300)
- Both light and dark mode
- Bento grid dashboard layout
- Island Card components
- 44px minimum touch targets

## Mocked Features
- Google Maps traffic data (ready for real API key)
- Gas station prices
- All mocked data uses realistic T&T locations and patterns
