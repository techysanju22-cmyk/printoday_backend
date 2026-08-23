import './config/env'; // ⚠️ MUST be first — loads dotenv before any other module reads process.env
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/db';

import authRoutes from './routes/authRoutes';
import catalogRoutes from './routes/catalogRoutes';
import orderRoutes from './routes/orderRoutes';
import adminRoutes from './routes/adminRoutes';

import { errorHandler } from './middleware/error';

connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://prin-today.vercel.app',
  credentials: true // Allow cookies to be sent cross-origin
}));

// ─── Rate Limiting (global) ───────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use(limiter);

// ─── Auth OTP rate limiter (stricter) ────────────────────────────────────────
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  message: { success: false, error: 'Too many OTP requests. Please wait.' }
});

// ─── Body & Cookie Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── HTTP Request Logger ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'PrinToday Server is running',
    timestamp: new Date().toISOString()
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth/send-login-otp', otpLimiter); // stricter rate limit on OTP
app.use('/api/v1/auth/initiate-register', otpLimiter); 
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/admin', adminRoutes);

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 PrinToday API listening on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});

// ─── Cron Job ───────────────────────────
setInterval(async() => {
        await fetch(`https://printoday-backend.onrender.com/api/v1/users/health`,{method:"GET"});
}, 14 * 60 *1000);

export default app;
