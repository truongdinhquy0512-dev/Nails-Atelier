"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProduct = exports.getProductBySlug = exports.getProducts = exports.listCollections = void 0;
const db_1 = require("../config/db");
const response_1 = require("../utils/response");
const admin_1 = require("../admin");
const client_1 = require("@prisma/client");
const publicStatus = client_1.ProductStatus.ACTIVE;
const listCollections = async (_req, res, next) => {
    try {
        const collections = await db_1.prisma.collection.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
        (0, response_1.sendResponse)(res, 200, true, 'Bộ sưu tập', collections);
    }
    catch (error) {
        next(error);
    }
};
exports.listCollections = listCollections;
const getProducts = async (req, res, next) => {
    try {
        const { featured } = req.query;
        const isFeatured = featured === 'true';
        const products = await db_1.prisma.product.findMany({
            where: { status: publicStatus, ...(featured !== undefined ? { isFeatured } : {}) },
            include: admin_1.productInclude,
            orderBy: { createdAt: 'desc' },
        });
        (0, response_1.sendResponse)(res, 200, true, 'Lấy danh sách sản phẩm thành công', products);
    }
    catch (error) {
        next(error);
    }
};
exports.getProducts = getProducts;
const getProductBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        const product = await db_1.prisma.product.findUnique({
            where: { slug, status: publicStatus },
            include: {
                ...admin_1.productInclude,
                reviews: {
                    include: { user: { select: { fullName: true } } },
                },
            },
        });
        if (!product) {
            return (0, response_1.sendResponse)(res, 404, false, 'Không tìm thấy mẫu nail này');
        }
        (0, response_1.sendResponse)(res, 200, true, 'Lấy chi tiết sản phẩm thành công', product);
    }
    catch (error) {
        next(error);
    }
};
exports.getProductBySlug = getProductBySlug;
const createProduct = async (req, res, next) => {
    try {
        const { name, slug, description, price, stock, isFeatured, images } = req.body;
        const newProduct = await db_1.prisma.product.create({
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
        (0, response_1.sendResponse)(res, 201, true, 'Thêm mẫu nail mới thành công', newProduct);
    }
    catch (error) {
        next(error);
    }
};
exports.createProduct = createProduct;
