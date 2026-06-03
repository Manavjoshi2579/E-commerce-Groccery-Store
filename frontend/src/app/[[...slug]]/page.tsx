import { CustomerApp } from "@/components/customer/CustomerApp";

export default async function CatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <CustomerApp slug={slug} />;
}
