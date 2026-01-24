export type BoatVsCharterInputs = {
  purchasePrice: number;

  // Chartering (you pay for personal use)
  charterRatePerWeek: number;
  charterWeeksPerYear: number;

  // If you buy, you can charter it out (optional)
  ownerCharterRatePerWeek: number; // gross income per week
  ownerCharterWeeksPerYear: number;

  // Sailing hook
  personalUseWeeks: number;

  // Costs / value
  operatingCostRate: number; // e.g., 0.10
  resalePctAfter5y: number;  // e.g., 0.65

  // Tax / opportunity cost
  taxRate: number;           // e.g., 0.37
  opportunityReturn: number; // e.g., 0.09

  // Horizon
  startYear: number;         // e.g., 2026
  horizonYears: number;      // 5
};

export type BoatVsCharterRow = {
  year: string;
  taxTreatment: "BusinessAsset" | "SecondHome/Residence";
  personalUseWeeks: number;

  charterNetWorth: number;
  buyNetWorth: number;
  deltaBuyMinusCharter: number;

  ownerRentalIncome: number;
  ownerOpCost: number;
  allowedDeductions: number | "";
  taxableIncomeFromRent: number | "";
};

const round2 = (x: number) => Math.round(x * 100) / 100;

// 14 days == 2 weeks
export function personalUseTriggersResidence(personalUseWeeks: number): boolean {
  return personalUseWeeks > 2;
}

function clampDeductionsToIncomeIfResidence(
  residenceRule: boolean,
  rentalIncome: number,
  deductions: number
): number {
  if (!residenceRule) return deductions;
  // simplified vacation-home limitation: can't create/expand a loss beyond rental income
  return Math.min(deductions, Math.max(0, rentalIncome));
}

export function runBuyVsCharter(i: BoatVsCharterInputs): BoatVsCharterRow[] {
  const n = i.horizonYears;
  const years: number[] = Array.from({ length: n + 1 }, (_, t) => i.startYear + t);

  const residenceRule = personalUseTriggersResidence(i.personalUseWeeks);

  const annualOpCost = i.purchasePrice * i.operatingCostRate;
  const annualRentalIncome = i.ownerCharterRatePerWeek * i.ownerCharterWeeksPerYear;
  const annualCharterSpend = i.charterRatePerWeek * i.charterWeeksPerYear;

  // 100% bonus depreciation for 2026 (simplified; only when treated as business asset)
  const bonusDepr = residenceRule ? 0 : i.purchasePrice;

  // If you charter instead of buy, you keep the purchase capital invested
  let charterInvested = i.purchasePrice;

  // If you buy, assume you spend the full price up front (no financing modeled)
  let buyCash = 0;

  // Simple straight-line market value to resalePct after 5 years
  const boatMarketValue = (t: number) => {
    if (t <= 0) return i.purchasePrice;
    const endVal = i.purchasePrice * i.resalePctAfter5y;
    return i.purchasePrice + (endVal - i.purchasePrice) * (t / n);
  };

  const ownerAfterTaxNet = (t: number) => {
    const rentalIncome = annualRentalIncome;
    let deductions = annualOpCost;

    // bonus depreciation only in year 0 if business asset
    if (t === 0 && !residenceRule) deductions += bonusDepr;

    const allowed = clampDeductionsToIncomeIfResidence(residenceRule, rentalIncome, deductions);
    const taxable = rentalIncome - allowed;
    const tax = Math.max(0, taxable) * i.taxRate;

    // After-tax cashflow from rental operations (simplified)
    const afterTax = (rentalIncome - annualOpCost) - tax;

    return { afterTax, taxable, allowed };
  };

  const rows: BoatVsCharterRow[] = [];

  for (let t = 0; t <= n; t++) {
    const yr = years[t];

    // Charter path: invest unspent capital at opportunity cost, pay charter spend
    if (t > 0) charterInvested *= (1 + i.opportunityReturn);
    charterInvested += -annualCharterSpend;

    // Buy path: boat value + accumulated after-tax cashflows; sell at end (no sale tax modeled)
    const { afterTax, taxable, allowed } = ownerAfterTaxNet(t);
    buyCash += afterTax;

    let buyNW = boatMarketValue(t) + buyCash;
    if (t === n) buyNW = buyCash + boatMarketValue(t);

    rows.push({
      year: String(yr),
      taxTreatment: residenceRule ? "SecondHome/Residence" : "BusinessAsset",
      personalUseWeeks: i.personalUseWeeks,

      charterNetWorth: round2(charterInvested),
      buyNetWorth: round2(buyNW),
      deltaBuyMinusCharter: round2(buyNW - charterInvested),

      ownerRentalIncome: round2(annualRentalIncome),
      ownerOpCost: round2(annualOpCost),
      allowedDeductions: round2(allowed),
      taxableIncomeFromRent: round2(taxable),
    });
  }

  const last = rows[rows.length - 1];
  rows.push({
    year: "5Y Summary",
    taxTreatment: last.taxTreatment,
    personalUseWeeks: last.personalUseWeeks,

    charterNetWorth: last.charterNetWorth,
    buyNetWorth: last.buyNetWorth,
    deltaBuyMinusCharter: last.deltaBuyMinusCharter,

    ownerRentalIncome: round2(annualRentalIncome),
    ownerOpCost: round2(annualOpCost),
    allowedDeductions: "",
    taxableIncomeFromRent: "",
  });

  return rows;
}
