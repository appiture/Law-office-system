/**
 * exportService.js
 * 
 * Handles universal data export by calling the 'export-report' Edge Function.
 */

import { supabase } from "./supabaseClient";

/**
 * Trigger an export and download the resulting file.
 */
export const triggerExport = async ({ format, type, dateRange, filters, includeSections, selectedIds }) => {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    // Use direct fetch for better blob/header control as per STEP 2
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ format, type, dateRange, filters, includeSections, selectedIds }),
    });

    // STEP 5 — DEBUG SERVER RESPONSE
    console.log("Export Response Status:", response.status);
    console.log("Export Content-Type:", response.headers.get("content-type"));

    if (response.status === 202) {
      const data = await response.json();
      return { 
        success: true, 
        isBackground: true, 
        message: data?.message || "Report is being processed in the background." 
      };
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Export failed with status ${response.status}`);
    }

    // STEP 3 — VALIDATE RESPONSE TYPE
    const contentType = response.headers.get("content-type");
    if (!contentType) {
      throw new Error("Missing content type from server");
    }

    // STEP 2 — FIX FRONTEND EXPORT SERVICE
    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      throw new Error("Empty export file received from server");
    }

    // Get filename from header or fallback
    const contentDisposition = response.headers.get("content-disposition");
    let filename = `report_${new Date().toISOString().slice(0, 10)}.${format}`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    // STEP 4 — HANDLE DOWNLOAD PROPERLY
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    return { success: true, isBackground: false };
  } catch (err) {
    console.error("Export Error:", err);
    throw err;
  }
};
