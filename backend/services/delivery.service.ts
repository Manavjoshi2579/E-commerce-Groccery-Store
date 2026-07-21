import { DeliveryBlockScope, FulfillmentType, Prisma } from "@prisma/client";
import { db } from "../lib/db.js";

const defaultDeliverySlots = [
  { label: "Express", startTime: "30 mins", endTime: "90 mins", capacity: 40 },
  { label: "Morning", startTime: "07:00", endTime: "11:00", capacity: 80 },
  { label: "Afternoon", startTime: "12:00", endTime: "16:00", capacity: 80 },
  { label: "Evening", startTime: "17:00", endTime: "21:00", capacity: 80 },
];

const fallbackCity = "Default Service Area";

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? null : Number(value);
}

function dateBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function slotLimit(slot: any) {
  return Math.max(1, Number(slot.maxOrdersPerDate ?? slot.capacity));
}

function eligibleFor(slot: any, type = FulfillmentType.DELIVERY) {
  const eligibility = String(slot.deliveryTypeEligibility ?? "DELIVERY").toUpperCase();
  return eligibility === "ALL" || eligibility === type;
}

function sameDayCutoffPassed(slot: any, date: Date) {
  if (!slot.sameDayCutoffTime) return false;
  const today = new Date();
  const target = new Date(date);
  if (today.toDateString() !== target.toDateString()) return false;
  const [hour, minute] = String(slot.sameDayCutoffTime).split(":").map(Number);
  const cutoff = new Date(today);
  cutoff.setHours(hour, minute, 0, 0);
  return today > cutoff;
}

function advanceWindowExceeded(slot: any, date: Date) {
  if (slot.advanceBookingDays == null) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return target.getTime() - today.getTime() > slot.advanceBookingDays * 86_400_000;
}

function pincodes(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchesPincode(zonePincodes: string[], pincode: string) {
  return zonePincodes.some((entry) => {
    const normalized = entry.trim();
    return /^\d{6}$/.test(normalized) && normalized === pincode;
  }) || zonePincodes.some((entry) => {
    const normalized = entry.trim();
    return /^\d{2,5}$/.test(normalized) && pincode.startsWith(normalized);
  });
}

export function mapZone(zone: any) {
  return {
    id: zone.id,
    city: zone.city,
    pincodes: pincodes(zone.pincodes),
    deliveryCharge: decimal(zone.deliveryCharge) ?? 0,
    freeDeliveryThreshold: decimal(zone.freeDeliveryThreshold) ?? 0,
    active: zone.active,
  };
}

export function mapSlot(slot: any, date?: Date, reserved = 0) {
  const limit = slotLimit(slot);
  return {
    id: slot.id,
    label: slot.label,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    maxOrdersPerDate: slot.maxOrdersPerDate,
    minOrderAmount: decimal(slot.minOrderAmount),
    deliveryTypeEligibility: slot.deliveryTypeEligibility ?? "DELIVERY",
    advanceBookingDays: slot.advanceBookingDays,
    sameDayCutoffTime: slot.sameDayCutoffTime,
    displayOrder: slot.displayOrder ?? 0,
    reservedOrders: reserved,
    remainingCapacity: Math.max(0, limit - reserved),
    active: slot.active && reserved < limit,
    date: date?.toISOString().slice(0, 10),
  };
}

export async function listDeliveryZones() {
  const zones = await db.deliveryZone.findMany({ where: { active: true }, orderBy: { city: "asc" } });
  return zones.map(mapZone);
}

export async function findZoneByPincode(pincode: string) {
  const zones = await db.deliveryZone.findMany({ where: { active: true } });
  const matchingZone = zones.find((zone) => matchesPincode(pincodes(zone.pincodes), pincode));
  if (matchingZone || zones[0]) return matchingZone || zones[0];
  return db.deliveryZone.upsert({
    where: { city: fallbackCity },
    update: { active: true },
    create: {
      city: fallbackCity,
      pincodes: [pincode].filter((value) => /^\d{6}$/.test(value)),
      deliveryCharge: 49,
      freeDeliveryThreshold: 799,
      active: true,
    },
  });
}

async function ensureDefaultSlots(zoneId: string) {
  const existing = await db.deliverySlot.findMany({ where: { active: true, OR: [{ zoneId }, { zoneId: null }] }, orderBy: [{ displayOrder: "asc" }, { startTime: "asc" }] });
  if (existing.length) return existing;
  await Promise.all(defaultDeliverySlots.map((slot, index) => db.deliverySlot.create({ data: { ...slot, displayOrder: index, zoneId } })));
  return db.deliverySlot.findMany({ where: { active: true, zoneId }, orderBy: [{ displayOrder: "asc" }, { startTime: "asc" }] });
}

export async function checkPincode(pincode: string) {
  const zone = await findZoneByPincode(pincode);
  return {
    serviceable: true,
    zone: zone ? mapZone(zone) : null,
    message: "Pincode is serviceable.",
  };
}

export async function listSlotsForPincode(pincode: string, date: Date) {
  const zone = await findZoneByPincode(pincode);
  if (!zone) return { serviceable: true, zone: null, slots: [] };
  const { start, end } = dateBounds(date);
  const holiday = await db.deliveryHoliday.findFirst({ where: { active: true, date: { gte: start, lt: end }, scope: { in: [DeliveryBlockScope.DELIVERY, DeliveryBlockScope.ALL] } } });
  if (holiday) return { serviceable: true, zone: mapZone(zone), slots: [], blocked: true, reason: holiday.reason ?? "Delivery is not available for this date." };
  const slots = await ensureDefaultSlots(zone.id);
  const counts = await db.order.groupBy({
    by: ["deliverySlotId"],
    where: { deliveryDate: { gte: start, lt: end }, deliverySlotId: { in: slots.map((slot) => slot.id) }, status: { notIn: ["CANCELLED", "REFUNDED"] } },
    _count: { _all: true },
  });
  const countBySlot = new Map(counts.map((item) => [item.deliverySlotId, item._count._all]));
  const available = slots
    .filter((slot) => eligibleFor(slot) && !sameDayCutoffPassed(slot, date) && !advanceWindowExceeded(slot, date))
    .map((slot) => mapSlot(slot, date, countBySlot.get(slot.id) ?? 0))
    .filter((slot) => slot.active);
  return { serviceable: true, zone: mapZone(zone), slots: available };
}

export async function listAdminSlots() {
  const slots = await db.deliverySlot.findMany({ include: { zone: true }, orderBy: [{ active: "desc" }, { displayOrder: "asc" }, { startTime: "asc" }] });
  return slots.map((slot) => ({ ...mapSlot(slot), zone: slot.zone ? mapZone(slot.zone) : null, zoneId: slot.zoneId }));
}

export async function createDeliverySlot(input: { label: string; startTime: string; endTime: string; capacity: number; maxOrdersPerDate?: number | null; minOrderAmount?: number | null; deliveryTypeEligibility?: string; advanceBookingDays?: number | null; sameDayCutoffTime?: string | null; displayOrder?: number; zoneId?: string | null; active?: boolean }) {
  const slot = await db.deliverySlot.create({ data: { ...input, active: input.active ?? true } });
  return mapSlot(slot);
}

export async function updateDeliverySlot(id: string, input: Partial<{ label: string; startTime: string; endTime: string; capacity: number; maxOrdersPerDate: number | null; minOrderAmount: number | null; deliveryTypeEligibility: string; advanceBookingDays: number | null; sameDayCutoffTime: string | null; displayOrder: number; zoneId: string | null; active: boolean }>) {
  const slot = await db.deliverySlot.update({ where: { id }, data: input });
  return mapSlot(slot);
}

export async function assertDeliverySlotAvailability(tx: Prisma.TransactionClient, slotId: string | null | undefined, deliveryDate: Date, orderTotal: number, fulfillmentType: FulfillmentType) {
  if (fulfillmentType !== FulfillmentType.DELIVERY) return;
  if (!slotId) throw new Error("Delivery slot is not available.");
  const slot = await tx.deliverySlot.findFirst({ where: { id: slotId, active: true } });
  if (!slot || !eligibleFor(slot, FulfillmentType.DELIVERY)) throw new Error("Delivery slot is not available.");
  if (slot.minOrderAmount && orderTotal < Number(slot.minOrderAmount)) throw new Error("Cart total does not meet this delivery slot minimum.");
  if (sameDayCutoffPassed(slot, deliveryDate) || advanceWindowExceeded(slot, deliveryDate)) throw new Error("Delivery slot is not available for this date.");
  const { start, end } = dateBounds(deliveryDate);
  const holiday = await tx.deliveryHoliday.findFirst({ where: { active: true, date: { gte: start, lt: end }, scope: { in: [DeliveryBlockScope.DELIVERY, DeliveryBlockScope.ALL] } } });
  if (holiday) throw new Error("Delivery is not available for this date.");
  const reserved = await tx.order.count({ where: { deliverySlotId: slot.id, deliveryDate: { gte: start, lt: end }, status: { notIn: ["CANCELLED", "REFUNDED"] } } });
  if (reserved >= slotLimit(slot)) throw new Error("Delivery slot is full for this date.");
}

export async function deleteDeliverySlot(id: string) {
  const orders = await db.order.count({ where: { deliverySlotId: id } });
  if (orders > 0) {
    await db.deliverySlot.update({ where: { id }, data: { active: false } });
    return { deleted: false, deactivated: true };
  }
  await db.deliverySlot.delete({ where: { id } });
  return { deleted: true, deactivated: false };
}
