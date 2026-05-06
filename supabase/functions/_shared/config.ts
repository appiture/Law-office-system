export const env = (name: string, fallback = "") => Deno.env.get(name) || fallback;

export const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const appBaseUrl = () =>
  env("APP_BASE_URL", env("SITE_URL", "http://localhost:5173")).replace(/\/+$/, "");

export const supportEmail = () => env("SUPPORT_EMAIL", "support@appiture.in");

export const emailFrom = () =>
  env("EMAIL_FROM", "Law Office Platform <noreply@appiture.in>");

