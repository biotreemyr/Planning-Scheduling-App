import type { Metadata } from "next";
import "@toast-ui/calendar/dist/toastui-calendar.min.css";
import "./globals.css";
import "./workstation.css";

export const metadata: Metadata = {
  title: "Bio Tree Scheduler MVP",
  description: "Production planning and detailed scheduling MVP for Bio Tree"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
