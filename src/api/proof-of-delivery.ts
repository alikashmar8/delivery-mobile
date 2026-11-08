import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as ImagePicker from "expo-image-picker";

import { apiClient, type ApiSchemas } from "./index";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function captureProofPhoto(): Promise<File | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Enable camera access in settings to capture delivery proof.");
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: false,
    exif: false,
  });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  if (!file.exists || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("The photo must be smaller than 5 MB. Retake the photo.");
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    throw new Error("Delivery proof must be a JPEG or PNG photo.");
  }
  return file;
}

// Preserve uploadId and the captured file when retrying; never send the API bearer to storage.
export async function uploadProofPhoto(
  deliveryId: string,
  expectedVersion: number,
  uploadId: string,
  file: File,
): Promise<string> {
  const body: ApiSchemas["PodUploadDto"] = {
    uploadId,
    expectedVersion,
    contentType: file.type as "image/jpeg" | "image/png",
  };
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
    throw new Error("Upload a JPEG or PNG photo smaller than 5 MB.");
  }
  const upload = await apiClient.request<ApiSchemas["PodUploadResponseDto"]>(
    `/deliveries/${encodeURIComponent(deliveryId)}/pod-uploads`,
    { method: "POST", json: body },
  );
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
  form.append("file", file, file.name);
  const response = await expoFetch(upload.url, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error("The proof photo could not be uploaded. Retry before confirming delivery.");
  }
  return upload.uploadId;
}
