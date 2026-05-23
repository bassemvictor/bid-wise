import type { Material, ProductConfiguration } from "../../shared/types";

type ComparableProductComponent = {
  productId: string;
  productName: string;
  componentId: string;
  componentName: string;
  componentType?: string | null;
  materialId: string;
  accessoryTotalPricePerBagEgp?: string | number | null;
  requestedQuantity?: string | number | null;
  bagDiameterMm?: string | number | null;
  bagLengthMm?: string | number | null;
  seamAllowanceMm?: string | number | null;
  topBottomAllowanceMm?: string | number | null;
};

type ProductSyncStatus = {
  isOutOfSync: boolean;
  reason: "missing-upstream" | "missing-downstream" | "field-mismatch" | null;
};

const normalizeText = (value: string | null | undefined) => value?.trim() ?? "";

const hasTextValue = (value: string | null | undefined) => normalizeText(value) !== "";

const normalizeNumeric = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return normalizeText(String(value));
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(4).replace(/\.?0+$/, "");
};

const hasNumericValue = (value: string | number | null | undefined) => normalizeNumeric(value) !== "";

const matchesTextIfPresent = (
  current: string | null | undefined,
  expected: string | null | undefined,
) => !hasTextValue(current) || normalizeText(current) === normalizeText(expected);

const matchesNumericIfPresent = (
  current: string | number | null | undefined,
  expected: string | number | null | undefined,
) => !hasNumericValue(current) || normalizeNumeric(current) === normalizeNumeric(expected);

const resolveMaterialId = (value: string, materials: Material[]) => {
  const match = materials.find(
    (material) => material.materialId === value || material.materialName === value,
  );

  return match?.materialId ?? value;
};

const buildExpectedComparableComponents = (
  configuration: ProductConfiguration,
  materials: Material[],
): ComparableProductComponent[] =>
  configuration.productSnapshots.flatMap((product) =>
    product.components.map((component) => ({
      productId: product.productId,
      productName: product.productName,
      componentId: component.componentId,
      componentName: component.componentName,
      componentType: component.componentType,
      materialId: resolveMaterialId(component.material, materials),
      accessoryTotalPricePerBagEgp: component.accessorySnapshot?.totalPricePerBagEgp ?? null,
      requestedQuantity:
        product.requestedQuantity ?? configuration.quantity ?? null,
      bagDiameterMm: component.specifications.diameter as string | number | null | undefined,
      bagLengthMm: component.specifications.length as string | number | null | undefined,
      seamAllowanceMm: component.specifications.seamAllowanceMm as string | number | null | undefined,
      topBottomAllowanceMm:
        component.specifications.topBottomAllowanceMm as string | number | null | undefined,
    })),
  );

const areComparableComponentsEqual = (
  current: ComparableProductComponent,
  expected: ComparableProductComponent,
) =>
  normalizeText(current.productName) === normalizeText(expected.productName) &&
  normalizeText(current.componentName) === normalizeText(expected.componentName) &&
  matchesTextIfPresent(current.componentType, expected.componentType) &&
  normalizeText(current.materialId) === normalizeText(expected.materialId) &&
  matchesNumericIfPresent(current.accessoryTotalPricePerBagEgp, expected.accessoryTotalPricePerBagEgp) &&
  normalizeNumeric(current.requestedQuantity) === normalizeNumeric(expected.requestedQuantity) &&
  normalizeNumeric(current.bagDiameterMm) === normalizeNumeric(expected.bagDiameterMm) &&
  normalizeNumeric(current.bagLengthMm) === normalizeNumeric(expected.bagLengthMm) &&
  normalizeNumeric(current.seamAllowanceMm) === normalizeNumeric(expected.seamAllowanceMm) &&
  normalizeNumeric(current.topBottomAllowanceMm) ===
    normalizeNumeric(expected.topBottomAllowanceMm);

export const getProductConfigurationSyncStatuses = (
  configuration: ProductConfiguration | null,
  materials: Material[],
  currentComponents: ComparableProductComponent[],
) => {
  const statuses = new Map<string, ProductSyncStatus>();

  if (!configuration) {
    return statuses;
  }

  const expectedComponents = buildExpectedComparableComponents(configuration, materials);
  const expectedByProduct = new Map<string, ComparableProductComponent[]>();
  const currentByProduct = new Map<string, ComparableProductComponent[]>();

  expectedComponents.forEach((component) => {
    const list = expectedByProduct.get(component.productId) ?? [];
    list.push(component);
    expectedByProduct.set(component.productId, list);
  });

  currentComponents.forEach((component) => {
    const list = currentByProduct.get(component.productId) ?? [];
    list.push(component);
    currentByProduct.set(component.productId, list);
  });

  configuration.productSnapshots.forEach((product) => {
    const expected = expectedByProduct.get(product.productId) ?? [];
    const current = currentByProduct.get(product.productId) ?? [];

    if (current.length === 0) {
      statuses.set(product.productId, {
        isOutOfSync: true,
        reason: "missing-downstream",
      });
      return;
    }

    if (current.length !== expected.length) {
      statuses.set(product.productId, {
        isOutOfSync: true,
        reason: "field-mismatch",
      });
      return;
    }

    const currentByComponentId = new Map(
      current.map((component) => [component.componentId, component]),
    );

    const hasMismatch = expected.some((expectedComponent) => {
      const currentComponent = currentByComponentId.get(expectedComponent.componentId);
      return !currentComponent || !areComparableComponentsEqual(currentComponent, expectedComponent);
    });

    statuses.set(product.productId, {
      isOutOfSync: hasMismatch,
      reason: hasMismatch ? "field-mismatch" : null,
    });
  });

  currentByProduct.forEach((_components, productId) => {
    if (!expectedByProduct.has(productId)) {
      statuses.set(productId, {
        isOutOfSync: true,
        reason: "missing-upstream",
      });
    }
  });

  return statuses;
};
