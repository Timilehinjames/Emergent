/**
 * imageApi.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * API wrapper for item image endpoints
 * Handles uploads and retrieval of images for products and price reports
 * ─────────────────────────────────────────────────────────────────────────────
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CapturedImage } from "../../components/ItemImagePicker";

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

// ── Auth token helper ─────────────────────────────────────────────────────────
async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UploadImagePayload {
  base64: string; // raw base64, no data-URI prefix
  mime_type: "image/jpeg" | "image/png" | "image/webp";
  item_name?: string; // optional: tag / update the item name at the same time
}

export interface ImageUploadResult {
  success: boolean;
  image_url: string; // data-URI — use directly as <Image source={{ uri: ... }} />
  item_id: string;
  item_name?: string;
  message: string;
}

export interface ImageFetchResult {
  item_id: string;
  item_name?: string;
  image_url: string;
}

// ── Internal fetch wrapper ────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch { /* ignore parse error */ }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Upload (or replace) the photo for a Product (admin catalogue item).
 *
 * @example
 * const result = await uploadProductImage("abc123", capturedImage);
 * // result.image_url → "data:image/jpeg;base64,/9j/..."
 */
export async function uploadProductImage(
  productId: string,
  img: CapturedImage,
  itemName?: string,
): Promise<ImageUploadResult> {
  return apiFetch<ImageUploadResult>(`/api/products/${productId}/image`, {
    method: "POST",
    body: JSON.stringify({
      image_data: img.base64,
      mime_type: img.mime_type,
      item_name: itemName,
    }),
  });
}

/**
 * Upload (or replace) the photo attached to a Price Report.
 * Use this when the user snaps a photo during the report submission flow.
 *
 * @example
 * const result = await uploadReportImage(reportId, capturedImage);
 */
export async function uploadReportImage(
  reportId: string,
  img: CapturedImage,
  itemName?: string,
): Promise<ImageUploadResult> {
  return apiFetch<ImageUploadResult>(`/api/reports/${reportId}/image`, {
    method: "POST",
    body: JSON.stringify({
      image_data: img.base64,
      mime_type: img.mime_type,
      item_name: itemName,
    }),
  });
}

/**
 * Retrieve the stored image data-URI for a Product.
 * Only needed if you want to lazy-load images; the listing API already
 * includes image_url in each item object.
 */
export async function getProductImage(
  productId: string,
): Promise<ImageFetchResult> {
  return apiFetch<ImageFetchResult>(`/api/products/${productId}/image`);
}

/**
 * Retrieve the stored image data-URI for a Price Report.
 */
export async function getReportImage(
  reportId: string,
): Promise<ImageFetchResult> {
  return apiFetch<ImageFetchResult>(`/api/reports/${reportId}/image`);
}

export default {
  uploadProductImage,
  uploadReportImage,
  getProductImage,
  getReportImage,
};
