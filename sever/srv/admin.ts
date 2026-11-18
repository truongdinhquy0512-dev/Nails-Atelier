import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DiscountType, NailLength, NailShape, OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import express, { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { prisma } from './config/db';
import { sendResponse } from './utils/response';
import { deliverEmail, notify } from './email';

export const adminRoutes = Router();
export const receiptRoutes = Router();
export const customDesignRoutes = Router();
const directory = resolve(process.env.PRODUCT_UPLOAD_DIR || 'sever/uploads/products');
const prefix = '/api/media/products/';
export const productMedia = express.static(directory, { index: false, dotfiles: 'deny' });
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 5 * 1024 * 1024, fields: 1, fieldSize: 32768 } });
const imageOrder = { sortOrder: 'asc' } as const;
export const productInclude = { images: { orderBy: imageOrder }, collections: { orderBy: [{ sortOrder: 'asc' }, { collectionId: 'asc' }], include: { collection: true } } } satisfies Prisma.ProductInclude;
const ok = (res: Response, data: unknown, status = 200) => sendResponse(res, status, true, 'Thành công', data);
const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };
const route = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
const idOf = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= 2147483647 ? id : fail(400, 'ID không hợp lệ.');
};
adminRoutes.use((req, res, next) => { void (async () => {
  const userId = Number((req.session as typeof req.session & { userId?: number })?.userId);
  if (!Number.isInteger(userId) || userId <= 0) return fail(401, 'Vui lòng đăng nhập.');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (user?.role !== 'ADMIN' || !user.isActive) return fail(403, 'Yêu cầu quyền quản trị.');
  if (req.method !== 'GET' && req.get('X-Atelier-Admin') !== '1') return fail(403, 'Thiếu tiêu đề bảo vệ yêu cầu quản trị.');
  res.locals.adminId = userId;
  next();
})().catch(next); });

const slugOf = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const number = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= lo && v <= hi ? v : fail(400, 'Giá hoặc số lượng không hợp lệ.');
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length <= max ? v.trim() : fail(400, 'Nội dung không hợp lệ.');
const options = <T extends string>(v: unknown, allowed: T[]): T[] => {
  if (!Array.isArray(v) || !v.length || !v.every(x => allowed.includes(x))) return fail(400, 'Chọn dáng và độ dài hợp lệ.');
  return [...new Set<T>(v)];
};
const imageExtension = (b: Buffer) => {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpg';
  if (b.length >= 16 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return fail(400, 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
};
const removeFile = async (url: string) => {
  const name = url.slice(prefix.length);
  if (url.startsWith(prefix) && /^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(name))
    await unlink(resolve(directory, name)).catch(err => { if (err.code !== 'ENOENT') console.error('Product image cleanup failed', err.code); });
};

adminRoutes.get('/products', route(async (_req, res) => ok(res, await prisma.product.findMany({ include: productInclude, orderBy: { id: 'desc' } }))));
adminRoutes.get('/collections', route(async (_req, res) => ok(res, await prisma.collection.findMany({ orderBy: { name: 'asc' } }))));
adminRoutes.post('/collections', route(async (req, res) => {
  const name = text(req.body.name, 150);
  const slug = slugOf(name);
  if (!slug) return fail(400, 'Tên bộ sưu tập không hợp lệ.');
  return ok(res, await prisma.collection.create({ data: { name, slug } }), 201);
}));
const save = route(async (req, res) => {
  const id = req.params.id ? idOf(req.params.id) : undefined;
  let b;
  try { b = JSON.parse(req.body.product); } catch { return fail(400, 'Thiếu thông tin sản phẩm.'); }
  if (!b || typeof b !== 'object') return fail(400, 'Thông tin sản phẩm không hợp lệ.');
  const name = text(b.name, 255);
  if (name.length < 3 || !slugOf(name)) return fail(400, 'Tên sản phẩm cần ít nhất 3 ký tự.');
  const stock = number(b.stock, 0, 2147483647);
  if (!Object.values(ProductStatus).includes(b.status)) return fail(400, 'Trạng thái không hợp lệ.');
  const status: ProductStatus = b.status;
  const fields = { name, stock, status, price: number(b.price, 10000, 999999999999), description: text(b.description ?? '', 5000),
    isFeatured: b.isFeatured === true, shapeOptions: options(b.shapeOptions, Object.values(NailShape)), lengthOptions: options(b.lengthOptions, Object.values(NailLength)) };
  const collectionId = b.collectionId ? idOf(b.collectionId) : null;
  const files = (req.files || []) as Express.Multer.File[];
  const order: unknown[] = b.imageOrder;
  if (!Array.isArray(order) || order.length > 5 || new Set(order).size !== order.length ||
      order.filter(x => typeof x === 'string' && /^new:[0-4]$/.test(x)).length !== files.length ||
      (status === 'ACTIVE' && !order.length)) return fail(400, 'Sản phẩm đang bán cần từ 1 đến 5 ảnh.');
  const written: string[] = [];
  let result;
  try {
    if (files.length) await mkdir(directory, { recursive: true });
    for (const file of files) {
      const filename = `${randomUUID()}.${imageExtension(file.buffer)}`;
      written.push(prefix + filename);
      await writeFile(resolve(directory, filename), file.buffer, { flag: 'wx' });
    }
    result = await prisma.$transaction(async tx => {
      const old = id ? await tx.product.findUnique({ where: { id }, include: productInclude }) : null;
      if (id && !old) return fail(404, 'Không tìm thấy sản phẩm.');
      if (collectionId && !await tx.collection.findUnique({ where: { id: collectionId } })) return fail(400, 'Bộ sưu tập không tồn tại.');
      const images = order.map((key, sortOrder) => {
        const imageUrl = typeof key === 'number' ? old?.images.find(i => i.id === key)?.imageUrl :
          typeof key === 'string' && /^new:[0-4]$/.test(key) ? written[Number(key.slice(4))] : undefined;
        if (!imageUrl) return fail(400, 'Danh sách ảnh không hợp lệ.');
        return { imageUrl, sortOrder, isPrimary: sortOrder === 0 };
      });
      const collections = collectionId ? { create: { collectionId } } : {};
      if (old && old.collections[0]?.collectionId !== (collectionId ?? undefined)) {
        const previous = old.collections[0];
        if (previous) await tx.collectionProduct.delete({ where: { collectionId_productId: { collectionId: previous.collectionId, productId: old.id } } });
        if (collectionId) await tx.collectionProduct.upsert({
          where: { collectionId_productId: { collectionId, productId: old.id } },
          update: {}, create: { collectionId, productId: old.id },
        });
      }
      const data = old ? await tx.product.update({ where: { id: old.id }, data: { ...fields, images: { deleteMany: {}, create: images } }, include: productInclude }) :
        await tx.product.create({ data: { ...fields, slug: slugOf(name), colorPalette: [], images: { create: images }, collections }, include: productInclude });
      return { data, removed: old?.images.filter(i => !images.some(n => n.imageUrl === i.imageUrl)) ?? [] };
    }, { isolationLevel: 'Serializable' });
  } catch (err) {
    await Promise.all(written.map(removeFile));
    throw err;
  }
  await Promise.all(result.removed.map(i => removeFile(i.imageUrl)));
  return ok(res, result.data, id ? 200 : 201);
});
adminRoutes.post('/products', upload.array('images', 5), save);
adminRoutes.patch('/products/:id', upload.array('images', 5), save);
adminRoutes.delete('/products/:id', route(async (req, res) => {
  const id = idOf(req.params.id);
  const images = await prisma.$transaction(async tx => {
    if (await tx.orderItem.count({ where: { productId: id } })) return fail(409, 'Sản phẩm đã có trong đơn hàng; hãy chuyển sang Lưu trữ.');
    if (await tx.cartItem.count({ where: { productId: id } })) return fail(409, 'Sản phẩm đang có trong giỏ hàng; hãy chuyển sang Lưu trữ.');
    return (await tx.product.delete({ where: { id }, include: { images: true } })).images;
  }, { isolationLevel: 'Serializable' });
  await Promise.all(images.map(i => removeFile(i.imageUrl)));
  return ok(res, null);
}));

const newest = { id: 'desc' } as const;
const list = { take: 100, orderBy: newest };
const person = { select: { fullName: true, email: true } } as const;
adminRoutes.get('/dashboard', route(async (_req, res) => {
  const [orders, pending, revenue, receipts, custom] = await Promise.all([
    prisma.order.count(), prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.payment.count({ where: { status: 'AWAITING_VERIFICATION' } }),
    prisma.customOrder.count({ where: { status: { in: ['SUBMITTED', 'NEED_INFO'] } } }),
  ]);
  return ok(res, { orders, pending, revenue: Number(revenue._sum.amount ?? 0), receipts, custom });
}));
adminRoutes.get('/orders', route(async (_req, res) => ok(res, await prisma.order.findMany({ ...list, include: { user: person,
  payments: { orderBy: newest, take: 1, select: { method: true, status: true } } } }))));
adminRoutes.get('/payments', route(async (_req, res) => {
  const payments = await prisma.payment.findMany({ ...list, select: { id: true, amount: true, method: true, status: true, transferReference: true, receiptUploadedAt: true, order: { select: { orderCode: true } } } });
  return ok(res, payments.map(({ receiptUploadedAt, ...p }) => ({ ...p, hasReceipt: Boolean(receiptUploadedAt) })));
}));
adminRoutes.get('/custom-design-requests', route(async (_req, res) =>
  ok(res, await prisma.customOrder.findMany({ ...list, include: { images: customImageMeta } }))));
adminRoutes.get('/users', route(async (_req, res) => ok(res, await prisma.user.findMany({ ...list, select: { id: true, email: true, fullName: true, role: true, isActive: true, lockedReason: true } }))));
adminRoutes.get('/promotions', route(async (_req, res) => ok(res, await prisma.coupon.findMany(list))));
adminRoutes.get('/email-logs', route(async (_req, res) => ok(res, await prisma.emailLog.findMany(list))));
adminRoutes.post('/email-logs/:id/retry', route(async (req, res) => {
  const id = idOf(req.params.id);
  const row = await prisma.emailLog.findUnique({ where: { id } });
  if (!row || row.status !== 'FAILED') return fail(409, 'Chỉ gửi lại email đã lỗi.');
  await deliverEmail(id);
  return ok(res, await prisma.emailLog.findUnique({ where: { id } }));
}));
adminRoutes.patch('/users/:id', route(async (req, res) => {
  const id = idOf(req.params.id);
  const isActive = req.body.isActive;
  if (typeof isActive !== 'boolean') return fail(400, 'Trạng thái không hợp lệ.');
  const lockedReason = isActive ? null : text(req.body.reason, 1000);
  if (!isActive && !lockedReason) return fail(400, 'Cần lý do khóa.');
  const result = await prisma.user.updateMany({ where: { id, role: 'CUSTOMER' }, data: { isActive, lockedReason, lockedAt: isActive ? null : new Date() } });
  if (!result.count) return fail(404, 'Không tìm thấy khách hàng.');
  return ok(res, null);
}));
adminRoutes.post('/promotions', route(async (req, res) => {
  const code = text(req.body.code, 20).toUpperCase();
  const { discountType } = req.body;
  if (!/^[A-Z0-9]{4,20}$/.test(code) || !Object.values(DiscountType).includes(discountType)) return fail(400, 'Mã hoặc loại khuyến mãi không hợp lệ.');
  const discountValue = number(req.body.discountValue, 1, discountType === 'PERCENT' ? 100 : 999999999999);
  return ok(res, await prisma.coupon.create({ data: {
    code, discountType, discountValue,
    maxDiscount: discountType === 'PERCENT' ? number(req.body.maxDiscount, 1, 999999999999) : null,
    minOrderAmount: number(req.body.minOrderAmount ?? 0, 0, 999999999999),
    usageLimit: number(req.body.usageLimit, 1, 2147483647),
    startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000),
  } }), 201);
}));
adminRoutes.patch('/promotions/:id', route(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') return fail(400, 'Trạng thái không hợp lệ.');
  return ok(res, await prisma.coupon.update({ where: { id: idOf(req.params.id) }, data: { isActive: req.body.isActive } }));
}));
adminRoutes.patch('/custom-design-requests/:id', route(async (req, res) => {
  const id = idOf(req.params.id);
  const { status } = req.body;
  if (status !== 'QUOTED' && status !== 'NEED_INFO' && status !== 'REJECTED') return fail(400, 'Trạng thái không hợp lệ.');
  const note = text(req.body.note ?? '', 2000);
  if (status !== 'QUOTED' && !note) return fail(400, 'Cần nhập lý do hoặc nội dung yêu cầu.');
  const result = await prisma.customOrder.updateMany({ where: { id, status: { in: ['SUBMITTED', 'NEED_INFO'] } },
    data: status === 'QUOTED' ? { status, quotedPrice: number(req.body.quotedPrice, 10000, 999999999999), quotedAt: new Date(), quoteNote: note } :
      status === 'REJECTED' ? { status, rejectionReason: note } : { status, quoteNote: note },
  });
  if (!result.count) return fail(409, 'Yêu cầu không còn ở trạng thái có thể xử lý.');
  const design = await prisma.customOrder.findUnique({ where: { id }, select: { userId: true, user: { select: { email: true } } } });
  if (design) notify('CUSTOM_DESIGN_UPDATE', design.user.email, status === 'QUOTED' ? `Báo giá thiết kế #${id}` : `Cập nhật yêu cầu thiết kế #${id}`, { userId: design.userId, customOrderId: id });
  return ok(res, null);
}));
const customImageMeta = { select: { id: true }, orderBy: { sortOrder: 'asc' } } as const;
const sendImage = (res: Response, b64: string, mime: string) => {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return fail(404, 'Không tìm thấy ảnh.');
  return res.set('Cache-Control', 'private, no-store').type(mime).send(Buffer.from(b64, 'base64'));
};
adminRoutes.get('/custom-images/:id', route(async (req, res) => {
  const image = await prisma.customOrderImage.findUnique({ where: { id: idOf(req.params.id) } });
  if (!image) return fail(404, 'Không tìm thấy ảnh.');
  return sendImage(res, image.imageUrl, image.mimeType);
}));
const orderNext: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'SHIPPING', SHIPPING: 'COMPLETED' };
adminRoutes.patch('/orders/:id/status', route(async (req, res) => {
  const id = idOf(req.params.id);
  const order = await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: { payments: { take: 1, orderBy: newest } } });
    if (!order) return fail(404, 'Không tìm thấy đơn hàng.');
    const next = orderNext[order.status];
    if (!next || next !== req.body.status) return fail(409, 'Không thể chuyển trạng thái đơn.');
    const payment = order.payments[0];
    if (!payment || (payment.method !== 'COD' && payment.status !== 'PAID')) return fail(409, 'Đơn chưa được thanh toán.');
    await tx.order.update({ where: { id }, data: { status: next } });
    await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: next, changedById: res.locals.adminId } });
    if (order.customOrderId && (next === 'PROCESSING' || next === 'COMPLETED'))
      await tx.customOrder.update({ where: { id: order.customOrderId }, data: { status: next === 'PROCESSING' ? 'IN_PRODUCTION' : 'COMPLETED' } });
    if (next === 'COMPLETED' && payment.method === 'COD')
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', verifiedById: res.locals.adminId, verifiedAt: new Date() } });
    return order;
  }, { isolationLevel: 'Serializable' });
  notify('ORDER_STATUS_CHANGED', order.contactEmail, `Đơn ${order.orderCode} có trạng thái mới`, { userId: order.userId, orderId: id });
  return ok(res, null);
}));
adminRoutes.patch('/orders/:id/cancel', route(async (req, res) => {
  const id = idOf(req.params.id);
  const reason = text(req.body.reason, 2000);
  if (!reason) return fail(400, 'Cần nhập lý do hủy.');
  await prisma.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: { payments: true, orderItems: true, couponUsage: true } });
    if (!order) return fail(404, 'Không tìm thấy đơn hàng.');
    if (!['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status) ||
      order.payments.some(p => p.status === 'PAID' || (p.method === 'MOMO' && p.status === 'PENDING' && p.momoRequestId)))
      return fail(409, 'Chỉ hủy đơn chưa thanh toán và chưa giao; đơn đã thanh toán cần xử lý hoàn tiền riêng.');
    if (order.customOrderId) return fail(409, 'Đơn thiết kế riêng cần được xử lý riêng.');
    await tx.order.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date() } });
    await tx.orderStatusHistory.create({ data: { orderId: id, fromStatus: order.status, toStatus: 'CANCELLED', changedById: res.locals.adminId, note: reason } });
    await tx.payment.updateMany({ where: { orderId: id }, data: { status: 'CANCELLED' } });
    for (const item of order.orderItems) {
      if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
    if (order.couponUsage) {
      await tx.couponUsage.delete({ where: { orderId: id } });
      await tx.coupon.updateMany({ where: { id: order.couponUsage.couponId, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }
  }, { isolationLevel: 'Serializable' });
  return ok(res, null);
}));
adminRoutes.patch('/payments/:id/verify', route(async (req, res) => {
  const id = idOf(req.params.id);
  const { approve } = req.body;
  if (typeof approve !== 'boolean') return fail(400, 'Kết quả đối soát không hợp lệ.');
  const result = await prisma.payment.updateMany({ where: { id, method: 'BANK_TRANSFER',
    status: 'AWAITING_VERIFICATION', receiptImage: { not: null }, order: { status: 'PENDING' } },
    data: { status: approve ? 'PAID' : 'FAILED', verifiedAt: new Date(), verifiedById: res.locals.adminId } });
  if (!result.count) return fail(409, 'Giao dịch không có biên lai hợp lệ đang chờ đối soát.');
  const p = await prisma.payment.findUnique({ where: { id }, select: { order: { select: { id: true, contactEmail: true, orderCode: true, userId: true } } } });
  if (p) notify('PAYMENT_RESULT', p.order.contactEmail, `Biên lai đơn ${p.order.orderCode}: ${approve ? 'đã xác nhận' : 'cần gửi lại'}`, { userId: p.order.userId, orderId: p.order.id });
  return ok(res, null);
}));
adminRoutes.get('/payments/:id/receipt', route(async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: idOf(req.params.id) }, select: { receiptImage: true, receiptMimeType: true } });
  if (!p?.receiptImage || !p.receiptMimeType || !['image/jpeg', 'image/png', 'image/webp'].includes(p.receiptMimeType))
    return fail(404, 'Không tìm thấy biên lai.');
  res.set('Cache-Control', 'private, no-store').type(p.receiptMimeType).send(Buffer.from(p.receiptImage, 'base64'));
}));
receiptRoutes.post('/:id/payment-proof', (req, res, next) => {
  if (!(req.session as typeof req.session & { userId?: number })?.userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');
  if (req.get('X-Atelier-Upload') !== '1') return sendResponse(res, 403, false, 'Yêu cầu không hợp lệ.');
  return next();
}, upload.single('receipt'), route(async (req, res) => {
  const userId = Number((req.session as typeof req.session & { userId?: number }).userId);
  const orderId = idOf(req.params.id);
  if (!req.file) return fail(400, 'Cần tải ảnh biên lai.');
  const extension = imageExtension(req.file.buffer);
  const transferReference = text(req.body.transferReference, 100);
  if (!transferReference) return fail(400, 'Cần nhập mã tham chiếu.');
  const result = await prisma.payment.updateMany({
    where: { orderId, method: 'BANK_TRANSFER', status: { in: ['PENDING', 'FAILED', 'AWAITING_VERIFICATION'] },
      order: { userId, status: 'PENDING', user: { isActive: true } } },
    data: { status: 'AWAITING_VERIFICATION', transferReference, receiptImage: req.file.buffer.toString('base64'),
      receiptMimeType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`, receiptSizeBytes: req.file.size,
      receiptUploadedAt: new Date(), verifiedAt: null, verifiedById: null },
  });
  if (!result.count) return fail(404, 'Không tìm thấy giao dịch có thể gửi biên lai.');
  return ok(res, null);
}));
const activeUser = async (req: Request) => {
  const id = Number((req.session as typeof req.session & { userId?: number })?.userId);
  if (!id) return fail(401, 'Vui lòng đăng nhập.');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, fullName: true, phone: true, isActive: true } });
  if (!user?.isActive) return fail(403, 'Tài khoản không hoạt động.');
  return user;
};
receiptRoutes.get('/', route(async (req, res) => {
  const user = await activeUser(req);
  return ok(res, await prisma.order.findMany({ ...list, where: { userId: user.id },
    select: { id: true, orderCode: true, status: true, totalAmount: true, createdAt: true, customOrder: { select: { title: true } },
      orderItems: { select: { productName: true, shape: true, length: true, quantity: true, price: true } },
      payments: { orderBy: newest, take: 1, select: { status: true, method: true } } } }));
}));
customDesignRoutes.use((req, res, next) => {
  if (!(req.session as typeof req.session & { userId?: number })?.userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');
  if (req.method !== 'GET' && req.get('X-Atelier-Upload') !== '1') return sendResponse(res, 403, false, 'Yêu cầu không hợp lệ.');
  return next();
});
customDesignRoutes.get('/my', route(async (req, res) => {
  const user = await activeUser(req);
  return ok(res, await prisma.customOrder.findMany({ ...list, where: { userId: user.id }, include: { images: customImageMeta } }));
}));
customDesignRoutes.get('/images/:id', route(async (req, res) => {
  const user = await activeUser(req);
  const image = await prisma.customOrderImage.findFirst({ where: { id: idOf(req.params.id), customOrder: { userId: user.id } } });
  if (!image) return fail(404, 'Không tìm thấy ảnh.');
  return sendImage(res, image.imageUrl, image.mimeType);
}));
customDesignRoutes.post('/', upload.array('images', 5), route(async (req, res) => {
  const user = await activeUser(req);
  let b;
  try { b = JSON.parse(req.body.design); } catch { return fail(400, 'Thiếu nội dung thiết kế.'); }
  if (!b || typeof b !== 'object') return fail(400, 'Nội dung thiết kế không hợp lệ.');
  const title = text(b.title, 150);
  const phone = text(user.phone ?? '', 20);
  const files = (req.files || []) as Express.Multer.File[];
  if (!title || !phone || !files.length) return fail(400, 'Cần tiêu đề, số điện thoại trong hồ sơ và từ 1 đến 5 ảnh tham khảo.');
  const [nailShape] = options([b.nailShape], Object.values(NailShape));
  const [nailLength] = options([b.nailLength], Object.values(NailLength));
  const budgetMax = number(b.budgetMax, 0, 999999999999);
  const design = await prisma.customOrder.create({ data: {
    userId: user.id, customerName: (user.fullName || user.email).slice(0, 100), phone, title, nailShape, nailLength,
    budgetMax, colorPattern: text(b.colorPattern ?? '', 2000), customNotes: text(b.customNotes ?? '', 5000),
    images: { create: files.map((f, sortOrder) => {
      const ext = imageExtension(f.buffer);
      return { sortOrder, imageUrl: f.buffer.toString('base64'), mimeType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, sizeBytes: f.size };
    }) },
  }, include: { images: customImageMeta } });
  return ok(res, design, 201);
}));
customDesignRoutes.patch('/:id/respond', route(async (req, res) => {
  const id = idOf(req.params.id);
  const user = await activeUser(req);
  if (typeof req.body.accept !== 'boolean') return fail(400, 'Phản hồi không hợp lệ.');
  const order = await prisma.$transaction(async tx => {
    const design = await tx.customOrder.findFirst({ where: { id, userId: user.id } });
    if (!design) return fail(404, 'Không tìm thấy yêu cầu.');
    if (design.status === 'ACCEPTED' && req.body.accept)
      return tx.order.findUnique({ where: { customOrderId: id }, select: { id: true, orderCode: true } });
    if (design.status !== 'QUOTED' || !design.quotedPrice) return fail(409, 'Yêu cầu không còn báo giá để phản hồi.');
    if (!req.body.accept) {
      await tx.customOrder.update({ where: { id }, data: { status: 'DECLINED', respondedAt: new Date() } });
      return null;
    }
    const address = await tx.address.findFirst({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
    if (!address) return fail(400, 'Thêm địa chỉ nhận hàng trong tài khoản trước khi chấp nhận báo giá.');
    const total = design.quotedPrice;
    await tx.customOrder.update({ where: { id }, data: { status: 'ACCEPTED', agreedPrice: total, respondedAt: new Date() } });
    return tx.order.create({ data: { orderCode: `CD${randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()}`,
      userId: user.id, customOrderId: id, idempotencyKey: `custom-${id}`, requestHash: `custom-${id}`,
      recipientName: address.recipientName, recipientPhone: address.phone, contactEmail: user.email,
      shippingAddress: [address.addressLine, address.ward, address.province].join(', '),
      subtotal: total, totalAmount: total, payments: { create: { method: 'BANK_TRANSFER', amount: total } },
      statusHistory: { create: { toStatus: 'PENDING' } },
    }, select: { id: true, orderCode: true } });
  }, { isolationLevel: 'Serializable' });
  return ok(res, order);
}));

const handleError = (err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) return sendResponse(res, 400, false, 'Tối đa 5 ảnh, mỗi ảnh không quá 5 MB.');
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return sendResponse(res, 404, false, 'Không tìm thấy dữ liệu.');
    if (['P2002', 'P2003', 'P2034'].includes(err.code)) return sendResponse(res, 409, false, 'Dữ liệu bị trùng, đang được sử dụng hoặc vừa thay đổi.');
  }
  if (err instanceof Error && 'status' in err && typeof err.status === 'number' && err.status < 500)
    return sendResponse(res, err.status, false, err.message);
  return next(err);
};
adminRoutes.use(handleError);
receiptRoutes.use(handleError);
customDesignRoutes.use(handleError);
