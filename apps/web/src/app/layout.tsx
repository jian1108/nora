import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nora — AI Office Receptionist (LiveKit + LobbyStack Architecture)",
  description:
    "After-hours phone receptionist powered by LiveKit Phone Numbers, automated requirement summarization, calendar booking, and SMS confirmation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}

