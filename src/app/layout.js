import "./globals.css";
import { ThemeProvider } from "@/lib/context/theme-context";
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: "PayPilot AI — Smart Invoicing & Payment Collection",
  description: "AI-powered invoicing and payment collection assistant for freelancers and small businesses.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('paypilot_theme');
                  if (saved !== 'dark' && saved !== 'light') {
                    if (saved) localStorage.removeItem('paypilot_theme');
                    saved = null;
                  }
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (saved === 'dark' || (!saved && prefersDark)) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#E8EDF4] text-[#172033] font-sans" suppressHydrationWarning>
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
