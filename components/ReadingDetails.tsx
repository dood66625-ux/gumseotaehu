import type { ReactNode } from "react";
/** Full report view: the complete reading stays inline, without a second popup. */
export default function ReadingDetails({
  children,
}: {
  title: string;
  brief: ReactNode;
  children: ReactNode;
}) {
  return <div className="reading-inline-full">{children}</div>;
}
