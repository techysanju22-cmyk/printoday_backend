import mongoose, { Document, Schema } from 'mongoose';

export interface Address {
  houseNo: string;
  buildingName?: string;
  streetName: string;
  area: string;
  pin: string;
}

export interface IUser extends Document {
  email: string;
  mobileNumber?: string;
  role: 'USER' | 'ADMIN';
  accountType: 'INDIVIDUAL' | 'ORGANIZATION';

  // Individual Profile
  individual?: {
    name: string;
    address: Address;
  };

  // Organization Profile
  organization?: {
    companyName: string;
    contactName: string;
    designation: string;
    address: Address;
    gstin?: string;
    hasGstin: boolean;
    addressProofUrl?: string;
    physicalVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
    creditEligible: boolean;
  };
}

const addressSchema = new Schema<Address>({
  houseNo: { type: String, required: true },
  buildingName: { type: String },
  streetName: { type: String, required: true },
  area: { type: String, required: true },
  pin: { type: String, required: true }
});

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  // No password — auth is email OTP only
  mobileNumber: {
    type: String,
    unique: true,
    sparse: true // allows multiple docs with no mobile
  },
  role: {
    type: String,
    enum: ['USER', 'ADMIN'],
    default: 'USER'
  },
  accountType: {
    type: String,
    enum: ['INDIVIDUAL', 'ORGANIZATION'],
    required: true
  },
  individual: {
    name: { type: String },
    address: { type: addressSchema }
  },
  organization: {
    companyName: { type: String },
    contactName: { type: String },
    designation: { type: String },
    address: { type: addressSchema },
    gstin: { type: String },
    hasGstin: { type: Boolean },
    addressProofUrl: { type: String },
    physicalVerificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING'
    },
    creditEligible: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

export const User = mongoose.model<IUser>('User', userSchema);
