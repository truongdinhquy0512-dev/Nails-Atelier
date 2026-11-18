import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { sendResponse } from '../utils/response';
import { NailSize, NailShape, NailLength } from '@prisma/client';

export const createCustomOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerName, phone, title, nailSize, nailShape, nailLength, customNotes } = req.body;
    const userId = Number((req.session as typeof req.session & { userId?: number }).userId);
    if (!userId) return sendResponse(res, 401, false, 'Vui lòng đăng nhập.');
    if (typeof title !== 'string' || !title.trim() || title.length > 150 ||
        typeof customerName !== 'string' || !customerName.trim() || customerName.length > 100 ||
        typeof phone !== 'string' || !phone.trim() || phone.length > 20 ||
        !Object.values(NailShape).includes(nailShape) || !Object.values(NailLength).includes(nailLength) ||
        (nailSize != null && !Object.values(NailSize).includes(nailSize)))
      return sendResponse(res, 400, false, 'Thông tin thiết kế không hợp lệ.');

    const customOrder = await prisma.customOrder.create({
      data: {
        customerName,
        phone,
        nailSize: nailSize as NailSize,
        nailShape: nailShape as NailShape,
        customNotes,
        title,
        nailLength,
        userId,
      },
    });

    sendResponse(res, 201, true, 'Gửi yêu cầu thiết kế móng thành công', customOrder);
  } catch (error) {
    next(error);
  }
};
