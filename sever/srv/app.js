"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_session_1 = __importDefault(require("express-session"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const appointment_routes_1 = __importDefault(require("./routes/appointment.routes"));
const customOrder_routes_1 = __importDefault(require("./routes/customOrder.routes"));
const cart_routes_1 = __importDefault(require("./routes/cart.routes"));
const account_routes_1 = __importDefault(require("./routes/account.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const admin_1 = require("./admin");
const product_controller_1 = require("./controllers/product.controller");
const momo_1 = require("./momo");
const errorHandler_1 = require("./middlewares/errorHandler");
const app = (0, express_1.default)();
// Middlewares
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: 'http://localhost:5173', // Cho phép Frontend Vite gọi vào
    credentials: true, // Bắt buộc bật để truyền nhận Cookie/Session
}));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
// Cấu hình Express Session (Giải quyết triệt để lỗi req.session undefined)
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'nail-atelier-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Đặt là true nếu chạy trên HTTPS ở môi trường Production
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // Thời gian sống của session: 1 ngày
    },
}));
// API Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/appointments', appointment_routes_1.default);
app.use('/api/custom-orders', customOrder_routes_1.default);
app.use('/api/cart', cart_routes_1.default);
app.use('/api/account', account_routes_1.default);
app.use('/api/orders', order_routes_1.default);
app.use('/api/orders', admin_1.receiptRoutes);
app.use('/api/custom-design-requests', admin_1.customDesignRoutes);
app.use('/api/payments/momo', momo_1.momoRoutes);
app.use('/api/admin', admin_1.adminRoutes);
app.use('/api/media/products', admin_1.productMedia);
app.get('/api/collections', product_controller_1.listCollections);
// Error Handling Middlewares
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.globalErrorHandler);
exports.default = app;
