import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { sendEmail } from '../config/mailer';

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
    const { items, shippingAddress, paymentMethod, paymentTerm, utrNumber, customerName, customerEmail, customerPhone, gstin, couponCode } = req.body;

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

    // Limit users to 3 pending orders at a time
    const pendingOrderCount = await Order.countDocuments({ userId, paymentStatus: { $in: ['PENDING', 'PENDING_VERIFICATION'] } });
    if (pendingOrderCount >= 3) {
      res.status(403).json({ success: false, error: 'You have reached the maximum limit of 3 pending orders. Please complete payment for existing orders before placing a new one.' });
      return;
    }

    // Verify credit eligibility based on paymentTerm
    if (paymentTerm === 'ORG_CREDIT') {
      if (user.accountType !== 'ORGANIZATION') {
        res.status(403).json({ success: false, error: 'Org credit is only available for registered organizations.' });
        return;
      }
      if (!user.organization?.creditEligible) {
        res.status(403).json({ success: false, error: '30-day credit is not yet activated for your account. Please contact admin for approval.' });
        return;
      }
    } else if (paymentTerm === '50_PERCENT_ADVANCE') {
      if (user.accountType !== 'INDIVIDUAL') {
        res.status(403).json({ success: false, error: '50% advance credit is only available for individuals.' });
        return;
      }
      if (!user.individual?.creditEligible) {
        res.status(403).json({ success: false, error: '30-day credit (50% advance) is not yet activated for your account. Please contact admin for approval.' });
        return;
      }
    }

    // utrNumber requirement temporarily removed as online payments are bypassed

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

    let gstAmount = Math.round(subtotal * 0.18);
    let shippingFee = subtotal > 999 ? 0 : 99;
    let couponDiscountAmount = 0;
    
    // ── Apply Coupon if provided ──────────────────────────────────────────────
    if (couponCode) {
      const { Coupon } = await import('../models/Coupon');
      const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
      if (coupon && coupon.usedCount < coupon.maxUses) {
        let valid = false;
        if (coupon.conditionType === 'NONE') {
          valid = true;
        } else if (coupon.conditionType === 'MIN_ORDER_AMOUNT' && coupon.minOrderAmount) {
          valid = subtotal >= coupon.minOrderAmount;
        } else if (coupon.conditionType === 'SPECIFIC_PRODUCT' && coupon.productId) {
          valid = orderItems.some(item => item.productId.toString() === coupon.productId?.toString());
        }

        if (valid) {
          couponDiscountAmount = Math.round((subtotal * coupon.discountPercentage) / 100);
          await Coupon.findByIdAndUpdate(coupon._id, { $inc: { usedCount: 1 } });
        }
      }
    }

    // Recalculate total if discount applied to subtotal
    const discountedSubtotal = Math.max(0, subtotal - couponDiscountAmount);
    gstAmount = 0; // GST removed per user request
    shippingFee = 0; // Express priority shipping is free
    const totalAmount = discountedSubtotal + gstAmount + shippingFee;

    let advancePaid = totalAmount;
    let remainingBalance = 0;
    let paymentStatus = 'PENDING_VERIFICATION';

    if (paymentTerm === 'ORG_CREDIT') {
      advancePaid = 0;
      remainingBalance = totalAmount;
      paymentStatus = 'CREDIT_PENDING';
    } else if (paymentTerm === '50_PERCENT_ADVANCE') {
      advancePaid = Math.round(totalAmount * 0.5);
      remainingBalance = totalAmount - advancePaid;
      paymentStatus = 'PENDING_VERIFICATION';
    }

    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      orderNumber,
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
      couponCode: couponDiscountAmount > 0 ? couponCode : undefined,
      couponDiscountAmount: couponDiscountAmount > 0 ? couponDiscountAmount : undefined,
      paymentMethod: paymentMethod || 'RAZORPAY',
      paymentTerm: paymentTerm as any,
      paymentStatus: paymentStatus as any,
      advancePaid,
      remainingBalance,
      utrNumber,
      orderStatus: 'PLACED',
      expectedProcessingTime: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 hours from now
    });

    // Send Admin Email (Non-blocking)
    const itemsHtml = orderItems.map(item => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.title}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">₹${item.itemTotalPrice.toLocaleString()}</td>
      </tr>
    `).join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #0b2239; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px;">🛒 New Order: ${orderNumber}</h2>
        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #0b2239;">Customer Details</h3>
          <p style="margin: 5px 0;"><strong>Name:</strong> ${customerName || user.email}</p>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> ${customerPhone || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Type:</strong> ${user.accountType}</p>
        </div>

        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="margin-top: 0; color: #1e3a5f;">📦 Delivery Address</h3>
          <p style="margin: 5px 0;"><strong>Name:</strong> ${shippingAddress.fullName || customerName || 'N/A'}</p>
          ${shippingAddress.houseNo ? `<p style="margin: 5px 0;">${shippingAddress.houseNo}</p>` : ''}
          ${shippingAddress.buildingName ? `<p style="margin: 5px 0;">${shippingAddress.buildingName}</p>` : ''}
          <p style="margin: 5px 0;">${shippingAddress.streetName}</p>
          <p style="margin: 5px 0;">${shippingAddress.area}</p>
          <p style="margin: 5px 0;"><strong>PIN:</strong> ${shippingAddress.pin}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Product</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Qty</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="text-align: right; font-size: 14px;">
          <p style="margin: 5px 0;"><strong>Subtotal:</strong> ₹${subtotal.toLocaleString()}</p>
          ${couponDiscountAmount > 0 ? `<p style="margin: 5px 0; color: #10b981;"><strong>Coupon Discount (${couponCode}):</strong> -₹${couponDiscountAmount.toLocaleString()}</p>` : ''}
          <p style="margin: 5px 0;"><strong>Shipping:</strong> ${shippingFee === 0 ? 'Free' : `₹${shippingFee}`}</p>
          <h3 style="margin: 10px 0; font-size: 18px; color: #0b2239;">Grand Total: ₹${totalAmount.toLocaleString()}</h3>
        </div>
      </div>
    `;

    sendEmail({
      email: 'techysanju10@gmail.com',
      subject: `🛒 New Order Placed — ${orderNumber}`,
      message: `New Order: ${orderNumber}`, // plain text fallback
      html: emailHtml
    }).catch(err => console.error('Failed to send admin order email (techysanju10):', err));

    sendEmail({
      email: 'rituparnodeynst@gmail.com',
      subject: `🛒 New Order Placed — ${orderNumber}`,
      message: `New Order: ${orderNumber}`, // plain text fallback
      html: emailHtml
    }).catch(err => console.error('Failed to send admin order email (rituparnodeynst):', err));

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

// ─── Validate Coupon ──────────────────────────────────────────────────────────

export const validateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, subtotal, itemIds } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: 'Coupon code is required' });
      return;
    }

    const { Coupon } = await import('../models/Coupon');
    const coupon = await Coupon.findOne({ code: code.toUpperCase() });

    if (!coupon) {
      res.status(404).json({ success: false, error: 'Invalid coupon code' });
      return;
    }

    if (!coupon.isActive) {
      res.status(400).json({ success: false, error: 'This coupon is no longer active' });
      return;
    }

    if (coupon.usedCount >= coupon.maxUses) {
      res.status(400).json({ success: false, error: 'This coupon has reached its usage limit' });
      return;
    }

    if (coupon.conditionType === 'MIN_ORDER_AMOUNT' && coupon.minOrderAmount) {
      if (subtotal < coupon.minOrderAmount) {
        res.status(400).json({ success: false, error: `This coupon requires a minimum order amount of ₹${coupon.minOrderAmount}` });
        return;
      }
    }

    if (coupon.conditionType === 'SPECIFIC_PRODUCT' && coupon.productId) {
      if (!itemIds || !itemIds.includes(coupon.productId.toString())) {
        res.status(400).json({ success: false, error: 'This coupon is only valid for specific products' });
        return;
      }
    }

    const discountAmount = Math.round((subtotal * coupon.discountPercentage) / 100);

    res.status(200).json({ 
      success: true, 
      data: {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
        discountAmount
      } 
    });
  } catch (error) { next(error); }
};
