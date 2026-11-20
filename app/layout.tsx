import Shell from "@/components/Shell";
import type { Metadata } from "next";

import "./globals.css";
// Runtime payment mode must not be frozen into pre-rendered checkout/recovery shells.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    default: "금서태후 | 그대의 기운을 읽다",
    template: "%s | 금서태후",
  },
  description:
    "전통 명리학으로 나를 돌아보는 시간. 금서태후의 개인 맞춤 종합 운명서.",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Shell
          livePayments={
            process.env.TOSS_PAYMENT_MODE === "live" &&
            process.env.LIVE_PAYMENTS_APPROVAL === "live-payments-approved"
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
