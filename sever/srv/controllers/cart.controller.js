"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addToCart = exports.getCart = void 0;
const db_1 = require("../config/db");
const response_1 = require("../utils/response");
const client_1 = require("@prisma/client");
const getCart = async (req, res, next) => {
    try {
        const userId = Number(req.session.userId);
        if (!userId)
            return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
        const cart = await db_1.prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: { product: { include: { images: true } } },
                },
            },
        });
        (0, response_1.sendResponse)(res, 200, true, 'Lấy thông tin giỏ hàng thành công', cart);
    }
    catch (error) {
        next(error);
    }
};
exports.getCart = getCart;
const addToCart = async (req, res, next) => {
    try {
        const userId = Number(req.session.userId);
        if (!userId)
            return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
        const { productId, quantity = 1, shape, length } = req.body;
        if (!Number.isInteger(Number(productId)) || Number(productId) <= 0 || !Object.values(client_1.NailShape).includes(shape) ||
            !Object.values(client_1.NailLength).includes(length) || !Number.isInteger(quantity) || quantity < 1)
            return (0, response_1.sendResponse)(res, 400, false, 'Sản phẩm, biến thể hoặc số lượng không hợp lệ.');
        let cart = await db_1.prisma.cart.findUnique({ where: { userId: Number(userId) } });
        if (!cart) {
            cart = await db_1.prisma.cart.create({ data: { userId: Number(userId) } });
        }
        const cartItem = await db_1.prisma.cartItem.upsert({
            where: {
                cartId_productId_shape_length: {
                    cartId: cart.id,
                    productId: Number(productId),
                    shape,
                    length,
                },
            },
            update: {
                quantity: { increment: quantity || 1 },
            },
            create: {
                cartId: cart.id,
                productId: Number(productId),
                shape,
                length,
                quantity: quantity || 1,
            },
        });
        (0, response_1.sendResponse)(res, 200, true, 'Thêm sản phẩm vào giỏ hàng thành công', cartItem);
    }
    catch (error) {
        next(error);
    }
};
exports.addToCart = addToCart;
