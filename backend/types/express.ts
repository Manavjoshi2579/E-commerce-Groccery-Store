import type { SessionPayload } from "../lib/auth.js";
import type { RbacPrismaClient } from "../lib/prisma-rbac.js";
import type { SafeAdmin, SafeUser } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
      customer?: SafeUser;
      admin?: SafeAdmin;
      db?: RbacPrismaClient;
    }
  }
}

export {};
