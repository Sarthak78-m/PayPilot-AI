export const metadata = {
  title: "Pay Invoice | PayPilot AI",
  description: "Secure customer checkout powered by PayPilot AI",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PublicPaymentLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#E8EDF4] text-[#172033] antialiased selection:bg-[#2563EB]/20 selection:text-[#172033]">
      {children}
    </div>
  );
}
