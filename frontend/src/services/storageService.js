import { supabase, supabaseBuckets } from "./supabaseClient";
import { getOrganizationId } from "../services/authService";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (compression will help)
const SIGNED_URL_TIMEOUT_MS = 8000;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const slugify = (value) =>
  String(value || "file")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });

/**
 * Automatically compresses images to a manageable size and quality.
 */
const compressImage = async (file, { maxWidth = 1024, maxHeight = 1024, quality = 0.4 } = {}) => {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file; // Skip non-images or GIFs
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            // Only return compressed if it's actually smaller
            resolve(compressedFile.size < file.size ? compressedFile : file);
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = String(e.target?.result || "");
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};

const signedAssetUrlCache = new Map();
const SIGNED_URL_CACHE_MAX_ENTRIES = 250;

const sweepSignedAssetUrlCache = (now = Date.now()) => {
  for (const [key, cached] of signedAssetUrlCache.entries()) {
    if (cached?.expiresAt && cached.expiresAt <= now) {
      signedAssetUrlCache.delete(key);
    }
  }

  while (signedAssetUrlCache.size > SIGNED_URL_CACHE_MAX_ENTRIES) {
    const oldestKey = signedAssetUrlCache.keys().next().value;
    if (!oldestKey) break;
    signedAssetUrlCache.delete(oldestKey);
  }
};

const withAssetTimeout = (promise, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), SIGNED_URL_TIMEOUT_MS);
  });

  return Promise.race([
    promise.finally(() => window.clearTimeout(timeoutId)),
    timeout,
  ]);
};

export const isTemporaryAssetUrl = (value) => String(value || "").startsWith("blob:");

export const getPersistentAssetUrl = (value, fallback = "") => (isTemporaryAssetUrl(value) ? fallback : value || fallback);

export const createSignedAssetUrl = async ({ bucket, path, expiresIn = 60 * 60 } = {}) => {
  if (!path) {
    return "";
  }

  if (!supabase) {
    return path;
  }

  const safeBucket = bucket || supabaseBuckets.documents;
  const cacheKey = `${safeBucket}:${path}:${expiresIn}`;
  const now = Date.now();
  sweepSignedAssetUrlCache(now);
  const cached = signedAssetUrlCache.get(cacheKey);

  if (cached?.url && cached.expiresAt > now) {
    return cached.url;
  }

  if (cached?.promise) {
    return cached.promise;
  }

  const promise = withAssetTimeout(
    supabase.storage.from(safeBucket).createSignedUrl(path, expiresIn),
    "Timed out while preparing a file preview URL."
  )
    .then(({ data, error }) => {
      if (error) {
        signedAssetUrlCache.delete(cacheKey);
        throw error;
      }

      const signedUrl = data?.signedUrl || "";
      signedAssetUrlCache.set(cacheKey, {
        url: signedUrl,
        expiresAt: now + Math.max(0, expiresIn * 1000 - 60_000),
      });
      sweepSignedAssetUrlCache();
      return signedUrl;
    })
    .catch((error) => {
      signedAssetUrlCache.delete(cacheKey);
      console.warn("Asset preview URL unavailable:", error?.message || error);
      return "";
    });

  signedAssetUrlCache.set(cacheKey, { promise });
  sweepSignedAssetUrlCache(now);
  return promise;
};

const clearSignedAssetUrl = ({ bucket, path } = {}) => {
  if (!path) return;
  const safeBucket = bucket || supabaseBuckets.documents;
  for (const key of signedAssetUrlCache.keys()) {
    if (key.startsWith(`${safeBucket}:${path}:`)) {
      signedAssetUrlCache.delete(key);
    }
  }
};

/**
 * Builds a strictly scoped storage path: org-ID / cases / case-ID / category / filename
 * OR org-ID / clients / client-ID / category / filename
 */
export const buildTenantAssetPrefix = ({ scope = "uploads", caseId = "", clientId = "" } = {}) => {
  const organizationId = String(getOrganizationId() || "").trim();
  if (!organizationId) {
    throw new Error("No organization ID found for storage scoping.");
  }

  const safeOrganizationSegment = `org-${organizationId}`;
  const normalizedScope = String(scope || "uploads").replace(/^\/+|\/+$/g, "");
  
  if (caseId) {
    return `${safeOrganizationSegment}/cases/case-${caseId}/${normalizedScope}`;
  }
  
  if (clientId) {
    return `${safeOrganizationSegment}/clients/client-${clientId}/${normalizedScope}`;
  }

  return `${safeOrganizationSegment}/general/${normalizedScope}`;
};

export const uploadAsset = async ({ file, bucket, prefix }) => {
  if (!file) {
    return { publicUrl: "", path: "" };
  }

  // Security Check: File Type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type (${file.type}). Please upload PDF, Image (JPG/PNG), Word (DOC/DOCX), or Excel (XLS/XLSX) files.`);
  }

  // Auto-compression for images
  const finalFile = await compressImage(file);

  // Security Check: File Size (on the final file)
  if (finalFile.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File too large (${(finalFile.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed is 10MB.`);
  }

  const safeBucket = bucket || supabaseBuckets.documents;
  const path = `${prefix || "uploads"}/${Date.now()}-${slugify(finalFile.name)}`;

  if (!supabase) {
    const dataUrl = await fileToDataUrl(finalFile);
    return {
      publicUrl: dataUrl,
      signedUrl: dataUrl,
      path,
    };
  }

  const { error } = await supabase.storage.from(safeBucket).upload(path, finalFile, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const signedUrl = await createSignedAssetUrl({ bucket: safeBucket, path });
  return {
    publicUrl: "",
    signedUrl,
    path,
  };
};

export const removeAsset = async ({ bucket, path }) => {
  if (!path || !supabase) {
    return;
  }

  const safeBucket = bucket || supabaseBuckets.documents;
  const { error } = await supabase.storage.from(safeBucket).remove([path]);

  if (error) {
    throw error;
  }

  clearSignedAssetUrl({ bucket: safeBucket, path });
};




