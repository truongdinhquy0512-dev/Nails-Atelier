"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getCsrfToken = exports.getCurrentUser = exports.login = exports.register = void 0;
const db_1 = require("../config/db");
const argon2 = __importStar(require("argon2"));
// 1. Đăng ký tài khoản
const register = async (req, res) => {
    try {
        const { email, password, fullName, phone } = req.body;
        if (!email || !password || !fullName) {
            res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp đầy đủ thông tin.',
                data: null,
                error: 'MISSING_FIELDS',
            });
            return;
        }
        const existingUser = await db_1.prisma.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            res.status(400).json({
                success: false,
                message: 'Email này đã được sử dụng.',
                data: null,
                error: 'EMAIL_ALREADY_EXISTS',
            });
            return;
        }
        const passwordHash = await argon2.hash(password);
        const newUser = await db_1.prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName,
                phone: phone ? String(phone).trim() : null,
                role: 'CUSTOMER',
            },
        });
        if (req.session) {
            req.session.userId = newUser.id;
        }
        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công!',
            data: {
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    fullName: newUser.fullName ?? '',
                    phone: newUser.phone ?? null,
                    role: newUser.role,
                    createdAt: newUser.createdAt.toISOString(),
                    updatedAt: newUser.updatedAt.toISOString(),
                },
                csrfToken: 'mock-csrf-token',
            },
            error: null,
        });
    }
    catch (error) {
        console.error('REGISTER_ERROR:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server nội bộ.',
            data: null,
            error: error.message || 'INTERNAL_SERVER_ERROR',
        });
    }
};
exports.register = register;
// 2. Đăng nhập
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db_1.prisma.user.findUnique({ where: { email } });
        if (!user?.isActive || !(await argon2.verify(user.passwordHash, password))) {
            res.status(401).json({
                success: false,
                message: 'Email hoặc mật khẩu không chính xác.',
                data: null,
                error: 'INVALID_CREDENTIALS',
            });
            return;
        }
        if (req.session) {
            req.session.userId = user.id;
        }
        res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công!',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName ?? '',
                    phone: user.phone ?? null,
                    role: user.role,
                    createdAt: user.createdAt.toISOString(),
                    updatedAt: user.updatedAt.toISOString(),
                },
                csrfToken: 'mock-csrf-token',
            },
            error: null,
        });
    }
    catch (error) {
        console.error('LOGIN_ERROR:', error);
        res.status(500).json({ success: false, message: 'Lỗi server', data: null, error: error.message });
    }
};
exports.login = login;
// 3. Lấy thông tin user hiện tại
const getCurrentUser = async (req, res) => {
    try {
        const userId = req.session?.userId;
        if (!userId) {
            res.status(401).json({ success: false, message: 'Unauthorized', data: null, error: 'UNAUTHORIZED' });
            return;
        }
        const user = await db_1.prisma.user.findUnique({ where: { id: Number(userId) } });
        if (!user?.isActive) {
            res.status(404).json({ success: false, message: 'User not found', data: null, error: 'USER_NOT_FOUND' });
            return;
        }
        res.status(200).json({
            success: true,
            message: 'Success',
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName ?? '',
                    phone: user.phone ?? null,
                    role: user.role,
                    createdAt: user.createdAt.toISOString(),
                    updatedAt: user.updatedAt.toISOString(),
                },
                csrfToken: 'mock-csrf-token',
            },
            error: null,
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server', data: null, error: error.message });
    }
};
exports.getCurrentUser = getCurrentUser;
// 4. Lấy CSRF Token
const getCsrfToken = async (req, res) => {
    res.status(200).json({ success: true, message: 'OK', data: { csrfToken: 'mock-csrf-token' }, error: null });
};
exports.getCsrfToken = getCsrfToken;
// 5. Đăng xuất
const logout = async (req, res) => {
    if (req.session)
        req.session.destroy(() => { });
    res.clearCookie('connect.sid');
    res.status(200).json({ success: true, message: 'Logout success', data: { message: 'OK' }, error: null });
};
exports.logout = logout;
