export const normalizeEmail = (value: unknown) =>
  String(value || "").trim().toLowerCase();

export const requireEmail = (value: unknown, field = "email") => {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`A valid ${field} is required.`);
  }
  return email;
};

export const requireText = (value: unknown, field: string, max = 200) => {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required.`);
  if (text.length > max) throw new Error(`${field} must be ${max} characters or less.`);
  return text;
};

export const requireRole = (value: unknown, allowed: string[]) => {
  const role = String(value || "").trim().toUpperCase();
  if (!allowed.includes(role)) {
    throw new Error(`Invalid role. Allowed values: ${allowed.join(", ")}.`);
  }
  return role;
};

export const generateTemporaryPassword = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*?";
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let password = "";
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  return `${password}A1!`;
};

