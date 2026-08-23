import { Router } from 'express';
import { getCategories, getSubcategories, getProducts, getProduct } from '../controllers/catalogController';

const router = Router();

router.get('/categories', getCategories);
router.get('/subcategories', getSubcategories);
router.get('/products', getProducts);
router.get('/products/:slugOrId', getProduct);

export default router;
