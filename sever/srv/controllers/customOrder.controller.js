"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCustomOrder = void 0;
const db_1 = require("../config/db");
const response_1 = require("../utils/response");
const client_1 = require("@prisma/client");
const createCustomOrder = async (req, res, next) => {
    try {
        const { customerName, phone, title, nailSize, nailShape, nailLength, customNotes } = req.body;
        const userId = Number(req.session.userId);
        if (!userId)
            return (0, response_1.sendResponse)(res, 401, false, 'Vui lòng đăng nhập.');
        if (typeof title !== 'string' || !title.trim() || title.length > 150 ||
            typeof customerName !== 'string' || !customerName.trim() || customerName.length > 100 ||
            typeof phone !== 'string' || !phone.trim() || phone.length > 20 ||
            !Object.values(client_1.NailShape).includes(nailShape) || !Object.values(client_1.NailLength).includes(nailLength) ||
            (nailSize != null && !Object.values(client_1.NailSize).includes(nailSize)))
            return (0, response_1.sendResponse)(res, 400, false, 'Thông tin thiết kế không hợp lệ.');
        const customOrder = await db_1.prisma.customOrder.create({
            data: {
                customerName,
                phone,
                nailSize: nailSize,
                nailShape: nailShape,
                customNotes,
                title,
                nailLength,
                userId,
            },
        });
        (0, response_1.sendResponse)(res, 201, true, 'Gửi yêu cầu thiết kế móng thành công', customOrder);
    }
    catch (error) {
        next(error);
    }
};
exports.createCustomOrder = createCustomOrder;
