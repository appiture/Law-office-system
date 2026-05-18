export const FEATURE_FLAGS = {
  // Export & Reporting
  ENABLE_BETA_EXPORTS: true,
  ENABLE_PDF_EXPORTS: true,
  
  // Advanced features
  ENABLE_ADVANCED_AUDIT: true,
  
  // Administrative
  ENABLE_SUPER_ADMIN_TOOLS: true,
};

export const isFeatureEnabled = (flag) => {
  return FEATURE_FLAGS[flag] === true;
};
