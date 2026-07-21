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
  if (!process.env.DATABASE_URL?.startsWith("mysql://")) {
    throw new Error('DATABASE_URL must use the MySQL format: mysql://USER:PASSWORD@127.0.0.1:3306/DB_NAME');
  }
  if (process.env.NODE_ENV === "production") {
    for (const key of productionRequired) {
      if (!process.env[key]) throw new Error(`Missing required production environment variable: ${key}`);
    }
    if ((process.env.JWT_SECRET || "").length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters in production.");
    }
    const origins = (process.env.FRONTEND_ORIGIN || "").split(",").map((origin) => origin.trim()).filter(Boolean);
    if (!origins.length || origins.some((origin) => !origin.startsWith("https://"))) {
      throw new Error("FRONTEND_ORIGIN must contain HTTPS origin(s) in production.");
    }
  }
}

export function readinessConfig() {
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    databaseUrl: Boolean(process.env.DATABASE_URL),
    jwtSecret: Boolean(process.env.JWT_SECRET),
    frontendOrigin: Boolean(process.env.FRONTEND_ORIGIN),
    cookieDomain: Boolean(process.env.COOKIE_DOMAIN),
    razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET),
    emailConfigured: Boolean((process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM) || process.env.SENDGRID_API_KEY),
  };
}
