/**
 * frontend/components/ProductImagePicker.tsx
 *
 * Reusable component that lets the user take a photo or choose from gallery.
 * Uses expo-image-picker (already part of Expo SDK 54).
 *
 * Usage:
 *   <ProductImagePicker onImageSelected={(base64) => setImageData(base64)} />
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

interface ProductImagePickerProps {
  onImageSelected: (base64: string | null) => void;
  existingImageUrl?: string | null;
}

export default function ProductImagePicker({
  onImageSelected,
  existingImageUrl,
}: ProductImagePickerProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestPermissions = async (): Promise<boolean> => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Camera and photo library access are needed to attach product photos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const pickFromCamera = async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    setLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,           // compress for upload
        base64: true,           // we need base64 for API upload
        allowsEditing: true,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setImageUri(asset.uri);
        // Prefix with data URI so backend can detect mime type
        const base64 = `data:image/jpeg;base64,${asset.base64}`;
        onImageSelected(base64);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open camera.');
    } finally {
      setLoading(false);
    }
  };

  const pickFromGallery = async () => {
    const ok = await requestPermissions();
    if (!ok) return;

    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: true,
        aspect: [4, 3],
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setImageUri(asset.uri);
        const mimeType = asset.mimeType ?? 'image/jpeg';
        const base64 = `data:${mimeType};base64,${asset.base64}`;
        onImageSelected(base64);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not open photo library.');
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    setImageUri(null);
    onImageSelected(null);
  };

  const displayUri = imageUri ?? existingImageUrl;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Product Photo (optional)</Text>

      {displayUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: displayUri }} style={styles.preview} resizeMode="cover" />
          <TouchableOpacity style={styles.removeBtn} onPress={removeImage} testID="remove-image-btn">
            <Ionicons name="close-circle" size={26} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={pickFromCamera}
            testID="camera-btn"
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="camera-outline" size={22} color="#FFFFFF" />
                <Text style={styles.pickerBtnText}>Take Photo</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pickerBtn, styles.galleryBtn]}
            onPress={pickFromGallery}
            testID="gallery-btn"
            disabled={loading}
          >
            <Ionicons name="images-outline" size={22} color="#0277BD" />
            <Text style={[styles.pickerBtnText, styles.galleryBtnText]}>Choose Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.hint}>Attach a photo of the price tag or product to help the community verify.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0277BD',
    height: 52,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  pickerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  galleryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#0277BD',
  },
  galleryBtnText: {
    color: '#0277BD',
  },
  previewContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    lineHeight: 18,
  },
});
