import { Router } from 'express';
import {
  register,
  login,
  findAccount,
  logout,
  getMe,
  updateProfile
} from '../controllers/authController';
import { protect } from '../middleware/protect';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/find-account', findAccount);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
