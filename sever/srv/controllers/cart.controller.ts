import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { sendResponse } from '../utils/response';
import { NailShape, NailLength } from '@prisma/client';

export const getCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number((req.session as typeof req.session & { userId?: number }).userId);
    if (!userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');

    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: { include: { images: true } } },
        },
      },
    });

    sendResponse(res, 200, true, 'Lấy thông tin giỏ hàng thành công', cart);
  } catch (error) {
    next(error);
  }
};

export const addToCart = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = Number((req.session as typeof req.session & { userId?: number }).userId);
    if (!userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');
    const { productId, quantity = 1, shape, length } = req.body;
    if (!Number.isInteger(Number(productId)) || Number(productId) <= 0 || !Object.values(NailShape).includes(shape) ||
        !Object.values(NailLength).includes(length) || !Number.isInteger(quantity) || quantity < 1)
      return sendResponse(res, 400, false, 'Sản phẩm, biến thể hoặc số lượng không hợp lệ.');

    let cart = await prisma.cart.findUnique({ where: { userId: Number(userId) } });

    if (!cart) {
      cart = await prisma.cart.create({ data: { userId: Number(userId) } });
    }

    const cartItem = await prisma.cartItem.upsert({
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

    sendResponse(res, 200, true, 'Thêm sản phẩm vào giỏ hàng thành công', cartItem);
  } catch (error) {
    next(error);
  }
};
