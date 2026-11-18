"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.momoRoutes = exports.momoEnabled = void 0;
const node_crypto_1 = require("node:crypto");
const express_1 = require("express");
const db_1 = require("../src/config/db");
const response_1 = require("../src/utils/response");
const email_1 = require("./email");
const gateway = 'https://test-payment.momo.vn';
const config = () => {
    const { MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_IPN_URL, MOMO_REDIRECT_URL } = process.env;
    if (!MOMO_PARTNER_CODE || !MOMO_ACCESS_KEY || !MOMO_SECRET_KEY || !MOMO_IPN_URL || !MOMO_REDIRECT_URL)
        return null;
    try {
        if (new URL(MOMO_IPN_URL).protocol !== 'https:' || !['https:', 'http:'].includes(new URL(MOMO_REDIRECT_URL).protocol))
            return null;
    }
    catch {
        return null;
    }
    return { partnerCode: MOMO_PARTNER_CODE, accessKey: MOMO_ACCESS_KEY, secret: MOMO_SECRET_KEY, ipnUrl: MOMO_IPN_URL, redirectUrl: MOMO_REDIRECT_URL };
};
const momoEnabled = () => Boolean(config());
exports.momoEnabled = momoEnabled;
const digest = (key, payload, fields) => (0, node_crypto_1.createHmac)('sha256', key).update(fields.map(k => `${k}=${payload[k]}`).join('&')).digest();
const creationFields = ['accessKey', 'amount', 'extraData', 'ipnUrl', 'orderId', 'orderInfo', 'partnerCode', 'redirectUrl', 'requestId', 'requestType'];
const callbackFields = ['accessKey', 'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];
const run = (handler) => (req, res, next) => {
    void handler(req, res).catch(next);
};
exports.momoRoutes = (0, express_1.Router)();
exports.momoRoutes.get('/configuration', (_req, res) => (0, response_1.sendResponse)(res, 200, true, 'Cấu hình thanh toán', { enabled: (0, exports.momoEnabled)() }));
exports.momoRoutes.post('/create', run(async (req, res) => {
    const conf = config();
    if (!conf)
        return (0, response_1.sendResponse)(res, 503, false, 'MoMo Sandbox chưa được cấu hình.');
    const userId = Number(req.session?.userId);
    if (!userId)
        return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
    if (req.get('X-Atelier-Upload') !== '1')
        return (0, response_1.sendResponse)(res, 403, false, 'Yêu cầu không hợp lệ.');
    const orderId = req.body?.orderId;
    if (!Number.isInteger(orderId) || orderId <= 0 || orderId > 2147483647)
        return (0, response_1.sendResponse)(res, 400, false, 'Mã đơn không hợp lệ.');
    const where = { orderId, method: 'MOMO', status: 'PENDING', order: { userId, status: 'PENDING', user: { isActive: true } } };
    const payment = await db_1.prisma.payment.findFirst({ where, select: {
            id: true, amount: true, momoOrderId: true, momoRequestId: true, payUrl: true, order: { select: { orderCode: true } },
        } });
    if (!payment)
        return (0, response_1.sendResponse)(res, 404, false, 'Không tìm thấy giao dịch MoMo đang chờ thanh toán.');
    if (payment.payUrl)
        return (0, response_1.sendResponse)(res, 200, true, 'MoMo Sandbox', { payUrl: payment.payUrl });
    if (payment.momoRequestId)
        return (0, response_1.sendResponse)(res, 409, false, 'Giao dịch đang chờ MoMo phản hồi.');
    const reservedOrder = `NA-${(0, node_crypto_1.randomUUID)()}`;
    const reservedRequest = (0, node_crypto_1.randomUUID)();
    const claim = await db_1.prisma.payment.updateMany({ where: { ...where, id: payment.id, momoRequestId: null },
        data: { momoRequestId: reservedRequest, momoOrderId: reservedOrder } });
    if (!claim.count)
        return (0, response_1.sendResponse)(res, 409, false, 'Giao dịch vừa thay đổi.');
    const { partnerCode, accessKey, secret, ipnUrl, redirectUrl } = conf;
    const body = { partnerCode, requestId: reservedRequest, orderId: reservedOrder, amount: Number(payment.amount),
        orderInfo: `Nail Atelier ${payment.order.orderCode}`, redirectUrl, ipnUrl, extraData: '', requestType: 'captureWallet', lang: 'vi', autoCapture: true };
    let payUrl;
    try {
        const response = await fetch(`${gateway}/v2/gateway/api/create`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
            body: JSON.stringify({ ...body, signature: digest(secret, { ...body, accessKey }, creationFields).toString('hex') }),
        });
        const result = await response.json();
        if (response.ok && result.resultCode === 0 && typeof result.payUrl === 'string' &&
            new URL(result.payUrl).origin === gateway)
            payUrl = result.payUrl;
    }
    catch {
        // Leave the attempt pending if MoMo may have accepted it before the network failed.
    }
    if (!payUrl)
        return (0, response_1.sendResponse)(res, 502, false, 'MoMo chưa trả URL thanh toán. Kiểm tra cấu hình Sandbox hoặc kết quả đối soát trước khi tạo giao dịch khác.');
    await db_1.prisma.payment.updateMany({ where: { id: payment.id, momoRequestId: reservedRequest, status: 'PENDING' }, data: { payUrl } });
    return (0, response_1.sendResponse)(res, 200, true, 'MoMo Sandbox', { payUrl });
}));
exports.momoRoutes.post('/ipn', run(async (req, res) => {
    const conf = config();
    if (!conf)
        return res.sendStatus(503);
    const p = req.body;
    if (!p || p.partnerCode !== conf.partnerCode || typeof p.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(p.signature) ||
        !callbackFields.filter(f => f !== 'accessKey').every(f => typeof p[f] === 'string' || Number.isSafeInteger(p[f])) ||
        !Number.isSafeInteger(p.amount) || !Number.isSafeInteger(p.resultCode) ||
        typeof p.orderId !== 'string' || typeof p.requestId !== 'string' ||
        p.orderId.length > 64 || p.requestId.length > 64 || (p.resultCode === 0 && !/^\d{1,24}$/.test(String(p.transId))))
        return res.sendStatus(400);
    if (!(0, node_crypto_1.timingSafeEqual)(digest(conf.secret, { ...p, accessKey: conf.accessKey }, callbackFields), Buffer.from(p.signature, 'hex')))
        return res.sendStatus(401);
    const payment = await db_1.prisma.payment.findFirst({ where: { momoOrderId: p.orderId, momoRequestId: p.requestId, method: 'MOMO' },
        select: { id: true, amount: true, order: { select: { id: true, userId: true, contactEmail: true, orderCode: true } } } });
    if (!payment || !payment.amount.equals(p.amount))
        return res.sendStatus(400);
    if ([1000, 7000, 7002, 8000, 9000].includes(p.resultCode))
        return res.sendStatus(204);
    const status = p.resultCode === 0 ? 'PAID' : 'FAILED';
    const result = await db_1.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING', order: { status: 'PENDING' } },
        data: { status, momoResultCode: p.resultCode, momoTransId: status === 'PAID' ? String(p.transId) : null } });
    if (result.count)
        (0, email_1.notify)('PAYMENT_RESULT', payment.order.contactEmail, `MoMo đơn ${payment.order.orderCode}: ${status === 'PAID' ? 'đã thanh toán' : 'không thành công'}`, { userId: payment.order.userId, orderId: payment.order.id });
    return res.sendStatus(204);
}));
