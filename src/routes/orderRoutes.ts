import { Router } from 'express';
import { verifyCart, checkout, getMyOrders } from '../controllers/orderController';
import { protect } from '../middleware/protect';

const router = Router();

router.post('/verify-cart', verifyCart);
router.post('/checkout', protect, checkout);
router.get('/my-orders', protect, getMyOrders);

export default router;
