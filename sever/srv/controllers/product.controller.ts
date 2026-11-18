import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { sendResponse } from '../utils/response';
import { productInclude } from '../admin';
import { ProductStatus } from '@prisma/client';

const publicStatus = ProductStatus.ACTIVE;

export const listCollections = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    sendResponse(res, 200, true, 'Bộ sưu tập', collections);
  } catch (error) { next(error); }
};

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { featured } = req.query;
    const isFeatured = featured === 'true';

    const products = await prisma.product.findMany({
      where: { status: publicStatus, ...(featured !== undefined ? { isFeatured } : {}) },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    });

    sendResponse(res, 200, true, 'Lấy danh sách sản phẩm thành công', products);
  } catch (error) {
    next(error);
  }
};

export const getProductBySlug = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;
    const product = await prisma.product.findUnique({
      where: { slug, status: publicStatus },
      include: {
        ...productInclude,
        reviews: {
          include: { user: { select: { fullName: true } } },
        },
      },
    });

    if (!product) {
      return sendResponse(res, 404, false, 'Không tìm thấy mẫu nail này');
    }

    sendResponse(res, 200, true, 'Lấy chi tiết sản phẩm thành công', product);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, description, price, stock, isFeatured, images } = req.body;

    const newProduct = await prisma.product.create({
      data: {
        name,
        slug,
        description,
        price,
        stock,
        isFeatured,
        images: {
          create: images || [],
        },
      },
      include: { images: true },
    });

    sendResponse(res, 201, true, 'Thêm mẫu nail mới thành công', newProduct);
  } catch (error) {
    next(error);
  }
};
