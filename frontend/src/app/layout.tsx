import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });

export const metadata: Metadata = {
  title: "Eagle Mart Grocery & Essentials",
  description: "Premium groceries and daily essentials delivered to your doorstep.",
  icons: {
    icon: "/assets/brand/eagle-mart-favicon.svg",
    shortcut: "/assets/brand/eagle-mart-favicon.svg",
    apple: "/assets/brand/eagle-mart-favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${montserrat.variable}`}>{children}</body>
    </html>
  );
}
