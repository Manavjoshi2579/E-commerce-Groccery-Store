import { Prisma } from "@prisma/client";
import { db } from "../lib/db.js";

const defaultDeliverySlots = [
  { label: "Express", startTime: "30 mins", endTime: "90 mins", capacity: 40 },
  { label: "Morning", startTime: "07:00", endTime: "11:00", capacity: 80 },
  { label: "Afternoon", startTime: "12:00", endTime: "16:00", capacity: 80 },
  { label: "Evening", startTime: "17:00", endTime: "21:00", capacity: 80 },
];

function decimal(value: Prisma.Decimal | number | null | undefined) {
  return value == null ? 0 : Number(value);
}

function pincodes(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function matchesPincode(zonePincodes: string[], pincode: string) {
  return zonePincodes.some((entry) => {
    const normalized = entry.trim();
    return /^\d{6}$/.test(normalized) && normalized === pincode;
  });
}

function extractIndianPincode(...values: unknown[]) {
  return values.map((value) => String(value || "")).join(" ").match(/\b[1-9]\d{5}\b/)?.[0] || "";
}

function placeLabel(...values: unknown[]) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(", ");
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`Location provider returned ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function mapZone(zone: any) {
  return {
    id: zone.id,
    city: zone.city,
    pincodes: pincodes(zone.pincodes),
    deliveryCharge: decimal(zone.deliveryCharge),
    freeDeliveryThreshold: decimal(zone.freeDeliveryThreshold),
    active: zone.active,
  };
}

export function mapSlot(slot: any, date?: Date) {
  return {
    id: slot.id,
    label: slot.label,
    startTime: slot.startTime,
    endTime: slot.endTime,
    capacity: slot.capacity,
    remainingCapacity: slot.capacity,
    active: slot.active,
    date: date?.toISOString().slice(0, 10),
  };
}

export async function listDeliveryZones() {
  const zones = await db.deliveryZone.findMany({ where: { active: true }, orderBy: { city: "asc" } });
  return zones.map(mapZone);
}

export async function findZoneByPincode(pincode: string) {
  const zones = await db.deliveryZone.findMany({ where: { active: true } });
  return zones.find((zone) => matchesPincode(pincodes(zone.pincodes), pincode)) || zones[0] || null;
}

async function ensureDefaultSlots(zoneId: string) {
  const existing = await db.deliverySlot.findMany({ where: { active: true, OR: [{ zoneId }, { zoneId: null }] }, orderBy: { startTime: "asc" } });
  if (existing.length) return existing;
  await Promise.all(defaultDeliverySlots.map((slot) => db.deliverySlot.create({ data: { ...slot, zoneId } })));
  return db.deliverySlot.findMany({ where: { active: true, zoneId }, orderBy: { startTime: "asc" } });
}

export async function checkPincode(pincode: string) {
  const zone = await findZoneByPincode(pincode);
  return {
    serviceable: true,
    zone: zone ? mapZone(zone) : null,
    message: "Pincode is serviceable.",
  };
}

export async function reverseGeocodeLocation(latitude: number, longitude: number) {
  const providers = [
    async () => {
      const data = await fetchJson<{
        display_name?: string;
        address?: { postcode?: string; city?: string; town?: string; village?: string; suburb?: string; state?: string; country?: string };
      }>(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&addressdetails=1`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "EagleMartGrocery/1.0 (https://eaglesclub.in)",
        },
      });
      const pincode = extractIndianPincode(data.address?.postcode, data.display_name);
      return {
        pincode,
        place: placeLabel(data.address?.suburb || data.address?.city || data.address?.town || data.address?.village, data.address?.state, data.address?.country),
        provider: "openstreetmap",
      };
    },
    async () => {
      const data = await fetchJson<{
        postcode?: string;
        locality?: string;
        city?: string;
        principalSubdivision?: string;
        countryName?: string;
        localityInfo?: unknown;
      }>(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`);
      const pincode = extractIndianPincode(data.postcode, data.localityInfo, data.locality, data.city);
      return {
        pincode,
        place: placeLabel(data.locality || data.city, data.principalSubdivision, data.countryName),
        provider: "bigdatacloud",
      };
    },
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result.pincode) {
        const availability = await checkPincode(result.pincode);
        return { ...result, serviceable: availability.serviceable, zone: availability.zone, message: availability.message };
      }
    } catch {
      // Try the next provider. The route returns a clear error if all providers fail.
    }
  }

  throw new Error("Could not detect a pincode for this location. Please enter your pincode manually.");
}

export async function listSlotsForPincode(pincode: string, date: Date) {
  const zone = await findZoneByPincode(pincode);
  if (!zone) return { serviceable: true, zone: null, slots: [] };
  const slots = await ensureDefaultSlots(zone.id);
  return { serviceable: true, zone: mapZone(zone), slots: slots.map((slot) => mapSlot(slot, date)) };
}
