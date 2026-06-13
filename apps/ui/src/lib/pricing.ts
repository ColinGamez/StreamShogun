// ── Pricing display helpers ───────────────────────────────────────────

import { PRICING } from "@stream-shogun/shared";

/** Format a number as USD with 2 decimal places. */
export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** "$6.99/mo" */
export const MONTHLY_LABEL = `${formatUSD(PRICING.MONTHLY)}/mo`;

/** "$69.99/yr" */
export const YEARLY_LABEL = `${formatUSD(PRICING.YEARLY)}/yr`;

/** "$5.83/mo" */
export const YEARLY_PER_MONTH_LABEL = `${formatUSD(PRICING.YEARLY_MONTHLY_EQUIVALENT)}/mo`;

/** "Save $13.89 per year" */
export const YEARLY_SAVINGS_LABEL = `Save ${formatUSD(PRICING.YEARLY_SAVINGS)} per year`;

/** "7-day free trial, cancel anytime" */
export const TRIAL_LABEL = `${PRICING.TRIAL_DAYS}-day free trial, cancel anytime`;
