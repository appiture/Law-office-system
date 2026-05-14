/**
 * exportService.js
 * 
 * Handles universal data export by calling the 'export-report' Edge Function.
 */

import { supabase } from "./supabaseClient";

/**
 * Trigger an export and download the resulting file.
 * 
 * @param {Object} options
 * @param {'pdf'|'xlsx'|'csv'|'docx'} options.format - Export format
 * @param {'dashboard'|'clients'|'cases'|'payments'|'followups'|'documents'|'tasks'} options.type - Module type
 * @param {Object} [options.dateRange] - { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 * @param {Object} [options.filters] - Current search filters
 * @param {string[]} [options.includeSections] - Specific sections to include (for dashboard)
 * @param {string[]} [options.selectedIds] - Specific IDs to export
 */
export const triggerExport = async ({ format, type, dateRange, filters, includeSections, selectedIds }) => {
  try {
    const { data, error, status } = await supabase.functions.invoke("export-report", {
      body: { format, type, dateRange, filters, includeSections, selectedIds },
    });

    if (error) {
      let errMsg = error.message;
      if (data?.error) errMsg = data.error;
      throw new Error(errMsg || "Export failed.");
    }

    // Handle background processing (Large Exports - Task 15)
    if (status === 202) {
      return { 
        success: true, 
        isBackground: true, 
        message: data?.message || "Report is being processed in the background. You will be notified via email." 
      };
    }

    if (!(data instanceof Blob)) {
      if (data?.error) throw new Error(data.error);
      throw new Error("Invalid response format from server.");
    }

    // Create download link
    const blob = new Blob([data], { type: data.type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    // Fallback filename if backend didn't provide one (though it usually does in response headers)
    const timestamp = new Date().toISOString().slice(0, 10);
    const fileName = `${type}_report_${timestamp}.${format}`;
    link.setAttribute("download", fileName);
    
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return { success: true, isBackground: false };
  } catch (err) {
    console.error("Export Error:", err);
    throw err;
  }
};
