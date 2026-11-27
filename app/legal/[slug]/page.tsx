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
  const live =
    process.env.TOSS_PAYMENT_MODE === "live" &&
    process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved";
  if (slug === "content") return <ContentGuide live={live} />;
  if (slug === "refund") return <RefundPolicy />;
  if (!policySlugs.includes(slug)) notFound();
  return (
    <PolicyDraft
      slug={slug}
      live={
        process.env.TOSS_PAYMENT_MODE === "live" &&
        process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved"
      }
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const live =
    process.env.TOSS_PAYMENT_MODE === "live" &&
    process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved";
  const publicPage = policySlugs.includes(slug) || slug === "content";
  return {
    robots: { index: live && publicPage, follow: live && publicPage },
    ...(live && publicPage
      ? { alternates: { canonical: "https://gumseo.kr/legal/" + slug } }
      : {}),
  };
}
