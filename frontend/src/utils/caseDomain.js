const statusPriority = {
  OVERDUE: 3,
  PARTIAL: 2,
  PAID: 1,
  UNPAID: 0,
};

export const UPCOMING_HEARING_WINDOW_DAYS = 7;

export const toIsoDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

export const toDateOnly = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

export const computeChargeFinancials = (charge) => {
  const total = Number(charge?.totalAmount ?? charge?.total ?? 0);
  const paid = Number(charge?.paidAmount ?? charge?.paid ?? 0);
  const balance = Math.max(0, total - paid);
  const dueDate = charge?.dueDate ?? charge?.due_date ?? null;
  const due = dueDate ? new Date(dueDate) : null;
  const now = new Date();

  let status = "UNPAID";
  if (balance <= 0) {
    status = "PAID";
  } else if (paid > 0) {
    status = "PARTIAL";
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (balance > 0 && due && !Number.isNaN(due.getTime()) && due < todayStart) {
    status = "OVERDUE";
  }

  return {
    totalAmount: total,
    paidAmount: paid,
    balanceAmount: balance,
    dueDate: dueDate || null,
    status,
  };
};

export const deriveHearingAlertLevel = (hearing) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sourceDate = hearing?.status === "POSTPONED" && hearing?.postponedTo
    ? new Date(hearing.postponedTo)
    : new Date(hearing?.scheduledAt || hearing?.date || hearing?.createdAt || today);

  if (Number.isNaN(sourceDate.getTime())) return "planned";
  sourceDate.setHours(0, 0, 0, 0);

  if (String(hearing?.status || "").toUpperCase() === "COMPLETED") return "completed";
  if (sourceDate < today) return "missed";
  if (sourceDate.getTime() === today.getTime()) return "today";

  const upcoming = new Date(today);
  upcoming.setDate(upcoming.getDate() + UPCOMING_HEARING_WINDOW_DAYS);
  if (sourceDate <= upcoming) return "upcoming";
  return "planned";
};

export const summarizeCaseTotals = (chargeItems = []) =>
  chargeItems.reduce(
    (summary, item) => {
      const financials = computeChargeFinancials(item);
      return {
        totalAmount: summary.totalAmount + financials.totalAmount,
        paidAmount: summary.paidAmount + financials.paidAmount,
        balanceAmount: summary.balanceAmount + financials.balanceAmount,
        dominantStatus:
          statusPriority[financials.status] > statusPriority[summary.dominantStatus]
            ? financials.status
            : summary.dominantStatus,
      };
    },
    { totalAmount: 0, paidAmount: 0, balanceAmount: 0, dominantStatus: "UNPAID" }
  );

export const isLawyerFeeLabel = (label) => {
  const normalized = String(label || "").toLowerCase();
  return (
    normalized.includes("lawyer") ||
    normalized.includes("advocate") ||
    normalized.includes("attorney") ||
    normalized.includes("retainer") ||
    normalized.includes("counsel") ||
    normalized.includes("fee") ||
    normalized.includes("professional") ||
    normalized.includes("legal") ||
    normalized.includes("service") ||
    normalized.includes("consult")
  );
};

export const buildDashboardSummary = (cases = []) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const revenueByMonth = new Map();
  const caseDistribution = new Map();
  const overdueAlerts = [];
  const todayHearings = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let totalRevenue = 0;
  let totalOutstanding = 0;
  const uniqueClientIds = new Set();

  cases.forEach((legalCase) => {
    if (legalCase?.client?.id) uniqueClientIds.add(legalCase.client.id);
    caseDistribution.set(
      legalCase.caseType || "Other",
      (caseDistribution.get(legalCase.caseType || "Other") || 0) + 1
    );

    totalRevenue += Number(legalCase.paidAmount || 0);
    totalOutstanding += Number(legalCase.balanceAmount || 0);

    legalCase.paymentHistory.forEach((entry) => {
      if (!entry.isLawyerFee && !isLawyerFeeLabel(entry.chargeLabel)) return;
      const stamp = String(entry.createdAt || "").slice(0, 7);
      if (!stamp) return;
      revenueByMonth.set(stamp, (revenueByMonth.get(stamp) || 0) + Number(entry.amount || 0));
    });

    if (legalCase.chargeItems.some((item) => computeChargeFinancials(item).status === "OVERDUE")) {
      overdueAlerts.push(legalCase);
    }

    if (
      legalCase.hearings.some((hearing) => {
        const scheduled = new Date(hearing.scheduledAt);
        if (Number.isNaN(scheduled.getTime())) return false;
        scheduled.setHours(0, 0, 0, 0);
        return hearing.type === "HEARING" && scheduled.getTime() === today.getTime();
      })
    ) {
      todayHearings.push(legalCase);
    }
  });

  const monthLabel = (value) => {
    const [year, month] = String(value).split("-");
    if (!year || !month) return value;
    return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-IN", {
      month: "short",
      year: "numeric",
    });
  };

  const overdueByCase = cases
    .map((legalCase) => ({
      label: legalCase.caseNumber,
      value: legalCase.chargeItems
        .filter((item) => isLawyerFeeLabel(item.label) && computeChargeFinancials(item).status === "OVERDUE")
        .reduce((sum, item) => sum + computeChargeFinancials(item).balanceAmount, 0),
    }))
    .filter((entry) => entry.value > 0);

  return {
    totalRevenue,
    totalOutstanding,
    totalClients: uniqueClientIds.size,
    totalCases: cases.length,
    revenueTrends: Array.from(revenueByMonth.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label: monthLabel(label), value })),
    overduePayments: overdueByCase,
    caseDistribution: Array.from(caseDistribution.entries()).map(([label, value]) => ({ label, value })),
    overdueAlerts,
    todayHearings,
    currentMonthRevenue: cases
      .flatMap((legalCase) => legalCase.paymentHistory)
      .filter((entry) => String(entry.createdAt || "").startsWith(currentMonth))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  };
};




