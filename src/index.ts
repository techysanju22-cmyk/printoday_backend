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

// ─── Trust Render's Reverse Proxy ─────────────────────────────────────────────
// Required so req.ip, rate limiting, and cookies work correctly behind Render/Nginx
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'https://prin-today.vercel.app',
  credentials: true // Allow cookies to be sent cross-origin
}));

// ─── Body & Cookie Parsing ────────────────────────────────────────────────────
// MUST come before rate limiters and routes so req.body is populated
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── HTTP Request Logger ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use(limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  try {
    console.log('health OK');
    return res.status(200).json({
      success: true,
      message: 'Health OK',
    });
  } catch (error) {
    console.error('Health error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while checking health',
    });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth', authRoutes);
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

// ─── Cron Job: Keep Render dyno alive ─────────────────────────────────────────
setInterval(async () => {
  await fetch('https://printoday-backend-2.onrender.com/api/health', { method: 'GET' });
}, 14 * 60 * 1000);

export default app;
