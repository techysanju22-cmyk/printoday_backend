import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailOtp extends Document {
  email: string;
  otp: string;
  createdAt: Date;
}

const emailOtpSchema = new Schema<IEmailOtp>({
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  otp: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300 // 5 minutes TTL
  }
});

export const EmailOtp = mongoose.model<IEmailOtp>('EmailOtp', emailOtpSchema);
