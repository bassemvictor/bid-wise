import type { TenderRequest } from "../../shared/types";

export type TenderPricingSettings = Pick<
  TenderRequest,
  | "exchangeRate"
  | "currencySafetyFactorPercent"
  | "overtimePerBag"
  | "installationPerBag"
  | "transportationCostPerBag"
  | "salesPercentage"
  | "salesFixed"
>;

export type TenderPricingFormState = {
  exchangeRate: string;
  currencySafetyFactorPercent: string;
  overtimePerBag: string;
  installationPerBag: string;
  transportationCostPerBag: string;
  salesInputMode: "percent" | "fixed";
  salesPercentage: string;
  salesFixed: string;
};

export const numberOrNull = (value: string) => {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toInputValue = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : value.toString();

export const getTenderPricingFormState = (
  tender: TenderPricingSettings | null | undefined,
  fallbacks?: Partial<TenderPricingSettings> | null,
): TenderPricingFormState => ({
  exchangeRate: toInputValue(tender?.exchangeRate ?? fallbacks?.exchangeRate),
  currencySafetyFactorPercent: toInputValue(
    tender?.currencySafetyFactorPercent ?? fallbacks?.currencySafetyFactorPercent,
  ),
  overtimePerBag: toInputValue(tender?.overtimePerBag ?? fallbacks?.overtimePerBag),
  installationPerBag: toInputValue(tender?.installationPerBag ?? fallbacks?.installationPerBag),
  transportationCostPerBag: toInputValue(
    tender?.transportationCostPerBag ?? fallbacks?.transportationCostPerBag,
  ),
  salesInputMode:
    tender?.salesFixed !== null && tender?.salesFixed !== undefined
      ? "fixed"
      : fallbacks?.salesFixed !== null && fallbacks?.salesFixed !== undefined
        ? "fixed"
        : "percent",
  salesPercentage: toInputValue(tender?.salesPercentage ?? fallbacks?.salesPercentage),
  salesFixed: toInputValue(tender?.salesFixed ?? fallbacks?.salesFixed),
});

export const getTenderPricingSettings = (
  form: TenderPricingFormState,
): TenderPricingSettings => ({
  exchangeRate: numberOrNull(form.exchangeRate),
  currencySafetyFactorPercent: numberOrNull(form.currencySafetyFactorPercent),
  overtimePerBag: numberOrNull(form.overtimePerBag),
  installationPerBag: numberOrNull(form.installationPerBag),
  transportationCostPerBag: numberOrNull(form.transportationCostPerBag),
  salesPercentage: form.salesInputMode === "percent" ? numberOrNull(form.salesPercentage) : null,
  salesFixed: form.salesInputMode === "fixed" ? numberOrNull(form.salesFixed) : null,
});

export const getEffectiveExchangeRate = (
  pricing: Pick<TenderPricingSettings, "exchangeRate" | "currencySafetyFactorPercent">,
) =>
  pricing.exchangeRate !== null &&
  pricing.exchangeRate !== undefined &&
  pricing.currencySafetyFactorPercent !== null &&
  pricing.currencySafetyFactorPercent !== undefined
    ? pricing.exchangeRate * (1 + pricing.currencySafetyFactorPercent / 100)
    : null;
