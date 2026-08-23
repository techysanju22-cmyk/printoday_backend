import { Request, Response, NextFunction } from 'express';
import { Category } from '../models/Category';
import { Subcategory } from '../models/Subcategory';
import { Product } from '../models/Product';
import { Order } from '../models/Order';
import { User } from '../models/User';

// ─── Product CRUD ────────────────────────────────────────────────────────────

export const adminGetProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await Product.find().populate('categoryId').populate('subcategoryId');
    res.status(200).json({ success: true, data: products });
  } catch (error) { next(error); }
};

export const adminCreateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const adminUpdateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) { res.status(404).json({ success: false, error: 'Product not found' }); return; }
    res.status(200).json({ success: true, data: product });
  } catch (error) { next(error); }
};

export const adminDeleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) { res.status(404).json({ success: false, error: 'Product not found' }); return; }
    res.status(200).json({ success: true, data: {} });
  } catch (error) { next(error); }
};

// ─── Category/Subcategory CRUD ────────────────────────────────────────────────

export const adminCreateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) { next(error); }
};

export const adminCreateSubcategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const subcategory = await Subcategory.create(req.body);
    res.status(201).json({ success: true, data: subcategory });
  } catch (error) { next(error); }
};

// ─── Order Management ────────────────────────────────────────────────────────

export const adminGetOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orders = await Order.find().populate('userId', 'email mobileNumber accountType individual.name organization.contactName organization.companyName organization.creditEligible').sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) { next(error); }
};

export const adminUpdateOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { orderStatus, expectedDate } = req.body;

    const update: Record<string, any> = { orderStatus };

    if (orderStatus === 'PROCESSING' && expectedDate) {
      update.expectedShippingTime = new Date(expectedDate);
    } else if (orderStatus === 'SHIPPED' && expectedDate) {
      update.expectedDeliveryTime = new Date(expectedDate);
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
    res.status(200).json({ success: true, data: order });
  } catch (error) { next(error); }
};

// ─── Organization Verification ───────────────────────────────────────────────

export const getPendingOrganizations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orgs = await User.find({
      accountType: 'ORGANIZATION',
      'organization.physicalVerificationStatus': 'PENDING'
    }).select('-password');
    res.status(200).json({ success: true, data: orgs });
  } catch (error) { next(error); }
};

export const verifyOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { physicalVerificationStatus, creditEligible } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        'organization.physicalVerificationStatus': physicalVerificationStatus,
        'organization.creditEligible': creditEligible ?? false
      },
      { new: true }
    ).select('-password');

    if (!user) { res.status(404).json({ success: false, error: 'Organization not found' }); return; }
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};
