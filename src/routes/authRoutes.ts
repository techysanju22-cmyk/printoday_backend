import { Router } from 'express';
import {
  initiateRegister,
  verifyRegisterOtp,
  sendLoginOtp,
  verifyLoginOtp,
  findAccount,
  logout,
  getMe,
  updateProfile
} from '../controllers/authController';
import { protect } from '../middleware/protect';

const router = Router();

router.post('/initiate-register', initiateRegister);
router.post('/verify-register-otp', verifyRegisterOtp);
router.post('/send-login-otp', sendLoginOtp);
router.post('/verify-login-otp', verifyLoginOtp);
router.post('/find-account', findAccount);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
