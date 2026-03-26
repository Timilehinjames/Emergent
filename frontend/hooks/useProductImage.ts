/**
 * useProductImage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook for picking images from camera/gallery and uploading to backend.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

interface UploadResult {
  success: boolean;
  product: {
    id?: string;
    product_id?: string;
    name: string;
    image_b64?: string;
    category?: string;
  };
  image_id: string;
  message: string;
}

export function useProductImage() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Pick and compress an image from camera or gallery.
   * Returns the compressed image URI or null if cancelled.
   */
  const pickImage = async (source: "camera" | "gallery"): Promise<string | null> => {
    setError(null);

    // Request permissions
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera access is needed to take photos.");
        return null;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Photo library access is needed to select images.");
        return null;
      }
    }

    // Launch picker
    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });

    if (result.canceled || !result.assets?.[0]?.uri) {
      return null;
    }

    const imageUri = result.assets[0].uri;

    // Compress the image
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
      );
      return compressed.uri;
    } catch (err) {
      console.warn("Image compression failed, using original:", err);
      return imageUri;
    }
  };

  /**
   * Upload an image to the backend.
   * Returns the API response or throws on error.
   */
  const uploadImage = async (
    imageUri: string,
    productName: string,
    productId?: string
  ): Promise<UploadResult> => {
    setUploading(true);
    setError(null);

    try {
      const token = await AsyncStorage.getItem("auth_token");
      if (!token) {
        throw new Error("Please log in to upload images");
      }

      // Create form data
      const formData = new FormData();
      
      // Get file info
      const filename = imageUri.split("/").pop() || "product.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      // Append file - using the correct format for React Native
      formData.append("file", {
        uri: Platform.OS === "ios" ? imageUri.replace("file://", "") : imageUri,
        name: filename,
        type: type,
      } as any);

      formData.append("product_name", productName);
      if (productId) {
        formData.append("product_id", productId);
      }

      const response = await fetch(`${BACKEND_URL}/api/products/upload-image`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      const errorMsg = err.message || "Failed to upload image";
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  return {
    pickImage,
    uploadImage,
    uploading,
    error,
  };
}
