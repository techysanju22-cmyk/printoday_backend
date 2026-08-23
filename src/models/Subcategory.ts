import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISubcategory extends Document {
  categoryId: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  image: string;
}

const subcategorySchema = new Schema<ISubcategory>({
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  image: { type: String }
}, {
  timestamps: true
});

export const Subcategory = mongoose.model<ISubcategory>('Subcategory', subcategorySchema);
