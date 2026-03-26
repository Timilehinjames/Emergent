/**
 * ProductImagePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal component for picking product images and entering product details.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProductImage } from "../hooks/useProductImage";

interface ProductImagePickerProps {
  visible: boolean;
  onClose: () => void;
  onUploaded?: (product: any) => void;
  initialProductName?: string;
}

export function ProductImagePicker({
  visible,
  onClose,
  onUploaded,
  initialProductName = "",
}: ProductImagePickerProps) {
  const { pickImage, uploadImage, uploading, error } = useProductImage();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [productName, setProductName] = useState(initialProductName);
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handlePick = async (source: "camera" | "gallery") => {
    setLocalError(null);
    const uri = await pickImage(source);
    if (uri) {
      setImageUri(uri);
    }
  };

  const handleUpload = async () => {
    if (!imageUri) {
      Alert.alert("No Image", "Please select or take a photo first.");
      return;
    }
    if (!productName.trim()) {
      Alert.alert("Missing Name", "Please enter a product name.");
      return;
    }

    setLocalError(null);
    try {
      const result = await uploadImage(imageUri, productName.trim());
      setDone(true);
      onUploaded?.(result.product);
    } catch (err: any) {
      setLocalError(err.message || "Upload failed");
    }
  };

  const handleClose = () => {
    // Reset state
    setImageUri(null);
    setProductName(initialProductName);
    setDone(false);
    setLocalError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Product Photo</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {done ? (
            // Success State
            <View style={styles.successContainer}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
              </View>
              <Text style={styles.successTitle}>Photo Saved!</Text>
              <Text style={styles.successText}>
                Your product photo has been uploaded successfully.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Image Preview / Selection */}
              {imageUri ? (
                <View style={styles.imagePreview}>
                  <Image source={{ uri: imageUri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.changeBtn}
                    onPress={() => setImageUri(null)}
                  >
                    <Ionicons name="refresh" size={20} color="#fff" />
                    <Text style={styles.changeBtnText}>Change Photo</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.pickContainer}>
                  <Text style={styles.pickLabel}>Take a photo or choose from gallery</Text>
                  <View style={styles.pickButtons}>
                    <TouchableOpacity
                      style={styles.pickBtn}
                      onPress={() => handlePick("camera")}
                    >
                      <Ionicons name="camera" size={32} color="#22c55e" />
                      <Text style={styles.pickBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.pickBtn}
                      onPress={() => handlePick("gallery")}
                    >
                      <Ionicons name="images" size={32} color="#3b82f6" />
                      <Text style={styles.pickBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Product Name Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Product Name</Text>
                <TextInput
                  style={styles.input}
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="e.g., Carib Beer 6-Pack"
                  placeholderTextColor="#999"
                />
              </View>

              {/* Error Display */}
              {(localError || error) && (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={20} color="#dc2626" />
                  <Text style={styles.errorText}>{localError || error}</Text>
                </View>
              )}

              {/* Upload Button */}
              <TouchableOpacity
                style={[
                  styles.uploadBtn,
                  (!imageUri || !productName.trim() || uploading) && styles.uploadBtnDisabled,
                ]}
                onPress={handleUpload}
                disabled={!imageUri || !productName.trim() || uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.uploadBtnText}>Save Product Photo</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  pickContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  pickLabel: {
    fontSize: 16,
    color: "#666",
    marginBottom: 16,
  },
  pickButtons: {
    flexDirection: "row",
    gap: 20,
  },
  pickBtn: {
    width: 100,
    height: 100,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e5e5e5",
    borderStyle: "dashed",
  },
  pickBtnText: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },
  imagePreview: {
    alignItems: "center",
    marginBottom: 24,
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 16,
    backgroundColor: "#f5f5f5",
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#666",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  changeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 14,
    flex: 1,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#22c55e",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  uploadBtnDisabled: {
    backgroundColor: "#ccc",
  },
  uploadBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  successContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: "#22c55e",
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default ProductImagePicker;
