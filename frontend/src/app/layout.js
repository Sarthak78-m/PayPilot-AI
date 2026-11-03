import "./globals.css";

export const metadata = {
  title: "PayPilot AI — Smart Invoicing & Payment Collection",
  description: "AI-powered invoicing and payment collection assistant for freelancers and small businesses.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#E8EDF4] text-[#172033] font-sans">
        {children}
      </body>
    </html>
  );
}
