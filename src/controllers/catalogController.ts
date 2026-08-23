import { Request, Response, NextFunction } from 'express';
import { Category } from '../models/Category';
import { Subcategory } from '../models/Subcategory';
import { Product } from '../models/Product';

// @desc    Get all categories
// @route   GET /api/v1/catalog/categories
// @access  Public
export const getCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await Category.find();
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all subcategories (optionally filtered by catId)
// @route   GET /api/v1/catalog/subcategories
// @access  Public
export const getSubcategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.catId) filter.categoryId = req.query.catId;
    const subcategories = await Subcategory.find(filter);
    res.status(200).json({ success: true, data: subcategories });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all products (optionally filtered by catId or subId)
// @route   GET /api/v1/catalog/products
// @access  Public
export const getProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.catId) filter.categoryId = req.query.catId;
    if (req.query.subId) filter.subcategoryId = req.query.subId;
    const products = await Product.find(filter);
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single product by slug or id
// @route   GET /api/v1/catalog/products/:slugOrId
// @access  Public
export const getProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slugOrId } = req.params;
    const product = await Product.findOne({ slug: slugOrId }) || await Product.findById(slugOrId).catch(() => null);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
};
