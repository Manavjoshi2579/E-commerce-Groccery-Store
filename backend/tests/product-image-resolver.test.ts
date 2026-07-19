import { describe, expect, it } from "vitest";
import { ImageStatus } from "@prisma/client";
import { isProductImageUrl, productImageFallback, resolveProductImage } from "../lib/product-image-resolver.js";

describe("product image resolver", () => {
  it("returns the neutral product placeholder when no product image exists", () => {
    expect(resolveProductImage({ name: "Missing Product", imageStatus: ImageStatus.PLACEHOLDER, images: [] })).toMatchObject({
      url: productImageFallback,
      status: "Placeholder",
      isPlaceholder: true,
    });
  });

  it("rejects category and banner artwork as product images", () => {
    expect(isProductImageUrl("/assets/categories/atta-rice-dal.png")).toBe(false);
    expect(isProductImageUrl("/assets/banners/festival-offer-banner.png")).toBe(false);
    expect(isProductImageUrl("/assets/placeholders/product-placeholder-generated.png")).toBe(false);
  });

  it("normalizes duplicate upload paths and chooses the declared primary image", () => {
    const resolved = resolveProductImage({
      name: "Surf Excel",
      imageStatus: ImageStatus.VERIFIED,
      images: [
        { url: "/assets/products/client-catalog/old.webp", isPrimary: false, sortOrder: 0 },
        { url: "uploads/uploads/products/surf.webp", isPrimary: true, sortOrder: 1 },
      ],
    });
    expect(resolved.url).toBe("/uploads/products/surf.webp");
    expect(resolved.status).toBe("Image Available");
  });

  it("keeps review-required status internal to admin-facing DTOs", () => {
    expect(resolveProductImage({
      name: "Review Product",
      imageStatus: ImageStatus.NEEDS_REVIEW,
      images: [{ url: "/assets/products/client-catalog/review.webp", isPrimary: true }],
    }).status).toBe("Review Required");
  });
});
