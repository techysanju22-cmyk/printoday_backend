import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateOrderNumber = () =>
  `PT-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

// ─── Verify Cart (price check before checkout) ────────────────────────────────

/**
 * @desc   Verify cart items exist and return current prices
 * @route  POST /api/v1/orders/verify-cart
 */
export const verifyCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'No items provided.' });
      return;
    }

    const verified = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        res.status(404).json({ success: false, error: `Product ${item.productId} not found.` });
        return;
      }
      verified.push({
        productId: product._id,
        title: product.title,
        basePrice: product.basePrice,
        pricingType: product.pricingType,
      });
    }

    res.status(200).json({ success: true, data: verified });
  } catch (error) {
    next(error);
  }
};

// ─── Checkout ─────────────────────────────────────────────────────────────────

/**
 * @desc   Create an order from a verified cart
 * @route  POST /api/v1/orders/checkout
 * @access Private
 */
export const checkout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const { items, shippingAddress, paymentMethod, customerName, customerEmail, customerPhone, gstin } = req.body;

    if (!items || items.length === 0) {
      res.status(400).json({ success: false, error: 'Cart is empty.' });
      return;
    }

    if (!shippingAddress?.houseNo || !shippingAddress?.streetName || !shippingAddress?.area || !shippingAddress?.pin) {
      res.status(400).json({ success: false, error: 'Incomplete shipping address. Please fill in House No, Street Name, Area, and PIN.' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found.' });
      return;
    }

    // If 30-day credit requested, verify the org is eligible
    if (paymentMethod === '30_DAYS_CREDIT') {
      if (user.accountType !== 'ORGANIZATION') {
        res.status(403).json({ success: false, error: '30-day credit is only available for registered organizations.' });
        return;
      }
      if (!user.organization?.creditEligible) {
        res.status(403).json({ success: false, error: '30-day credit is not yet activated for your account. Please contact admin for approval.' });
        return;
      }
    }

    // Build order items — all prices & metrics calculated from DB, never from client payload
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        res.status(404).json({ success: false, error: `Product with ID ${item.productId} was not found.` });
        return;
      }

      const qty = item.quantity;
      const isPersqft = product.pricingType === 'per_sqft';

      // ── Compute sq footage strictly from client dimensions but ONLY used as a
      //    unit multiplier — the discount/min logic key (effectiveMetric) is what
      //    matters for validation and tier lookup and it is computed here on the server.
      let sqFtPerUnit = 1;
      if (isPersqft) {
        if (!item.widthFt || !item.heightFt || item.widthFt <= 0 || item.heightFt <= 0) {
          res.status(400).json({
            success: false,
            error: `Product "${product.title}" requires valid width and height dimensions.`
          });
          return;
        }
        // Recompute from raw client values — backend does NOT trust item.totalSqFt
        sqFtPerUnit = item.widthFt * item.heightFt;
      }

      // effectiveMetric: total sq ft for per_sqft products, plain quantity for fixed
      const effectiveMetric = isPersqft ? Math.round(sqFtPerUnit * qty * 100) / 100 : qty;

      // ── Quantity / Area Validation ─────────────────────────────────────────
      const qConfig = product.quantityConfig;
      if (qConfig) {
        const { quantityMode, minQuantity, quantityStep, presetOptions } = qConfig;
        const unit = isPersqft ? 'sq ft' : 'pcs';

        if (quantityMode === 'PRESET_ONLY') {
          if (!presetOptions || !presetOptions.includes(effectiveMetric)) {
            res.status(400).json({
              success: false,
              error: `Invalid ${unit} (${effectiveMetric}) for "${product.title}". Allowed: ${presetOptions?.join(', ') || 'N/A'}.`
            });
            return;
          }
        } else if (quantityMode === 'CUSTOM_INTERVAL') {
          const step = quantityStep || 1;
          if (effectiveMetric < minQuantity) {
            res.status(400).json({
              success: false,
              error: `Minimum order for "${product.title}" is ${minQuantity} ${unit} (you have ${effectiveMetric} ${unit}).`
            });
            return;
          }
          const remainder = Math.round((effectiveMetric - minQuantity) % step * 1000) / 1000;
          if (remainder !== 0) {
            const validExamples = [0, 1, 2, 3].map(i => minQuantity + i * step).join(', ');
            res.status(400).json({
              success: false,
              error: `"${product.title}" must be ordered in steps of ${step} ${unit} starting from ${minQuantity} (e.g. ${validExamples}, …). You have ${effectiveMetric} ${unit}.`
            });
            return;
          }
        } else if (quantityMode === 'ANY_QUANTITY') {
          if (effectiveMetric < minQuantity) {
            res.status(400).json({
              success: false,
              error: `Minimum order for "${product.title}" is ${minQuantity} ${unit} (you have ${effectiveMetric} ${unit}).`
            });
            return;
          }
        }
      }
      // ── End Validation ────────────────────────────────────────────────────

      // ── Price calculation — base unit price for per_sqft includes area ────
      let calculatedUnitPrice = product.basePrice;
      if (isPersqft) {
        calculatedUnitPrice = product.basePrice * sqFtPerUnit;
      }

      // ── Discount Tier lookup — keyed on effectiveMetric, not raw qty ──────
      let discountAppliedAmount = 0;
      if (product.discountTiers && product.discountTiers.length > 0) {
        const matchedTier = product.discountTiers
          .filter((t: any) => effectiveMetric >= t.minQty && (!t.maxQty || effectiveMetric <= t.maxQty))
          .sort((a: any, b: any) => b.minQty - a.minQty)[0];

        if (matchedTier) {
          if (matchedTier.discountType === 'PERCENTAGE') {
            // Discount on the per-unit price so the total scales correctly
            discountAppliedAmount = (calculatedUnitPrice * matchedTier.discountValue) / 100;
          } else if (matchedTier.discountType === 'FLAT_AMOUNT') {
            discountAppliedAmount = matchedTier.discountValue;
          }
          calculatedUnitPrice = Math.max(0, calculatedUnitPrice - discountAppliedAmount);
        }
      }

      const itemTotalPrice = calculatedUnitPrice * qty;
      subtotal += itemTotalPrice;

      orderItems.push({
        productId: new mongoose.Types.ObjectId(item.productId),
        title: product.title,
        quantity: qty,
        dimensions: isPersqft ? {
          widthFt: item.widthFt,
          heightFt: item.heightFt,
          totalSqFt: Math.round(sqFtPerUnit * qty * 100) / 100   // server-computed, not client-trusted
        } : undefined,
        artworkUrl: item.artworkUrl || undefined,
        calculatedUnitPrice,
        discountAppliedAmount: discountAppliedAmount * qty,
        itemTotalPrice
      });
    }

    const gstAmount = Math.round(subtotal * 0.18);
    const shippingFee = subtotal > 999 ? 0 : 99;
    const totalAmount = subtotal + gstAmount + shippingFee;

    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      userId,
      accountType: user.accountType,
      shippingAddress: {
        houseNo: shippingAddress.houseNo,
        buildingName: shippingAddress.buildingName,
        streetName: shippingAddress.streetName,
        area: shippingAddress.area,
        pin: shippingAddress.pin,
      },
      items: orderItems,
      subtotal,
      gstAmount,
      shippingFee,
      totalAmount,
      paymentMethod: paymentMethod || 'RAZORPAY',
      paymentStatus: 'PENDING',
      orderStatus: 'PLACED',
      expectedProcessingTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    });

    res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    // Send Mongoose validation errors in a friendly format
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message).join(', ');
      res.status(400).json({ success: false, error: `Validation failed: ${messages}` });
      return;
    }
    next(error);
  }
};

// ─── Get My Orders ────────────────────────────────────────────────────────────

/**
 * @desc   Get all orders for the logged-in user
 * @route  GET /api/v1/orders/my-orders
 * @access Private
 */
export const getMyOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    next(error);
  }
};
