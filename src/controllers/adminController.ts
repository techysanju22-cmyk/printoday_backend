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

// ─── Admin: Update Payment Status (UPI Verification) ─────────────────────────

export const adminUpdatePaymentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { paymentStatus, adminNote } = req.body;

    const allowed = ['PAID', 'FAILED', 'PENDING_VERIFICATION', 'CREDIT_PENDING', 'CREDIT_ISSUED'];
    if (!paymentStatus || !allowed.includes(paymentStatus)) {
      res.status(400).json({ success: false, error: `paymentStatus must be one of: ${allowed.join(', ')}` });
      return;
    }

    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) { res.status(404).json({ success: false, error: 'Order not found' }); return; }

    const updateFields: Record<string, any> = { paymentStatus };

    // If confirming payment, calculate what was actually paid
    if (paymentStatus === 'PAID') {
      updateFields.advancePaid = existingOrder.totalAmount;
      updateFields.remainingBalance = 0;
    } else if (paymentStatus === 'CREDIT_ISSUED') {
      // Credit fully granted
      updateFields.remainingBalance = 0;
    }

    if (adminNote) {
      updateFields.adminNote = adminNote;
    }

    const order = await Order.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true });
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

// ─── User Management ──────────────────────────────────────────────────────────

export const adminGetUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, accountType, isBanned, page = '1', limit = '20' } = req.query;

    const query: Record<string, any> = {};

    if (accountType && accountType !== 'ALL') {
      query.accountType = accountType;
    }
    if (isBanned === 'true') query.isBanned = true;
    if (isBanned === 'false') query.isBanned = false;

    if (search) {
      const s = String(search);
      query.$or = [
        { email: { $regex: s, $options: 'i' } },
        { mobileNumber: { $regex: s, $options: 'i' } },
        { 'individual.name': { $regex: s, $options: 'i' } },
        { 'organization.companyName': { $regex: s, $options: 'i' } },
        { 'organization.contactName': { $regex: s, $options: 'i' } },
      ];
    }

    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(String(limit)));

    res.status(200).json({ success: true, data: users, total, page: parseInt(String(page)), limit: parseInt(String(limit)) });
  } catch (error) { next(error); }
};

export const adminUpdateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { role, accountType, 'individual.name': indivName, 'individual.creditEligible': indivCreditEligible, 'organization.companyName': companyName,
            'organization.contactName': contactName, 'organization.designation': designation,
            'organization.gstin': gstin, 'organization.hasGstin': hasGstin,
            'organization.physicalVerificationStatus': physicalVerificationStatus,
            'organization.creditEligible': creditEligible } = req.body;

    const updateFields: Record<string, any> = {};
    if (role !== undefined) updateFields.role = role;
    if (accountType !== undefined) updateFields.accountType = accountType;
    if (indivName !== undefined) updateFields['individual.name'] = indivName;
    if (indivCreditEligible !== undefined) updateFields['individual.creditEligible'] = indivCreditEligible;
    if (companyName !== undefined) updateFields['organization.companyName'] = companyName;
    if (contactName !== undefined) updateFields['organization.contactName'] = contactName;
    if (designation !== undefined) updateFields['organization.designation'] = designation;
    if (gstin !== undefined) updateFields['organization.gstin'] = gstin;
    if (hasGstin !== undefined) updateFields['organization.hasGstin'] = hasGstin;
    if (physicalVerificationStatus !== undefined) updateFields['organization.physicalVerificationStatus'] = physicalVerificationStatus;
    if (creditEligible !== undefined) updateFields['organization.creditEligible'] = creditEligible;

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true, runValidators: true }).select('-password');
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};

export const adminBanUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { isBanned } = req.body;
    if (typeof isBanned !== 'boolean') {
      res.status(400).json({ success: false, error: '`isBanned` must be a boolean' });
      return;
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isBanned }, { new: true }).select('-password');
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.status(200).json({ success: true, data: user });
  } catch (error) { next(error); }
};

// ─── Coupon Management ────────────────────────────────────────────────────────

export const adminGetCoupons = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupons = await import('../models/Coupon').then(m => m.Coupon.find().sort({ createdAt: -1 }));
    res.status(200).json({ success: true, data: coupons });
  } catch (error) { next(error); }
};

export const adminCreateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Coupon } = await import('../models/Coupon');
    const existing = await Coupon.findOne({ code: req.body.code.toUpperCase() });
    if (existing) {
      res.status(400).json({ success: false, error: 'Coupon code already exists' });
      return;
    }
    const coupon = await Coupon.create({ ...req.body, code: req.body.code.toUpperCase() });
    res.status(201).json({ success: true, data: coupon });
  } catch (error) { next(error); }
};

export const adminUpdateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Coupon } = await import('../models/Coupon');
    const updateData = { ...req.body };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!coupon) { res.status(404).json({ success: false, error: 'Coupon not found' }); return; }
    res.status(200).json({ success: true, data: coupon });
  } catch (error) { next(error); }
};

export const adminDeleteCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { Coupon } = await import('../models/Coupon');
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) { res.status(404).json({ success: false, error: 'Coupon not found' }); return; }
    res.status(200).json({ success: true, data: {} });
  } catch (error) { next(error); }
};
