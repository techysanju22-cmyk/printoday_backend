import { Router } from 'express';
import {
  adminGetProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminCreateCategory,
  adminCreateSubcategory,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminUpdatePaymentStatus,
  getPendingOrganizations,
  verifyOrganization,
  adminGetUsers,
  adminUpdateUser,
  adminBanUser,
  adminGetCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon
} from '../controllers/adminController';
import { protect } from '../middleware/protect';
import { admin } from '../middleware/admin';

const router = Router();

// All admin routes require authentication + admin role
router.use(protect, admin);

// Products
router.get('/products', adminGetProducts);
router.post('/products', adminCreateProduct);
router.put('/products/:id', adminUpdateProduct);
router.delete('/products/:id', adminDeleteProduct);

// Categories & Subcategories
router.post('/categories', adminCreateCategory);
router.post('/subcategories', adminCreateSubcategory);

// Orders
router.get('/orders', adminGetOrders);
router.put('/orders/:id/status', adminUpdateOrderStatus);
router.put('/orders/:id/payment', adminUpdatePaymentStatus);

// Organization Verification
router.get('/organizations/pending-verification', getPendingOrganizations);
router.put('/organizations/:id/verify', verifyOrganization);

// User Management
router.get('/users', adminGetUsers);
router.put('/users/:id', adminUpdateUser);
router.patch('/users/:id/ban', adminBanUser);

// Coupons
router.get('/coupons', adminGetCoupons);
router.post('/coupons', adminCreateCoupon);
router.put('/coupons/:id', adminUpdateCoupon);
router.delete('/coupons/:id', adminDeleteCoupon);

export default router;
