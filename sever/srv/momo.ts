import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction, Router } from 'express';
import { prisma } from './config/db';
import { sendResponse } from './utils/response';
import { notify } from './email';

const gateway = 'https://test-payment.momo.vn';
const config = () => {
  const { MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY, MOMO_IPN_URL, MOMO_REDIRECT_URL } = process.env;
  if (!MOMO_PARTNER_CODE || !MOMO_ACCESS_KEY || !MOMO_SECRET_KEY || !MOMO_IPN_URL || !MOMO_REDIRECT_URL) return null;
  try {
    if (new URL(MOMO_IPN_URL).protocol !== 'https:' || !['https:', 'http:'].includes(new URL(MOMO_REDIRECT_URL).protocol)) return null;
  } catch { return null; }
  return { partnerCode: MOMO_PARTNER_CODE, accessKey: MOMO_ACCESS_KEY, secret: MOMO_SECRET_KEY, ipnUrl: MOMO_IPN_URL, redirectUrl: MOMO_REDIRECT_URL };
};
export const momoEnabled = () => Boolean(config());
const digest = (key: string, payload: Record<string, unknown>, fields: string[]) =>
  createHmac('sha256', key).update(fields.map(k => `${k}=${payload[k]}`).join('&')).digest();
const creationFields = ['accessKey', 'amount', 'extraData', 'ipnUrl', 'orderId', 'orderInfo', 'partnerCode', 'redirectUrl', 'requestId', 'requestType'];
const callbackFields = ['accessKey', 'amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType', 'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId'];
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req, res).catch(next);
};
export const momoRoutes = Router();
momoRoutes.get('/configuration', (_req, res) => sendResponse(res, 200, true, 'Cấu hình thanh toán', { enabled: momoEnabled() }));
momoRoutes.post('/create', run(async (req, res) => {
  const conf = config();
  if (!conf) return sendResponse(res, 503, false, 'MoMo Sandbox chưa được cấu hình.');
  const userId = Number((req.session as typeof req.session & { userId?: number })?.userId);
  if (!userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');
  if (req.get('X-Atelier-Upload') !== '1') return sendResponse(res, 403, false, 'Yêu cầu không hợp lệ.');
  const orderId = req.body?.orderId;
  if (!Number.isInteger(orderId) || orderId <= 0 || orderId > 2147483647) return sendResponse(res, 400, false, 'Mã đơn không hợp lệ.');
  const where = { orderId, method: 'MOMO', status: 'PENDING', order: { userId, status: 'PENDING', user: { isActive: true } } } as const;
  const payment = await prisma.payment.findFirst({ where, select: {
    id: true, amount: true, momoOrderId: true, momoRequestId: true, payUrl: true, order: { select: { orderCode: true } },
  } });
  if (!payment) return sendResponse(res, 404, false, 'Không tìm thấy giao dịch MoMo đang chờ thanh toán.');
  if (payment.payUrl) return sendResponse(res, 200, true, 'MoMo Sandbox', { payUrl: payment.payUrl });
  if (payment.momoRequestId) return sendResponse(res, 409, false, 'Giao dịch đang chờ MoMo phản hồi.');
  const reservedOrder = `NA-${randomUUID()}`;
  const reservedRequest = randomUUID();
  const claim = await prisma.payment.updateMany({ where: { ...where, id: payment.id, momoRequestId: null },
    data: { momoRequestId: reservedRequest, momoOrderId: reservedOrder } });
  if (!claim.count) return sendResponse(res, 409, false, 'Giao dịch vừa thay đổi.');
  const { partnerCode, accessKey, secret, ipnUrl, redirectUrl } = conf;
  const body = { partnerCode, requestId: reservedRequest, orderId: reservedOrder, amount: Number(payment.amount),
    orderInfo: `Nail Atelier ${payment.order.orderCode}`, redirectUrl, ipnUrl, extraData: '', requestType: 'captureWallet', lang: 'vi', autoCapture: true };
  let payUrl: string | undefined;
  try {
    const response = await fetch(`${gateway}/v2/gateway/api/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ ...body, signature: digest(secret, { ...body, accessKey }, creationFields).toString('hex') }),
    });
    const result = await response.json();
    if (response.ok && result.resultCode === 0 && typeof result.payUrl === 'string' &&
      new URL(result.payUrl).origin === gateway) payUrl = result.payUrl;
  } catch {
    // Leave the attempt pending if MoMo may have accepted it before the network failed.
  }
  if (!payUrl) return sendResponse(res, 502, false, 'MoMo chưa trả URL thanh toán. Kiểm tra cấu hình Sandbox hoặc kết quả đối soát trước khi tạo giao dịch khác.');
  await prisma.payment.updateMany({ where: { id: payment.id, momoRequestId: reservedRequest, status: 'PENDING' }, data: { payUrl } });
  return sendResponse(res, 200, true, 'MoMo Sandbox', { payUrl });
}));
momoRoutes.post('/ipn', run(async (req, res) => {
  const conf = config();
  if (!conf) return res.sendStatus(503);
  const p = req.body;
  if (!p || p.partnerCode !== conf.partnerCode || typeof p.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(p.signature) ||
      !callbackFields.filter(f => f !== 'accessKey').every(f => typeof p[f] === 'string' || Number.isSafeInteger(p[f])) ||
      !Number.isSafeInteger(p.amount) || !Number.isSafeInteger(p.resultCode) ||
      typeof p.orderId !== 'string' || typeof p.requestId !== 'string' ||
      p.orderId.length > 64 || p.requestId.length > 64 || (p.resultCode === 0 && !/^\d{1,24}$/.test(String(p.transId)))) return res.sendStatus(400);
  if (!timingSafeEqual(digest(conf.secret, { ...p, accessKey: conf.accessKey }, callbackFields), Buffer.from(p.signature, 'hex'))) return res.sendStatus(401);
  const payment = await prisma.payment.findFirst({ where: { momoOrderId: p.orderId, momoRequestId: p.requestId, method: 'MOMO' },
    select: { id: true, amount: true, order: { select: { id: true, userId: true, contactEmail: true, orderCode: true } } } });
  if (!payment || !payment.amount.equals(p.amount)) return res.sendStatus(400);
  if ([1000, 7000, 7002, 8000, 9000].includes(p.resultCode)) return res.sendStatus(204);
  const status = p.resultCode === 0 ? 'PAID' : 'FAILED';
  const result = await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING', order: { status: 'PENDING' } },
    data: { status, momoResultCode: p.resultCode, momoTransId: status === 'PAID' ? String(p.transId) : null } });
  if (result.count) notify('PAYMENT_RESULT', payment.order.contactEmail, `MoMo đơn ${payment.order.orderCode}: ${status === 'PAID' ? 'đã thanh toán' : 'không thành công'}`, { userId: payment.order.userId, orderId: payment.order.id });
  return res.sendStatus(204);
}));
