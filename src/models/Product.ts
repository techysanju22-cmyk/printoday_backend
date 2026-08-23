import mongoose, { Document, Schema, Types } from 'mongoose';

export type QuantityMode = 'PRESET_ONLY' | 'CUSTOM_INTERVAL' | 'ANY_QUANTITY';
export type DiscountType = 'PERCENTAGE' | 'FLAT_AMOUNT';

export interface IDiscountTier {
  minQty: number;
  maxQty: number | null;
  discountType: DiscountType;
  discountValue: number;
}

export interface IProduct extends Document {
  categoryId: Types.ObjectId;
  subcategoryId: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  basePrice: number;
  pricingType: 'fixed' | 'per_sqft';
  requirements: {
    requiresArtworkUpload: boolean;
    requiresCustomDimensions: boolean;
    dimensionUnit?: 'FEET' | 'INCHES';
    minSqFt?: number;
  };
  quantityConfig: {
    quantityMode: QuantityMode;
    minQuantity: number;
    quantityStep?: number;
    presetOptions?: number[];
  };
  discountTiers: IDiscountTier[];
  thumbnail: string;
  images?: string[];
  badges: string[];
  turnaroundTime: string;
}

const discountTierSchema = new Schema<IDiscountTier>({
  minQty: { type: Number, required: true },
  maxQty: { type: Number, default: null }, // null means infinity
  discountType: { type: String, enum: ['PERCENTAGE', 'FLAT_AMOUNT'], required: true },
  discountValue: { type: Number, required: true }
}, { _id: false });

const productSchema = new Schema<IProduct>({
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategoryId: { type: Schema.Types.ObjectId, ref: 'Subcategory', required: true },
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  basePrice: { type: Number, required: true },
  pricingType: { type: String, enum: ['fixed', 'per_sqft'], required: true },
  requirements: {
    requiresArtworkUpload: { type: Boolean, default: false },
    requiresCustomDimensions: { type: Boolean, default: false },
    dimensionUnit: { type: String, enum: ['FEET', 'INCHES'] },
    minSqFt: { type: Number, default: 0 }
  },
  quantityConfig: {
    quantityMode: { type: String, enum: ['PRESET_ONLY', 'CUSTOM_INTERVAL', 'ANY_QUANTITY'], required: true },
    minQuantity: { type: Number, required: true },
    quantityStep: { type: Number },
    presetOptions: [{ type: Number }]
  },
  discountTiers: [discountTierSchema],
  thumbnail: { type: String },
  images: [{ type: String }],
  badges: [{ type: String }],
  turnaroundTime: { type: String }
}, {
  timestamps: true
});

export const Product = mongoose.model<IProduct>('Product', productSchema);
