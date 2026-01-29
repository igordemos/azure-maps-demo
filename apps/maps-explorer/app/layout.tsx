import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Azure Maps API Explorer",
  description:
    "Explore geocoding, reverse geocoding, autocomplete, routing, weather, and IP geolocation scenarios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="grid-backdrop fixed inset-0 -z-10" />
        {children}
      </body>
    </html>
  );
}
