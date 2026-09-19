import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IOrderItem {
  productId: Types.ObjectId;
  title: string;
  quantity: number;
  dimensions?: {
    widthFt: number;
    heightFt: number;
    totalSqFt: number;
  };
  artworkUrl?: string;
  calculatedUnitPrice: number;
  discountAppliedAmount: number;
  itemTotalPrice: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  userId: Types.ObjectId;
  accountType: 'INDIVIDUAL' | 'ORGANIZATION';
  
  shippingAddress: {
    houseNo: string;
    buildingName?: string;
    streetName: string;
    area: string;
    pin: string;
  };

  items: IOrderItem[];
  
  subtotal: number;
  gstAmount: number; // calculated at 18% etc.
  shippingFee: number;
  totalAmount: number;

  paymentMethod: 'RAZORPAY' | 'COD' | '30_DAYS_CREDIT';
  paymentTerm?: 'FULL' | '50_PERCENT_ADVANCE' | 'ORG_CREDIT';
  paymentStatus: 'PENDING' | 'PENDING_VERIFICATION' | 'PAID' | 'FAILED' | 'CREDIT_ISSUED' | 'CREDIT_PENDING';
  
  advancePaid: number;
  remainingBalance: number;
  utrNumber?: string;
  
  orderStatus: 'PLACED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';

  couponCode?: string;
  couponDiscountAmount?: number;

  razorpayDetails?: {
    orderId: string;
    paymentId?: string;
    signature?: string;
  };

  expectedProcessingTime?: Date;
  expectedShippingTime?: Date;
  expectedDeliveryTime?: Date;
  adminNote?: string;
}

const orderItemSchema = new Schema<IOrderItem>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  title: { type: String, required: true },
  quantity: { type: Number, required: true },
  dimensions: {
    widthFt: { type: Number },
    heightFt: { type: Number },
    totalSqFt: { type: Number }
  },
  artworkUrl: { type: String },
  calculatedUnitPrice: { type: Number, required: true },
  discountAppliedAmount: { type: Number, default: 0 },
  itemTotalPrice: { type: Number, required: true }
}, { _id: false });

const orderSchema = new Schema<IOrder>({
  orderNumber: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  accountType: { type: String, enum: ['INDIVIDUAL', 'ORGANIZATION'], required: true },
  
  shippingAddress: {
    houseNo: { type: String, required: true },
    buildingName: { type: String },
    streetName: { type: String, required: true },
    area: { type: String, required: true },
    pin: { type: String, required: true }
  },

  items: [orderItemSchema],

  subtotal: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  shippingFee: { type: Number, required: true },
  totalAmount: { type: Number, required: true },

  paymentMethod: { type: String, enum: ['RAZORPAY', 'COD', '30_DAYS_CREDIT'], required: true },
  paymentTerm: { type: String, enum: ['FULL', '50_PERCENT_ADVANCE', 'ORG_CREDIT'] },
  paymentStatus: { type: String, enum: ['PENDING', 'PENDING_VERIFICATION', 'PAID', 'FAILED', 'CREDIT_ISSUED', 'CREDIT_PENDING'], default: 'PENDING' },
  
  advancePaid: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: 0 },
  utrNumber: { type: String },

  orderStatus: { type: String, enum: ['PLACED', 'PROCESSING', 'SHIPPED', 'DELIVERED'], default: 'PLACED' },

  couponCode: { type: String },
  couponDiscountAmount: { type: Number },

  razorpayDetails: {
    orderId: { type: String },
    paymentId: { type: String },
    signature: { type: String }
  },

  expectedProcessingTime: { type: Date },
  expectedShippingTime: { type: Date },
  expectedDeliveryTime: { type: Date },
  
  adminNote: { type: String },
}, {
  timestamps: true
});

export const Order = mongoose.model<IOrder>('Order', orderSchema);
