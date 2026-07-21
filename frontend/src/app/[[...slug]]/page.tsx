import type { Metadata } from "next";
import { CustomerApp } from "@/components/customer/CustomerApp";

const pageMetadata: Record<string, Metadata> = {
  education: {
    title: "Eagle Mart Education - Coming Soon",
    description: "Eagle Mart Education is coming soon with accessible learning resources, student support and skill-building experiences.",
    alternates: { canonical: "/education" },
  },
  entertainment: {
    title: "Eagle Mart Entertainment - Coming Soon",
    description: "Eagle Mart Entertainment is coming soon with family-friendly content, engaging digital experiences and more ways to enjoy your time.",
    alternates: { canonical: "/entertainment" },
  },
};

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug = [] } = await params;
  return pageMetadata[slug[0] || ""] || {};
}

export default async function CatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <CustomerApp slug={slug} />;
}
