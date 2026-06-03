export type MoneyInput = number | string;

export type SeedProduct = {
  name: string;
  slug: string;
  sku: string;
  category: string;
  brand: string;
  unit: string;
  mrp: number;
  price: number;
  gst: number;
  stock: number;
  lowStockThreshold: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  featured?: boolean;
  organic?: boolean;
  local?: boolean;
};
