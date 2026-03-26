/**
 * ProductCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable product card with image display, suitable for grid layouts.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_MARGIN = 8;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_MARGIN * 4) / 2;

interface ProductCardProps {
  name: string;
  imageb64?: string;
  price?: number;
  store?: string;
  onPress?: () => void;
  onFlag?: () => void;
  showFlag?: boolean;
  flagged?: boolean;
  testID?: string;
}

export function ProductCard({
  name,
  imageb64,
  price,
  store,
  onPress,
  onFlag,
  showFlag = false,
  flagged = false,
  testID,
}: ProductCardProps) {
  const imageSource = imageb64
    ? { uri: imageb64.startsWith("data:") ? imageb64 : `data:image/jpeg;base64,${imageb64}` }
    : null;

  return (
    <TouchableOpacity
      testID={testID}
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Image Section */}
      <View style={styles.imageContainer}>
        {imageSource ? (
          <Image source={imageSource} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={styles.placeholderText}>No Image</Text>
          </View>
        )}
        
        {/* Flag Button */}
        {showFlag && (
          <TouchableOpacity
            style={[styles.flagBtn, flagged && styles.flagBtnActive]}
            onPress={(e) => {
              e.stopPropagation?.();
              onFlag?.();
            }}
          >
            <Ionicons
              name={flagged ? "flag" : "flag-outline"}
              size={16}
              color={flagged ? "#dc2626" : "#666"}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Info Section */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        
        {price !== undefined && (
          <Text style={styles.price}>${price.toFixed(2)}</Text>
        )}
        
        {store && (
          <Text style={styles.store} numberOfLines={1}>
            {store}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 12,
    margin: CARD_MARGIN,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    height: CARD_WIDTH,
    backgroundColor: "#f5f5f5",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#ccc",
    fontSize: 12,
    marginTop: 4,
  },
  flagBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  flagBtnActive: {
    backgroundColor: "#fef2f2",
  },
  info: {
    padding: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    color: "#22c55e",
    marginBottom: 2,
  },
  store: {
    fontSize: 12,
    color: "#666",
  },
});

export default ProductCard;
