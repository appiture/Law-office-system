/**
 * Validates that all required environment variables are present.
 * Throws an error if any are missing to prevent broken deployments.
 */

const REQUIRED_ENV_VARS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
];

export const validateEnv = () => {
  const missing = REQUIRED_ENV_VARS.filter(key => !import.meta.env[key]);
  
  if (missing.length > 0) {
    const errorMsg = `Critical Configuration Error: Missing environment variables: ${missing.join(", ")}`;
    console.error(errorMsg);
    
    // In production, we want to fail loudly
    if (import.meta.env.PROD) {
      throw new Error(errorMsg);
    }
  }
};
