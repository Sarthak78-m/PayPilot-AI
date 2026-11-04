/**
 * ============================================================================
 * PAYPILOT AI — DEVELOPMENT PREVIEW MOCK DATA
 * ============================================================================
 * NOTICE: This dataset is strictly for frontend UI/UX testing and development
 * previews while backend analytics and invoice service endpoints are under
 * development. It is fully isolated and does NOT represent real user data.
 * ============================================================================
 */

export const IS_MOCK_DATA = true;

export const mockDashboardMetrics = {
  totalRevenue: {
    amount: 48250.0,
    formatted: "$48,250.00",
    trend: "+14.2%",
    trendDirection: "up",
    period: "vs previous month",
    description: "Gross billings reconciled across all clients",
  },
  paidInvoices: {
    count: 32,
    amount: 38400.0,
    formatted: "$38,400.00",
    trend: "+8.5%",
    trendDirection: "up",
    period: "32 invoices settled",
    description: "Cleared funds deposited to connected account",
  },
  pendingInvoices: {
    count: 7,
    amount: 7650.0,
    formatted: "$7,650.00",
    trend: "7 active",
    trendDirection: "neutral",
    period: "Net 15 / Net 30 terms",
    description: "Sent and awaiting client payment approval",
  },
  overdueInvoices: {
    count: 2,
    amount: 2200.0,
    formatted: "$2,200.00",
    trend: "2 past due",
    trendDirection: "down",
    period: "Past due date",
    description: "Payment reminders ready to dispatch",
  },
};

export const mockRevenueTrends = {
  "6M": [
    { label: "Jun", month: "June", revenue: 5400, invoices: 4 },
    { label: "Jul", month: "July", revenue: 7100, invoices: 5 },
    { label: "Aug", month: "August", revenue: 6800, invoices: 5 },
    { label: "Sep", month: "September", revenue: 8900, invoices: 6 },
    { label: "Oct", month: "October", revenue: 9800, invoices: 7 },
    { label: "Nov", month: "November (MTD)", revenue: 10250, invoices: 5 },
  ],
  "1Y": [
    { label: "Jan", month: "January", revenue: 3200, invoices: 3 },
    { label: "Feb", month: "February", revenue: 4100, invoices: 3 },
    { label: "Mar", month: "March", revenue: 4900, invoices: 4 },
    { label: "Apr", month: "April", revenue: 5200, invoices: 4 },
    { label: "May", month: "May", revenue: 6100, invoices: 5 },
    { label: "Jun", month: "June", revenue: 5400, invoices: 4 },
    { label: "Jul", month: "July", revenue: 7100, invoices: 5 },
    { label: "Aug", month: "August", revenue: 6800, invoices: 5 },
    { label: "Sep", month: "September", revenue: 8900, invoices: 6 },
    { label: "Oct", month: "October", revenue: 9800, invoices: 7 },
    { label: "Nov", month: "November", revenue: 10250, invoices: 5 },
    { label: "Dec", month: "December (Projected)", revenue: 11500, invoices: 6 },
  ],
  ALL: [
    { label: "2024 H1", month: "2024 H1", revenue: 18400, invoices: 16 },
    { label: "2024 H2", month: "2024 H2", revenue: 26500, invoices: 22 },
    { label: "2025 H1", month: "2025 H1", revenue: 34100, invoices: 28 },
    { label: "2025 H2", month: "2025 H2", revenue: 42800, invoices: 34 },
    { label: "2026 YTD", month: "2026 Year-to-Date", revenue: 48250, invoices: 41 },
  ],
};

export const mockRecentInvoices = [
  {
    id: "INV-2026-041",
    customer: "Vanguard Design Studio",
    clientEmail: "accounts@vanguard.io",
    amount: 3450.0,
    formattedAmount: "$3,450.00",
    issueDate: "2026-10-28",
    dueDate: "2026-11-12",
    status: "pending",
  },
  {
    id: "INV-2026-040",
    customer: "AeroTech Labs",
    clientEmail: "billing@aerotech.dev",
    amount: 1800.0,
    formattedAmount: "$1,800.00",
    issueDate: "2026-10-15",
    dueDate: "2026-10-30",
    status: "overdue",
  },
  {
    id: "INV-2026-039",
    customer: "Horizon Fintech Partners",
    clientEmail: "finance@horizonpartners.co",
    amount: 6200.0,
    formattedAmount: "$6,200.00",
    issueDate: "2026-10-10",
    dueDate: "2026-10-25",
    status: "paid",
  },
  {
    id: "INV-2026-038",
    customer: "Cascade Creative Agency",
    clientEmail: "ops@cascadecreative.com",
    amount: 2100.0,
    formattedAmount: "$2,100.00",
    issueDate: "2026-10-02",
    dueDate: "2026-10-17",
    status: "paid",
  },
  {
    id: "INV-2026-037",
    customer: "Nexus Cloud Systems",
    clientEmail: "ap@nexuscloud.net",
    amount: 4200.0,
    formattedAmount: "$4,200.00",
    issueDate: "2026-11-01",
    dueDate: "2026-11-16",
    status: "pending",
  },
];

export const mockRecentPayments = [
  {
    id: "PAY-2026-904",
    customer: "Horizon Fintech Partners",
    invoiceId: "INV-2026-039",
    amount: 6200.0,
    formattedAmount: "$6,200.00",
    date: "2026-10-24",
    method: "PayPal Sandbox",
    status: "completed",
  },
  {
    id: "PAY-2026-903",
    customer: "Cascade Creative Agency",
    invoiceId: "INV-2026-038",
    amount: 2100.0,
    formattedAmount: "$2,100.00",
    date: "2026-10-16",
    method: "PayPal Sandbox",
    status: "completed",
  },
  {
    id: "PAY-2026-902",
    customer: "Pinnacle Media Group",
    invoiceId: "INV-2026-035",
    amount: 1450.0,
    formattedAmount: "$1,450.00",
    date: "2026-10-08",
    method: "Direct Deposit",
    status: "completed",
  },
  {
    id: "PAY-2026-901",
    customer: "BlueMarble Solutions",
    invoiceId: "INV-2026-032",
    amount: 3800.0,
    formattedAmount: "$3,800.00",
    date: "2026-09-30",
    method: "PayPal Sandbox",
    status: "completed",
  },
];

export const mockStatusDistribution = {
  totalCount: 41,
  paid: {
    count: 32,
    percent: 78,
    color: "#16A34A",
    label: "Paid",
  },
  pending: {
    count: 7,
    percent: 17,
    color: "#F59E0B",
    label: "Pending",
  },
  overdue: {
    count: 2,
    percent: 5,
    color: "#DC2626",
    label: "Overdue",
  },
};

