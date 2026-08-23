import mongoose, { Document, Schema } from 'mongoose';

// Temporary holding collection for unverified registrations.
// Auto-deleted after 10 minutes via MongoDB TTL index.

export interface IPendingRegistration extends Document {
  email: string;
  mobile: string;
  otp: string;
  otpExpires: Date;
  accountType: 'INDIVIDUAL' | 'ORGANIZATION';
  // Serialised profile payload stored until OTP is verified
  payload: Record<string, unknown>;
}

const pendingRegistrationSchema = new Schema<IPendingRegistration>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  otpExpires: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL: MongoDB removes document when otpExpires is past
  },
  accountType: {
    type: String,
    enum: ['INDIVIDUAL', 'ORGANIZATION'],
    required: true
  },
  payload: {
    type: Schema.Types.Mixed,
    required: true
  }
}, {
  timestamps: true
});

export const PendingRegistration = mongoose.model<IPendingRegistration>(
  'PendingRegistration',
  pendingRegistrationSchema
);
