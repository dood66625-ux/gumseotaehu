import ContentGuide from "@/components/ContentGuide";
import RefundPolicy from "@/components/RefundPolicy";
import PolicyDraft, { policySlugs } from "@/components/PolicyDraft";
import { notFound } from "next/navigation";
export function generateStaticParams() {
  return [...policySlugs, "content"].map((slug) => ({ slug }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug;
  if (slug === "content") return <ContentGuide />;
  if (slug === "refund") return <RefundPolicy />;
  if (!policySlugs.includes(slug)) notFound();
  return <PolicyDraft slug={slug} />;
}
