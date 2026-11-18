import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/authRoutes';
import productRoutes from './routes/product.routes';
import appointmentRoutes from './routes/appointment.routes';
import customOrderRoutes from './routes/customOrder.routes';
import cartRoutes from './routes/cart.routes';
import accountRoutes from './routes/account.routes';
import orderRoutes from './routes/order.routes';
import { adminRoutes, customDesignRoutes, productMedia, receiptRoutes } from './admin';
import { listCollections } from './controllers/product.controller';
import { momoRoutes } from './momo';

import { notFoundHandler, globalErrorHandler } from './middlewares/errorHandler';

const app = express();

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: 'http://localhost:5173', // Cho phép Frontend Vite gọi vào
    credentials: true,             // Bắt buộc bật để truyền nhận Cookie/Session
  })
);
app.use(express.json());
app.use(cookieParser());

// Cấu hình Express Session (Giải quyết triệt để lỗi req.session undefined)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'nail-atelier-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Đặt là true nếu chạy trên HTTPS ở môi trường Production
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // Thời gian sống của session: 1 ngày
    },
  })
);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/orders', receiptRoutes);
app.use('/api/custom-design-requests', customDesignRoutes);
app.use('/api/payments/momo', momoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/media/products', productMedia);
app.get('/api/collections', listCollections);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
