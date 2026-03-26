/**
 * ItemImagePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A reusable camera/gallery picker that:
 * 1. Compresses & resizes to max 1200px wide
 * 2. Returns a base64 string + mime type ready for POST to backend
 * 3. Shows a full-bleed preview with "Retake" option
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";

// ── Design tokens (DohPayDaTT palette) ─────────────────────────────────────
const C = {
  primary: "#FF6B35",
  primaryForeground: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F7FA",
  border: "#E2E8F0",
  text: "#1E293B",
  textMuted: "#64748B",
  error: "#EF4444",
  success: "#22C55E",
};

const MAX_WIDTH = 1200;
const COMPRESS = 0.82;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CapturedImage {
  base64: string;      // raw base64, no data-uri prefix
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  uri: string;         // local URI for display
  width: number;
  height: number;
}

interface Props {
  onImageSelected: (img: CapturedImage) => void;
  label?: string;
  disabled?: boolean;
  style?: object;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ItemImagePicker({
  onImageSelected,
  label = "Add Photo",
  disabled = false,
  style,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const processResult = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets?.[0]) return;

      setLoading(true);
      try {
        const asset = result.assets[0];

        // Resize if wider than MAX_WIDTH
        let actions: ImageManipulator.Action[] = [];
        if (asset.width > MAX_WIDTH) {
          actions.push({ resize: { width: MAX_WIDTH } });
        }

        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          actions,
          { compress: COMPRESS, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (!manipulated.base64) {
          throw new Error("Failed to encode image");
        }

        const captured: CapturedImage = {
          base64: manipulated.base64,
          mime_type: "image/jpeg",
          uri: manipulated.uri,
          width: manipulated.width,
          height: manipulated.height,
        };

        setPreview(manipulated.uri);
        onImageSelected(captured);
      } catch (err: any) {
        Alert.alert("Error", err.message || "Could not process image");
      } finally {
        setLoading(false);
      }
    },
    [onImageSelected]
  );

  const handleCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: Platform.OS === "ios",
      aspect: [4, 3],
    });
    await processResult(result);
  }, [processResult]);

  const handleGallery = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Gallery access is required to select photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [4, 3],
    });
    await processResult(result);
  }, [processResult]);

  const handleRetake = () => {
    setPreview(null);
  };

  // ── Preview Mode ────────────────────────────────────────────────────────────
  if (preview) {
    return (
      <View style={[styles.container, style]}>
        <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="cover" />
        <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake} disabled={disabled}>
          <Ionicons name="refresh" size={18} color={C.primaryForeground} />
          <Text style={styles.retakeTxt}>Retake</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Picker Mode ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="large" color={C.primary} style={styles.loader} />
      ) : (
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={handleCamera}
            disabled={disabled}
          >
            <Ionicons name="camera" size={28} color={C.primary} />
            <Text style={styles.optionTxt}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.optionBtn}
            onPress={handleGallery}
            disabled={disabled}
          >
            <Ionicons name="images" size={28} color={C.primary} />
            <Text style={styles.optionTxt}>Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: C.surfaceMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    minHeight: 180,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: C.textMuted,
    textAlign: "center",
    paddingTop: 16,
    paddingBottom: 8,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 24,
  },
  optionBtn: {
    alignItems: "center",
    backgroundColor: C.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionTxt: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
    color: C.text,
  },
  loader: {
    marginVertical: 40,
  },
  previewImage: {
    width: "100%",
    height: 200,
  },
  retakeBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  retakeTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: C.primaryForeground,
  },
});

export default ItemImagePicker;
