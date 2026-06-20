import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(backendRoot, ".env");

config({ path: existsSync(envFile) ? envFile : undefined, quiet: true });
