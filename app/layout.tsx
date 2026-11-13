import Shell from "@/components/Shell";
import type { Metadata } from "next";

import "./globals.css";
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
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
