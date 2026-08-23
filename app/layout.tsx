import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "CivicLens — Verify with evidence", template: "%s · CivicLens" },
  description: "Automatic-language, evidence-first fact checking for live videos, social posts, and public articles.",
  applicationName: "CivicLens",
  keywords: ["fact check", "multilingual", "YouTube live", "evidence", "media literacy"],
  alternates: { canonical: "/" },
  openGraph: {
    title: "CivicLens — See the claim. Trace the evidence.",
    description: "Automatic-language fact checking for public videos, posts, and articles.",
    url: "/",
    siteName: "CivicLens",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: "CivicLens evidence-first fact checking" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "CivicLens", description: "See the claim. Trace the evidence.", images: ["/opengraph-image.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
