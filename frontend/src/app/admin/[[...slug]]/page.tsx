import { AdminApp } from "@/components/admin/AdminApp";

export default async function AdminCatchAll({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  return <AdminApp slug={slug} />;
}
