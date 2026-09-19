import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  discountPercentage: number;
  maxUses: number;
  usedCount: number;
  conditionType: 'MIN_ORDER_AMOUNT' | 'SPECIFIC_PRODUCT' | 'NONE';
  minOrderAmount?: number;
  productId?: Types.ObjectId;
  isActive: boolean;
}

const couponSchema = new Schema<ICoupon>({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  discountPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  maxUses: {
    type: Number,
    required: true,
    min: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  conditionType: {
    type: String,
    enum: ['MIN_ORDER_AMOUNT', 'SPECIFIC_PRODUCT', 'NONE'],
    default: 'NONE',
  },
  minOrderAmount: {
    type: Number,
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

export const Coupon = mongoose.model<ICoupon>('Coupon', couponSchema);
