import { Decimal } from "@prisma/client/runtime/library";

export function decimal(value: number | string) {
  return new Decimal(value);
}

export function lineTotal(price: number, quantity: number) {
  return decimal(price).mul(quantity);
}
