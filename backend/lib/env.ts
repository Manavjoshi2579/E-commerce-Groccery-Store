const required = ["DATABASE_URL"] as const;

export function getEnv(name: (typeof required)[number]) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnv() {
  for (const key of required) getEnv(key);
}
