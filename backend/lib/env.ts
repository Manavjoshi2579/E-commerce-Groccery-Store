const required = ["DATABASE_URL"] as const;
const productionRequired = ["JWT_SECRET", "FRONTEND_ORIGIN"] as const;

export function getEnv(name: (typeof required)[number]) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function validateEnv() {
  for (const key of required) getEnv(key);
  if (process.env.NODE_ENV === "production") {
    for (const key of productionRequired) {
      if (!process.env[key]) throw new Error(`Missing required production environment variable: ${key}`);
    }
  }
}
