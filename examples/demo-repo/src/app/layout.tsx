import { Analytics } from "@vercel/analytics/react";
import type { ReactNode } from "react";
import { PostHogProvider } from "./posthog";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
