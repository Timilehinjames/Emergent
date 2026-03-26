/**
 * ItemCard.tsx & ItemListings.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Image-first card and listing components for price reports
 * Follows DohPayDaTT design guidelines
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SCREEN_W = Dimensions.get("window").width;

// ── Design Palette (DohPayDaTT) ───────────────────────────────────────────────
const C = {
  bg: "#F5F7FA",
  surface: "#FFFFFF",
  primary: "#FF6B35",
  primaryForeground: "#FFFFFF",
  secondary: "#00897B",
  accent: "#F7931E",
  text: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  error: "#EF4444",
  warning: "#F59E0B",
  success: "#22C55E",
};

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PriceReportItem {
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
  pay_dat_count?: number;
  doh_pay_dat_count?: number;
}

interface ItemCardProps {
  item: PriceReportItem;
  onPress?: (item: PriceReportItem) => void;
  onFlagItem?: (item: PriceReportItem) => void;
  onVote?: (item: PriceReportItem, voteType: "pay_dat" | "doh_pay_dat") => void;
  cardWidth?: number;
  style?: object;
}

interface ItemListingsProps {
  items: PriceReportItem[];
  loading?: boolean;
  onItemPress?: (item: PriceReportItem) => void;
  onFlagItem?: (item: PriceReportItem) => void;
  onVote?: (item: PriceReportItem, voteType: "pay_dat" | "doh_pay_dat") => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  layout?: "grid" | "list";
  emptyMessage?: string;
  style?: object;
}

// ── Placeholder Generator ─────────────────────────────────────────────────────
const PLACEHOLDER_COLORS = ["#FF6B35", "#00897B", "#F7931E", "#6366F1", "#EC4899"];

function PlaceholderBox({ name, size }: { name: string; size: number }) {
  const colorIndex = name.charCodeAt(0) % PLACEHOLDER_COLORS.length;
  const emoji = name.charAt(0).toUpperCase();
  return (
    <View
      style={[
        styles.placeholder,
        { backgroundColor: PLACEHOLDER_COLORS[colorIndex], width: size, height: size },
      ]}
    >
      <Text style={styles.placeholderEmoji}>{emoji}</Text>
    </View>
  );
}

// ── ItemCard Component ────────────────────────────────────────────────────────
export function ItemCard({
  item,
  onPress,
  onFlagItem,
  onVote,
  cardWidth,
  style,
}: ItemCardProps) {
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const width = cardWidth ?? (SCREEN_W - 48) / 2;
  const imgHeight = width * 0.75;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
  };

  const hasImage = item.image_url && !imgError;

  return (
    <>
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => onPress?.(item)}
          style={[styles.card, { width }]}
        >
          {/* Image Area */}
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => hasImage && setShowLightbox(true)}
            style={{ height: imgHeight }}
          >
            {hasImage ? (
              <>
                <Image
                  source={{ uri: item.image_url! }}
                  style={[styles.cardImage, { height: imgHeight }]}
                  resizeMode="cover"
                  onLoadStart={() => setImgLoading(true)}
                  onLoadEnd={() => setImgLoading(false)}
                  onError={() => {
                    setImgError(true);
                    setImgLoading(false);
                  }}
                />
                {imgLoading && (
                  <View style={[styles.imgLoader, { height: imgHeight }]}>
                    <ActivityIndicator color={C.primary} />
                  </View>
                )}
              </>
            ) : (
              <PlaceholderBox name={item.item_name} size={imgHeight} />
            )}

            {/* Gradient Overlay with Name & Price */}
            <View style={styles.cardOverlay}>
              <Text style={styles.cardName} numberOfLines={2}>
                {item.item_name}
              </Text>
              <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
            </View>

            {/* Outdated Badge */}
            {item.is_outdated && (
              <View style={styles.outdatedBadge}>
                <Ionicons name="time" size={12} color={C.primaryForeground} />
                <Text style={styles.outdatedText}>Outdated</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Info Strip */}
          <View style={styles.infoStrip}>
            <View style={styles.infoLeft}>
              <Ionicons name="storefront" size={14} color={C.textMuted} />
              <Text style={styles.storeName} numberOfLines={1}>
                {item.store}
              </Text>
            </View>
            {item.unit && <Text style={styles.unitText}>/{item.unit}</Text>}
          </View>

          {/* Actions Row */}
          <View style={styles.actionsRow}>
            {/* Vote Buttons */}
            {onVote && (
              <View style={styles.voteRow}>
                <TouchableOpacity
                  style={styles.voteBtn}
                  onPress={() => onVote(item, "pay_dat")}
                >
                  <Text style={styles.voteEmoji}>👍</Text>
                  <Text style={styles.voteCount}>{item.pay_dat_count || 0}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.voteBtn}
                  onPress={() => onVote(item, "doh_pay_dat")}
                >
                  <Text style={styles.voteEmoji}>👎</Text>
                  <Text style={styles.voteCount}>{item.doh_pay_dat_count || 0}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Flag Button */}
            {onFlagItem && (
              <TouchableOpacity
                style={styles.flagBtn}
                onPress={() => onFlagItem(item)}
              >
                <Ionicons name="flag" size={14} color={C.warning} />
                {(item.flag_count ?? 0) > 0 && (
                  <Text style={styles.flagCount}>{item.flag_count}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Reporter */}
          {item.reporter_name && (
            <Text style={styles.reporterName}>by {item.reporter_name}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Lightbox Modal */}
      <Modal visible={showLightbox} transparent animationType="fade">
        <TouchableOpacity
          style={styles.lightbox}
          activeOpacity={1}
          onPress={() => setShowLightbox(false)}
        >
          <Image
            source={{ uri: item.image_url! }}
            style={styles.lightboxImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.lightboxClose}
            onPress={() => setShowLightbox(false)}
          >
            <Ionicons name="close-circle" size={36} color={C.primaryForeground} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ── ItemListings Component ────────────────────────────────────────────────────
export function ItemListings({
  items,
  loading = false,
  onItemPress,
  onFlagItem,
  onVote,
  onRefresh,
  refreshing = false,
  layout = "grid",
  emptyMessage = "No items yet",
  style,
}: ItemListingsProps) {
  const isGrid = layout === "grid";
  const numColumns = isGrid ? 2 : 1;
  const cardWidth = isGrid ? (SCREEN_W - 48) / 2 : SCREEN_W - 32;

  const renderItem = useCallback(
    ({ item }: { item: PriceReportItem }) => (
      <ItemCard
        item={item}
        onPress={onItemPress}
        onFlagItem={onFlagItem}
        onVote={onVote}
        cardWidth={cardWidth}
        style={isGrid ? styles.gridItem : styles.listItem}
      />
    ),
    [onItemPress, onFlagItem, onVote, cardWidth, isGrid]
  );

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>📦</Text>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FlatList
      key={layout}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      numColumns={numColumns}
      columnWrapperStyle={isGrid ? styles.gridRow : undefined}
      contentContainerStyle={[styles.listContainer, style]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primary}
          />
        ) : undefined
      }
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  cardImage: {
    width: "100%",
  },
  imgLoader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.bg,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderEmoji: {
    fontSize: 48,
    fontWeight: "700",
    color: C.primaryForeground,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  cardName: {
    fontSize: 14,
    fontWeight: "700",
    color: C.primaryForeground,
  },
  cardPrice: {
    fontSize: 18,
    fontWeight: "800",
    color: C.accent,
    marginTop: 2,
  },
  outdatedBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  outdatedText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.primaryForeground,
  },
  infoStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  storeName: {
    fontSize: 12,
    color: C.textMuted,
    flex: 1,
  },
  unitText: {
    fontSize: 11,
    color: C.textMuted,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  voteRow: {
    flexDirection: "row",
    gap: 12,
  },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  voteEmoji: {
    fontSize: 16,
  },
  voteCount: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textMuted,
  },
  flagBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  flagCount: {
    fontSize: 11,
    fontWeight: "600",
    color: C.warning,
  },
  reporterName: {
    fontSize: 10,
    color: C.textMuted,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  // Lightbox
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_W,
  },
  lightboxClose: {
    position: "absolute",
    top: 60,
    right: 20,
  },

  // Listings
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: C.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    color: C.textMuted,
    textAlign: "center",
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  gridItem: {
    marginBottom: 0,
  },
  listItem: {
    marginBottom: 16,
  },
});

export default ItemCard;
