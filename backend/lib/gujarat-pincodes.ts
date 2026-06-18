export function isGujaratPincode(pincode: string) {
  const normalized = pincode.trim();
  return /^3[6-9]\d{4}$/.test(normalized);
}

export const gujaratPincodePrefixes = ["36", "37", "38", "39"];
