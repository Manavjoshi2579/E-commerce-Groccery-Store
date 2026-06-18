import { Prisma, RoleName } from "@prisma/client";
import { db } from "./db.js";

export type AdminRbacContext = {
  adminUserId: string;
  role: RoleName;
  deliveryStaffId?: string | null;
};

function mergeWhere<T>(current: T | undefined, scoped: T): T {
  if (!current) return scoped;
  return { AND: [current, scoped] } as T;
}

function scopedOrderWhere(context: AdminRbacContext): Prisma.OrderWhereInput | undefined {
  if (context.role === RoleName.SUPER_ADMIN) return undefined;

  if (context.role === RoleName.DELIVERY_STAFF) {
    if (context.deliveryStaffId) {
      return { deliveryAssignment: { deliveryStaffId: context.deliveryStaffId } };
    }

    // Current schema has no AdminUser -> DeliveryStaff relation. Until that relation
    // exists, delivery staff sees delivery-team orders only, never unrelated admin data.
    return { deliveryAssignment: { isNot: null } };
  }

  return undefined;
}

export function prismaForAdmin(context: AdminRbacContext) {
  return db.$extends({
    name: "admin-rbac-scope",
    query: {
      order: {
        async findMany({ args, query }) {
          const where = scopedOrderWhere(context);
          if (where) args.where = mergeWhere(args.where, where);
          return query(args);
        },
        async findFirst({ args, query }) {
          const where = scopedOrderWhere(context);
          if (where) args.where = mergeWhere(args.where, where);
          return query(args);
        },
        async count({ args, query }) {
          const where = scopedOrderWhere(context);
          if (where) args.where = mergeWhere(args.where, where);
          return query(args);
        },
      },
      deliveryAssignment: {
        async findMany({ args, query }) {
          if (context.role === RoleName.DELIVERY_STAFF && context.deliveryStaffId) {
            args.where = mergeWhere(args.where, { deliveryStaffId: context.deliveryStaffId });
          }
          return query(args);
        },
        async findFirst({ args, query }) {
          if (context.role === RoleName.DELIVERY_STAFF && context.deliveryStaffId) {
            args.where = mergeWhere(args.where, { deliveryStaffId: context.deliveryStaffId });
          }
          return query(args);
        },
        async count({ args, query }) {
          if (context.role === RoleName.DELIVERY_STAFF && context.deliveryStaffId) {
            args.where = mergeWhere(args.where, { deliveryStaffId: context.deliveryStaffId });
          }
          return query(args);
        },
      },
    },
  });
}

export type RbacPrismaClient = ReturnType<typeof prismaForAdmin>;
