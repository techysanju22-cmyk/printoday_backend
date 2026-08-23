import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  description: string;
  image: string;
  iconName: string;
  productCount: number;
}

const categorySchema = new Schema<ICategory>({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  image: { type: String },
  iconName: { type: String },
  productCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

export const Category = mongoose.model<ICategory>('Category', categorySchema);
