import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Coffee",
  description: "Gestión de finanzas personales",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Coffee",
    startupImage: "/stat_icon.svg",
  },
  icons: {
    icon: "/stat_icon.svg",
    apple: "/stat_icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e15" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Inter: la grotesca neutra de la banca digital. Sobria, muy legible en cifras
// pequeñas y con figuras tabulares reales para los montos.
const fontSans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", fontSans.variable)}
    >
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
