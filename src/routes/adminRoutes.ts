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
  getPendingOrganizations,
  verifyOrganization
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

// Organization Verification
router.get('/organizations/pending-verification', getPendingOrganizations);
router.put('/organizations/:id/verify', verifyOrganization);

export default router;
