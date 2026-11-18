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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.productInclude = exports.productMedia = exports.customDesignRoutes = exports.receiptRoutes = exports.adminRoutes = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const client_1 = require("@prisma/client");
const express_1 = __importStar(require("express"));
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../src/config/db");
const response_1 = require("../src/utils/response");
const email_1 = require("./email");
exports.adminRoutes = (0, express_1.Router)();
exports.receiptRoutes = (0, express_1.Router)();
exports.customDesignRoutes = (0, express_1.Router)();
const directory = (0, node_path_1.resolve)(process.env.PRODUCT_UPLOAD_DIR || 'sever/uploads/products');
const prefix = '/api/media/products/';
exports.productMedia = express_1.default.static(directory, { index: false, dotfiles: 'deny' });
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 32768 } });
const imageOrder = { sortOrder: 'asc' };
exports.productInclude = { images: { orderBy: imageOrder }, collections: { orderBy: [{ sortOrder: 'asc' }, { collectionId: 'asc' }], include: { collection: true } } };
const ok = (res, data, status = 200) => (0, response_1.sendResponse)(res, status, true, 'Thành công', data);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const route = (fn) => (req, res, next) => { void fn(req, res).catch(next); };
const idOf = (value) => {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : fail(400, 'ID không hợp lệ.');
};
exports.adminRoutes.use((req, res, next) => {
    void (async () => {
        const userId = Number(req.session?.userId);
        if (!Number.isInteger(userId) || userId <= 0)
            return fail(401, 'Vui lòng đăng nhập.');
        const user = await db_1.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
        if (user?.role !== 'ADMIN' || !user.isActive)
            return fail(403, 'Yêu cầu quyền quản trị.');
        if (req.method !== 'GET' && req.get('X-Atelier-Admin') !== '1')
            return fail(403, 'Thiếu tiêu đề bảo vệ yêu cầu quản trị.');
        res.locals.adminId = userId;
        next();
    })().catch(next);
});
const slugOf = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const number = (v, lo, hi) => typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : fail(400, 'Giá hoặc số lượng không hợp lệ.');
const text = (v, max) => typeof v === 'string' && v.trim().length <= max ? v.trim() : fail(400, 'Nội dung không hợp lệ.');
const options = (v, allowed) => {
    if (!Array.isArray(v) || !v.length || !v.every(x => allowed.includes(x)))
        return fail(400, 'Chọn dáng và độ dài hợp lệ.');
    return [...new Set(v)];
};
const imageExtension = (b) => {
    if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return 'png';
    if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
        return 'jpg';
    if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
        return 'webp';
    return fail(400, 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
};
const removeFile = async (url) => {
    const name = url.slice(prefix.length);
    if (url.startsWith(prefix) && /^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name))
        await (0, promises_1.unlink)((0, node_path_1.resolve)(directory, name)).catch(err => { if (err.code !== 'ENOENT')
            console.error('Product image cleanup failed', err.code); });
};
exports.adminRoutes.get('/products', route(async (_req, res) => ok(res, await db_1.prisma.product.findMany({ include: exports.productInclude, orderBy: { id: 'desc' } }))));
exports.adminRoutes.get('/collections', route(async (_req, res) => ok(res, await db_1.prisma.collection.findMany({ orderBy: { name: 'asc' } }))));
exports.adminRoutes.post('/collections', route(async (req, res) => {
    const name = text(req.body.name, 150);
    const slug = slugOf(name);
    if (!slug)
        return fail(400, 'Tên bộ sưu tập không hợp lệ.');
    return ok(res, await db_1.prisma.collection.create({ data: { name, slug } }), 201);
}));
const save = route(async (req, res) => {
    const id = req.params.id ? idOf(req.params.id) : undefined;
    let b;
    try {
        b = JSON.parse(req.body.product);
    }
    catch {
        return fail(400, 'Thiếu thông tin sản phẩm.');
    }
    if (!b || typeof b !== 'object')
        return fail(400, 'Thông tin sản phẩm không hợp lệ.');
    const name = text(b.name, 255);
    if (name.length < 3 || !slugOf(name))
        return fail(400, 'Tên sản phẩm cần ít nhất 3 ký tự.');
    const stock = number(b.stock, 0, 2147483647);
    if (!Object.values(client_1.ProductStatus).includes(b.status))
        return fail(400, 'Trạng thái không hợp lệ.');
    const status = b.status;
    const fields = { name, stock, status, price: number(b.price, 10000, 999999999999), description: text(b.description ?? '', 5000),
        isFeatured: b.isFeatured === true, shapeOptions: options(b.shapeOptions, Object.values(client_1.NailShape)), lengthOptions: options(b.lengthOptions, Object.values(client_1.NailLength)) };
    const collectionId = b.collectionId ? idOf(b.collectionId) : null;
    const files = (req.files || []);
    const order = b.imageOrder;
    if (!Array.isArray(order) || order.length > 5 || new Set(order).size !== order.length ||
        order.filter(x => typeof x === 'string' && /^new:[0-4]$/.test(x)).length !== files.length ||
        (status === 'ACTIVE' && !order.length))
        return fail(400, 'Sản phẩm đang bán cần từ 1 đến 5 ảnh.');
    const written = [];
    let result;
    try {
        if (files.length)
            await (0, promises_1.mkdir)(directory, { recursive: true });
        for (const file of files) {
            const filename = `${(0, node_crypto_1.randomUUID)()}.${imageExtension(file.buffer)}`;
            written.push(prefix + filename);
            await (0, promises_1.writeFile)((0, node_path_1.resolve)(directory, filename), file.buffer, { flag: 'wx' });
        }
        result = await db_1.prisma.$transaction(async (tx) => {
            const old = id ? await tx.product.findUnique({ where: { id }, include: exports.productInclude }) : null;
            if (id && !old)
                return fail(404, 'Không tìm thấy sản phẩm.');
            if (collectionId && !await tx.collection.findUnique({ where: { id: collectionId } }))
                return fail(400, 'Bộ sưu tập không tồn tại.');
            const images = order.map((key, sortOrder) => {
                const imageUrl = typeof key === 'number' ? old?.images.find(i => i.id === key)?.imageUrl :
                    typeof key === 'string' && /^new:[0-4]$/.test(key) ? written[Number(key.slice(4))] : undefined;
                if (!imageUrl)
                    return fail(400, 'Danh sách ảnh không hợp lệ.');
                return { imageUrl, sortOrder, isPrimary: sortOrder === 0 };
            });
            const collections = collectionId ? { create: { collectionId } } : {};
            if (old && old.collections[0]?.collectionId !== (collectionId ?? undefined)) {
                const previous = old.collections[0];
                if (previous)
                    await tx.collectionProduct.delete({ where: { collectionId_productId: { collectionId: previous.collectionId, productId: old.id } } });
                if (collectionId)
                    await tx.collectionProduct.upsert({
                        where: { collectionId_productId: { collectionId, productId: old.id } },
                        update: {}, create: { collectionId, productId: old.id },
                    });
            }
            const data = old ? await tx.product.update({ where: { id: old.id }, data: { ...fields, images: { deleteMany: {}, create: images } }, include: exports.productInclude }) :
                await tx.product.create({ data: { ...fields, slug: slugOf(name), colorPalette: [], images: { create: images }, collections }, include: exports.productInclude });
            return { data, removed: old?.images.filter(i => !images.some(n => n.imageUrl === i.imageUrl)) ?? [] };
        }, { isolationLevel: 'Serializable' });
    }
    catch (err) {
        await Promise.all(written.map(removeFile));
        throw err;
    }
    await Promise.all(result.removed.map(i => removeFile(i.imageUrl)));
    return ok(res, result.data, id ? 200 : 201);
});
exports.adminRoutes.post('/products', upload.array('images', 5), save);
exports.adminRoutes.patch('/products/:id', upload.array('images', 5), save);
exports.adminRoutes.delete('/products/:id', route(async (req, res) => {
    const id = idOf(req.params.id);
    const images = await db_1.prisma.$transaction(async (tx) => {
        if (await tx.orderItem.count({ where: { productId: id } }))
            return fail(409, 'Sản phẩm đã có trong đơn hàng; hãy chuyển sang Lưu trữ.');
        if (await tx.cartItem.count({ where: { productId: id } }))
            return fail(409, 'Sản phẩm đang có trong giỏ hàng; hãy chuyển sang Lưu trữ.');
        return (await tx.product.delete({ where: { id }, include: { images: true } })).images;
    }, { isolationLevel: 'Serializable' });
    await Promise.all(images.map(i => removeFile(i.imageUrl)));
    return ok(res, null);
}));
const newest = { id: 'desc' };
const list = { take: 100, orderBy: newest };
const person = { select: { fullName: true, email: true } };
exports.adminRoutes.get('/dashboard', route(async (_req, res) => {
    const [orders, pending, revenue, receipts, custom] = await Promise.all([
        db_1.prisma.order.count(), db_1.prisma.order.count({ where: { status: 'PENDING' } }),
        db_1.prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
        db_1.prisma.payment.count({ where: { status: 'AWAITING_VERIFICATION' } }),
        db_1.prisma.customOrder.count({ where: { status: { in: ['SUBMITTED', 'NEED_INFO'] } } }),
    ]);
    return ok(res, { orders, pending, revenue: Number(revenue._sum.amount ?? 0), receipts, custom });
}));
exports.adminRoutes.get('/orders', route(async (_req, res) => ok(res, await db_1.prisma.order.findMany({ ...list, include: { user: person,
        payments: { orderBy: newest, take: 1, select: { method: true, status: true } } } }))));
exports.adminRoutes.get('/payments', route(async (_req, res) => {
    const payments = await db_1.prisma.payment.findMany({ ...list, select: { id: true, amount: true, method: true, status: true, transferReference: true, receiptUploadedAt: true, order: { select: { orderCode: true } } } });
    return ok(res, payments.map(({ receiptUploadedAt, ...p }) => ({ ...p, hasReceipt: Boolean(receiptUploadedAt) })));
}));
exports.adminRoutes.get('/custom-design-requests', route(async (_req, res) => ok(res, await db_1.prisma.customOrder.findMany({ ...list, include: { images: customImageMeta } }))));
exports.adminRoutes.get('/users', route(async (_req, res) => ok(res, await db_1.prisma.user.findMany({ ...list, select: { id: true, email: true, fullName: true, role: true, isActive: true, lockedReason: true } }))));
exports.adminRoutes.get('/promotions', route(async (_req, res) => ok(res, await db_1.prisma.coupon.findMany(list))));
exports.adminRoutes.get('/email-logs', route(async (_req, res) => ok(res, await db_1.prisma.emailLog.findMany(list))));
exports.adminRoutes.post('/email-logs/:id/retry', route(async (req, res) => {
    const id = idOf(req.params.id);
    const row = await db_1.prisma.emailLog.findUnique({ where: { id } });
    if (!row || row.status !== 'FAILED')
        return fail(409, 'Chỉ gửi lại email đã lỗi.');
    await (0, email_1.deliverEmail)(id);
    return ok(res, await db_1.prisma.emailLog.findUnique({ where: { id } }));
}));
exports.adminRoutes.patch('/users/:id', route(async (req, res) => {
    const id = idOf(req.params.id);
    const isActive = req.body.isActive;
    if (typeof isActive !== 'boolean')
        return fail(400, 'Trạng thái không hợp lệ.');
    const lockedReason = isActive ? null : text(req.body.reason, 1000);
    if (!isActive && !lockedReason)
        return fail(400, 'Cần lý do khóa.');
    const result = await db_1.prisma.user.updateMany({ where: { id, role: 'CUSTOMER' }, data: { isActive, lockedReason, lockedAt: isActive ? null : new Date() } });
    if (!result.count)
        return fail(404, 'Không tìm thấy khách hàng.');
    return ok(res, null);
}));
exports.adminRoutes.post('/promotions', route(async (req, res) => {
    const code = text(req.body.code, 20).toUpperCase();
    const { discountType } = req.body;
    if (!/^[A-Z0-9]{4,20}$/.test(code) || !Object.values(client_1.DiscountType).includes(discountType))
        return fail(400, 'Mã hoặc loại khuyến mãi không hợp lệ.');
    const discountValue = number(req.body.discountValue, 1, discountType === 'PERCENT' ? 100 : 999999999999);
    return ok(res, await db_1.prisma.coupon.create({ data: {
            code, discountType, discountValue,
            maxDiscount: discountType === 'PERCENT' ? number(req.body.maxDiscount, 1, 999999999999) : null,
            minOrderAmount: number(req.body.minOrderAmount ?? 0, 0, 999999999999),
            usageLimit: number(req.body.usageLimit, 1, 2147483647),
            startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000),
        } }), 201);
}));
exports.adminRoutes.patch('/promotions/:id', route(async (req, res) => {
    if (typeof req.body.isActive !== 'boolean')
        return fail(400, 'Trạng thái không hợp lệ.');
    return ok(res, await db_1.prisma.coupon.update({ where: { id: idOf(req.params.id) }, data: { isActive: req.body.isActive } }));
}));
exports.adminRoutes.patch('/custom-design-requests/:id', route(async (req, res) => {
    const id = idOf(req.params.id);
    const { status } = req.body;
    if (status !== 'QUOTED' && status !== 'NEED_INFO' && status !== 'REJECTED')
        return fail(400, 'Trạng thái không hợp lệ.');
    const note = text(req.body.note ?? '', 2000);
    if (status !== 'QUOTED' && !note)
        return fail(400, 'Cần nhập lý do hoặc nội dung yêu cầu.');
    const result = await db_1.prisma.customOrder.updateMany({ where: { id, status: { in: ['SUBMITTED', 'NEED_INFO'] } },
        data: status === 'QUOTED' ? { status, quotedPrice: number(req.body.quotedPrice, 10000, 999999999999), quotedAt: new Date(), quoteNote: note } :
            status === 'REJECTED' ? { status, rejectionReason: note } : { status, quoteNote: note },
    });
    if (!result.count)
        return fail(409, 'Yêu cầu không còn ở trạng thái có thể xử lý.');
    const design = await db_1.prisma.customOrder.findUnique({ where: { id }, select: { userId: true, user: { select: { email: true } } } });
    if (design)
        (0, email_1.notify)('CUSTOM_DESIGN_UPDATE', design.user.email, status === 'QUOTED' ? `Báo giá thiết kế #${id}` : `Cập nhật yêu cầu thiết kế #${id}`, { userId: design.userId, customOrderId: id });
    return ok(res, null);
}));
const customImageMeta = { select: { id: true }, orderBy: { sortOrder: 'asc' } };
const sendImage = (res, b64, mime) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime))
        return fail(404, 'Không tìm thấy ảnh.');
    return res.set('Cache-Control', 'private, no-store').type(mime).send(Buffer.from(b64, 'base64'));
};
exports.adminRoutes.get('/custom-images/:id', route(async (req, res) => {
    const image = await db_1.prisma.customOrderImage.findUnique({ where: { id: idOf(req.params.id) } });
    if (!image)
        return fail(404, 'Không tìm thấy ảnh.');
    return sendImage(res, image.imageUrl, image.mimeType);
}));
const orderNext = { PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'SHIPPING', SHIPPING: 'COMPLETED' };
exports.adminRoutes.patch('/orders/:id/status', route(async (req, res) => {
    const id = idOf(req.params.id);
    const order = await db_1.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { payments: { take: 1, orderBy: newest } } });
        if (!order)
            return fail(404, 'Không tìm thấy đơn hàng.');
        const next = orderNext[order.status];
        if (!next || next !== req.body.status)
            return fail(409, 'Không thể chuyển trạng thái đơn.');
        const payment = order.payments[0];
        if (!payment || (payment.method !== 'COD' && payment.status !== 'PAID'))
            return fail(409, 'Đơn chưa được thanh toán.');
        await tx.order.update({ where: { id }, data: { status: next } });
        await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: next, changedById: res.locals.adminId } });
        if (order.customOrderId && (next === 'PROCESSING' || next === 'COMPLETED'))
            await tx.customOrder.update({ where: { id: order.customOrderId }, data: { status: next === 'PROCESSING' ? 'IN_PRODUCTION' : 'COMPLETED' } });
        if (next === 'COMPLETED' && payment.method === 'COD')
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', verifiedById: res.locals.adminId, verifiedAt: new Date() } });
        return order;
    }, { isolationLevel: 'Serializable' });
    (0, email_1.notify)('ORDER_STATUS_CHANGED', order.contactEmail, `Đơn ${order.orderCode} có trạng thái mới`, { userId: order.userId, orderId: id });
    return ok(res, null);
}));
exports.adminRoutes.patch('/orders/:id/cancel', route(async (req, res) => {
    const id = idOf(req.params.id);
    const reason = text(req.body.reason, 2000);
    if (!reason)
        return fail(400, 'Cần nhập lý do hủy.');
    await db_1.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id }, include: { payments: true, orderItems: true, couponUsage: true } });
        if (!order)
            return fail(404, 'Không tìm thấy đơn hàng.');
        if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status) ||
            order.payments.some(p => p.status === 'PAID' || (p.method === 'MOMO' && p.status === 'PENDING' && p.momoRequestId)))
            return fail(409, 'Chỉ hủy đơn chưa thanh toán và chưa giao; đơn đã thanh toán cần xử lý hoàn tiền riêng.');
        if (order.customOrderId)
            return fail(409, 'Đơn thiết kế riêng cần được xử lý riêng.');
        await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
        await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: 'CANCELLED', changedById: res.locals.adminId, note: reason } });
        await tx.payment.updateMany({ where: { orderId: id }, data: { status: 'CANCELLED' } });
        for (const item of order.orderItems) {
            if (item.productId)
                await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
        if (order.couponUsage) {
            await tx.couponUsage.delete({ where: { orderId: id } });
            await tx.coupon.updateMany({ where: { id: order.couponUsage.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
        }
    }, { isolationLevel: 'Serializable' });
    return ok(res, null);
}));
exports.adminRoutes.patch('/payments/:id/verify', route(async (req, res) => {
    const id = idOf(req.params.id);
    const { approve } = req.body;
    if (typeof approve !== 'boolean')
        return fail(400, 'Kết quả đối soát không hợp lệ.');
    const result = await db_1.prisma.payment.updateMany({ where: { id, method: 'BANK_TRANSFER',
            status: 'AWAITING_VERIFICATION', receiptImage: { not: null }, order: { status: 'PENDING' } },
        data: { status: approve ? 'PAID' : 'FAILED', verifiedAt: new Date(), verifiedById: res.locals.adminId } });
    if (!result.count)
        return fail(409, 'Giao dịch không có biên lai hợp lệ đang chờ đối soát.');
    const p = await db_1.prisma.payment.findUnique({ where: { id }, select: { order: { select: { id: true, contactEmail: true, orderCode: true, userId: true } } } });
    if (p)
        (0, email_1.notify)('PAYMENT_RESULT', p.order.contactEmail, `Biên lai đơn ${p.order.orderCode}: ${approve ? 'đã xác nhận' : 'cần gửi lại'}`, { userId: p.order.userId, orderId: p.order.id });
    return ok(res, null);
}));
exports.adminRoutes.get('/payments/:id/receipt', route(async (req, res) => {
    const p = await db_1.prisma.payment.findUnique({ where: { id: idOf(req.params.id) }, select: { receiptImage: true, receiptMimeType: true } });
    if (!p?.receiptImage || !p.receiptMimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(p.receiptMimeType))
        return fail(404, 'Không tìm thấy biên lai.');
    res.set('Cache-Control', 'private, no-store').type(p.receiptMimeType).send(Buffer.from(p.receiptImage, 'base64'));
}));
exports.receiptRoutes.post('/:id/payment-proof', (req, res, next) => {
    if (!req.session?.userId)
        return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
    if (req.get('X-Atelier-Upload') !== '1')
        return (0, response_1.sendResponse)(res, 403, false, 'Yêu cầu không hợp lệ.');
    return next();
}, upload.single('receipt'), route(async (req, res) => {
    const userId = Number(req.session.userId);
    const orderId = idOf(req.params.id);
    if (!req.file)
        return fail(400, 'Cần tải ảnh biên lai.');
    const extension = imageExtension(req.file.buffer);
    const transferReference = text(req.body.transferReference, 100);
    if (!transferReference)
        return fail(400, 'Cần nhập mã tham chiếu.');
    const result = await db_1.prisma.payment.updateMany({
        where: { orderId, method: 'BANK_TRANSFER', status: { in: ['PENDING', 'FAILED', 'AWAITING_VERIFICATION'] },
            order: { userId, status: 'PENDING', user: { isActive: true } } },
        data: { status: 'AWAITING_VERIFICATION', transferReference, receiptImage: req.file.buffer.toString('base64'),
            receiptMimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`, receiptSizeBytes: req.file.size,
            receiptUploadedAt: new Date(), verifiedAt: null, verifiedById: null },
    });
    if (!result.count)
        return fail(404, 'Không tìm thấy giao dịch có thể gửi biên lai.');
    return ok(res, null);
}));
const activeUser = async (req) => {
    const id = Number(req.session?.userId);
    if (!id)
        return fail(401, 'Vui lòng đăng nhập.');
    const user = await db_1.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, fullName: true, phone: true, isActive: true } });
    if (!user?.isActive)
        return fail(403, 'Tài khoản không hoạt động.');
    return user;
};
exports.receiptRoutes.get('/', route(async (req, res) => {
    const user = await activeUser(req);
    return ok(res, await db_1.prisma.order.findMany({ ...list, where: { userId: user.id },
        select: { id: true, orderCode: true, status: true, totalAmount: true, createdAt: true, customOrder: { select: { title: true } },
            orderItems: { select: { productName: true, shape: true, length: true, quantity: true, price: true } },
            payments: { orderBy: newest, take: 1, select: { status: true, method: true } } } }));
}));
exports.customDesignRoutes.use((req, res, next) => {
    if (!req.session?.userId)
        return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
    if (req.method !== 'GET' && req.get('X-Atelier-Upload') !== '1')
        return (0, response_1.sendResponse)(res, 403, false, 'Yêu cầu không hợp lệ.');
    return next();
});
exports.customDesignRoutes.get('/my', route(async (req, res) => {
    const user = await activeUser(req);
    return ok(res, await db_1.prisma.customOrder.findMany({ ...list, where: { userId: user.id }, include: { images: customImageMeta } }));
}));
exports.customDesignRoutes.get('/images/:id', route(async (req, res) => {
    const user = await activeUser(req);
    const image = await db_1.prisma.customOrderImage.findFirst({ where: { id: idOf(req.params.id), customOrder: { userId: user.id } } });
    if (!image)
        return fail(404, 'Không tìm thấy ảnh.');
    return sendImage(res, image.imageUrl, image.mimeType);
}));
exports.customDesignRoutes.post('/', upload.array('images', 5), route(async (req, res) => {
    const user = await activeUser(req);
    let b;
    try {
        b = JSON.parse(req.body.design);
    }
    catch {
        return fail(400, 'Thiếu nội dung thiết kế.');
    }
    if (!b || typeof b !== 'object')
        return fail(400, 'Nội dung thiết kế không hợp lệ.');
    const title = text(b.title, 150);
    const phone = text(user.phone ?? '', 20);
    const files = (req.files || []);
    if (!title || !phone || !files.length)
        return fail(400, 'Cần tiêu đề, số điện thoại trong hồ sơ và từ 1 đến 5 ảnh tham khảo.');
    const [nailShape] = options([b.nailShape], Object.values(client_1.NailShape));
    const [nailLength] = options([b.nailLength], Object.values(client_1.NailLength));
    const budgetMax = number(b.budgetMax, 0, 999999999999);
    const design = await db_1.prisma.customOrder.create({ data: {
            userId: user.id, customerName: (user.fullName || user.email).slice(0, 100), phone, title, nailShape, nailLength,
            budgetMax, colorPattern: text(b.colorPattern ?? '', 2000), customNotes: text(b.customNotes ?? '', 5000),
            images: { create: files.map((f, sortOrder) => {
                    const ext = imageExtension(f.buffer);
                    return { sortOrder, imageUrl: f.buffer.toString('base64'), mimeType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, sizeBytes: f.size };
                }) },
        }, include: { images: customImageMeta } });
    return ok(res, design, 201);
}));
exports.customDesignRoutes.patch('/:id/respond', route(async (req, res) => {
    const id = idOf(req.params.id);
    const user = await activeUser(req);
    if (typeof req.body.accept !== 'boolean')
        return fail(400, 'Phản hồi không hợp lệ.');
    const order = await db_1.prisma.$transaction(async (tx) => {
        const design = await tx.customOrder.findFirst({ where: { id, userId: user.id } });
        if (!design)
            return fail(404, 'Không tìm thấy yêu cầu.');
        if (design.status === 'ACCEPTED' && req.body.accept)
            return tx.order.findUnique({ where: { customOrderId: id }, select: { id: true, orderCode: true } });
        if (design.status !== 'QUOTED' || !design.quotedPrice)
            return fail(409, 'Yêu cầu không còn báo giá để phản hồi.');
        if (!req.body.accept) {
            await tx.customOrder.update({ where: { id }, data: { status: 'DECLINED', respondedAt: new Date() } });
            return null;
        }
        const address = await tx.address.findFirst({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
        if (!address)
            return fail(400, 'Thêm địa chỉ nhận hàng trong tài khoản trước khi chấp nhận báo giá.');
        const total = design.quotedPrice;
        await tx.customOrder.update({ where: { id }, data: { status: 'ACCEPTED', agreedPrice: total, respondedAt: new Date() } });
        return tx.order.create({ data: { orderCode: `CD${(0, node_crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
                userId: user.id, customOrderId: id, idempotencyKey: `custom-${id}`, requestHash: `custom-${id}`,
                recipientName: address.recipientName, recipientPhone: address.phone, contactEmail: user.email,
                shippingAddress: [address.addressLine, address.ward, address.province].join(', '),
                subtotal: total, totalAmount: total, payments: { create: { method: 'BANK_TRANSFER', amount: total } },
                statusHistory: { create: { toStatus: 'PENDING' } },
            }, select: { id: true, orderCode: true } });
    }, { isolationLevel: 'Serializable' });
    return ok(res, order);
}));
const handleError = (err, _req, res, next) => {
    if (err instanceof multer_1.default.MulterError)
        return (0, response_1.sendResponse)(res, 400, false, 'Tối đa 5 ảnh, mỗi ảnh không quá 5 MB.');
    if (err instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025')
            return (0, response_1.sendResponse)(res, 404, false, 'Không tìm thấy dữ liệu.');
        if (['P2002', 'P2003', 'P2034'].includes(err.code))
            return (0, response_1.sendResponse)(res, 409, false, 'Dữ liệu bị trùng, đang được sử dụng hoặc vừa thay đổi.');
    }
    if (err instanceof Error && 'status' in err && typeof err.status === 'number' && err.status < 500)
        return (0, response_1.sendResponse)(res, err.status, false, err.message);
    return next(err);
};
exports.adminRoutes.use(handleError);
exports.receiptRoutes.use(handleError);
exports.customDesignRoutes.use(handleError);
