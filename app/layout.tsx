import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProvider } from "@/contexts/WalletContext";
import { PinProvider } from "@/contexts/PinContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import Script from "next/script";
import { SidebarOverlay, GeometricShapes } from "./components/LayoutClient";
import SupportChat from "./components/SupportChat";

export const metadata: Metadata = {
  title: "INJ Pass",
  description: "Passkey-powered wallet for Injective",
  icons: {
    icon: [
      { url: "/inj-pass-favicon.png" },
      { url: "/inj-pass-favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/inj-pass-favicon.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/inj-pass-favicon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 5.0,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet" />
        <Script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js" strategy="beforeInteractive" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var storedTheme = localStorage.getItem('injpass_theme_mode');
              var hour = new Date().getHours();
              var fallbackTheme = hour >= 7 && hour < 19 ? 'light' : 'dark';
              var theme = storedTheme === 'light' || storedTheme === 'dark'
                ? storedTheme
                : fallbackTheme;

              document.documentElement.dataset.theme = theme;
              document.documentElement.style.colorScheme = theme;

              var applyBodyTheme = function () {
                if (document.body) {
                  document.body.dataset.theme = theme;
                }
              };

              applyBodyTheme();

              if (!document.body) {
                document.addEventListener('DOMContentLoaded', applyBodyTheme, { once: true });
              }
            } catch (error) {}
          `}
        </Script>
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          {/* Sidebar Overlay */}
          <SidebarOverlay />
          
          {/* Sidebar Container */}
          <div className="sidebar-container">
            {/* Sidebar content will be injected here */}
          </div>

          {/* Animated Background and Geometric Shapes */}
          <GeometricShapes />

          <PinProvider>
            <WalletProvider>
              {children}
              <SupportChat />
            </WalletProvider>
          </PinProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
