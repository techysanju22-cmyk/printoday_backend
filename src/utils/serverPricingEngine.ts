import { IProduct, IDiscountTier } from '../models/Product';

export interface VerifyServerPriceArgs {
  product: IProduct;
  quantity: number;
  widthFt?: number;
  heightFt?: number;
  artworkUrl?: string;
}

export interface VerifyServerPriceResult {
  rawTotalPrice: number;
  discountAmount: number;
  finalTotalPrice: number;
  effectiveUnitPrice: number;
  totalSqFt: number;
}

export const verifyAndCalculateServerPrice = (args: VerifyServerPriceArgs): VerifyServerPriceResult => {
  const { product, quantity, widthFt = 1, heightFt = 1, artworkUrl } = args;

  // 1. Artwork Guard
  if (product.requirements.requiresArtworkUpload && !artworkUrl) {
    throw new Error('Artwork is required for this product.');
  }

  // 2. Quantity Rules Enforcement
  const { quantityMode, minQuantity, quantityStep, presetOptions } = product.quantityConfig;
  
  if (quantity < minQuantity) {
    throw new Error(`Minimum quantity is ${minQuantity}.`);
  }

  if (quantityMode === 'PRESET_ONLY') {
    if (!presetOptions || !presetOptions.includes(quantity)) {
      throw new Error(`Quantity ${quantity} is not a valid preset option.`);
    }
  } else if (quantityMode === 'CUSTOM_INTERVAL') {
    if (quantityStep && (quantity - minQuantity) % quantityStep !== 0) {
      throw new Error(`Quantity must be in increments of ${quantityStep} starting from ${minQuantity}.`);
    }
  }

  // 3. Area Calculation
  let totalSqFt = 1;
  let unitPrice = product.basePrice;

  if (product.requirements.requiresCustomDimensions) {
    let calculatedSqFt = widthFt * heightFt;
    // Dimension unit on server is ENUM ('FEET' | 'INCHES')
    if (product.requirements.dimensionUnit === 'INCHES') {
      calculatedSqFt = calculatedSqFt / 144; // sq inches to sq ft
    }
    
    totalSqFt = Math.max(calculatedSqFt, product.requirements.minSqFt || 0.1);
    unitPrice = product.basePrice * totalSqFt;
  }

  const rawTotalPrice = unitPrice * quantity;
  let discountAmount = 0;

  // 4. Discount Tier Matching
  const applicableTier = product.discountTiers.find(
    tier => quantity >= tier.minQty && (tier.maxQty === null || quantity <= tier.maxQty)
  );

  if (applicableTier) {
    if (applicableTier.discountType === 'PERCENTAGE') {
      discountAmount = rawTotalPrice * (applicableTier.discountValue / 100);
    } else if (applicableTier.discountType === 'FLAT_AMOUNT') {
      discountAmount = applicableTier.discountValue;
    }
  }

  // 5. Final Calculation
  const finalTotalPrice = rawTotalPrice - discountAmount;
  const effectiveUnitPrice = finalTotalPrice / quantity;

  return {
    rawTotalPrice,
    discountAmount,
    finalTotalPrice: Math.round(finalTotalPrice), // standard rounding to nearest integer
    effectiveUnitPrice,
    totalSqFt
  };
};
