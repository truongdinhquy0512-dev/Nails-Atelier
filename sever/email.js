"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverEmail = deliverEmail;
exports.notify = notify;
const nodemailer_1 = __importDefault(require("nodemailer"));
const db_1 = require("../src/config/db");
function transport() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_FROM)
        return null;
    const port = Number(SMTP_PORT || 587);
    return { from: SMTP_FROM, client: nodemailer_1.default.createTransport({
            host: SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
            auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
            connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        }) };
}
async function deliverEmail(id) {
    const row = await db_1.prisma.emailLog.findUnique({ where: { id } });
    if (!row || row.status === 'SENT')
        return;
    const attempt = await db_1.prisma.emailLog.updateMany({ where: { id, attempts: row.attempts, OR: [{ status: 'FAILED' }, { status: 'PENDING', attempts: 0 }] },
        data: { status: 'PENDING', attempts: { increment: 1 }, lastError: null } });
    if (!attempt.count)
        return;
    let delivered = false;
    let lastError = null;
    try {
        const smtp = transport();
        if (!smtp)
            lastError = 'SMTP chưa được cấu hình.';
        else {
            await smtp.client.sendMail({ from: smtp.from, to: row.toEmail, subject: row.subject,
                text: `${row.subject}\n\nBạn có thể đăng nhập Nail Atelier để xem chi tiết.` });
            delivered = true;
        }
    }
    catch {
        lastError = 'Máy chủ SMTP chưa gửi được thư.';
    }
    await db_1.prisma.emailLog.update({ where: { id }, data: { status: delivered ? 'SENT' : 'FAILED', sentAt: delivered ? new Date() : null, lastError } });
}
function notify(type, toEmail, subject, refs = {}) {
    void db_1.prisma.emailLog.create({ data: { type, toEmail, subject, ...refs } })
        .then(record => deliverEmail(record.id)).catch(() => console.error('Không ghi được nhật ký thông báo email.'));
}
