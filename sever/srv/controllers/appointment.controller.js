"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAppointmentStatus = exports.createAppointment = void 0;
const db_1 = require("../config/db");
const response_1 = require("../utils/response");
const createAppointment = async (req, res, next) => {
    try {
        const { customerName, phone, serviceName, appointmentDate, notes, userId } = req.body;
        const appointment = await db_1.prisma.appointment.create({
            data: {
                customerName,
                phone,
                serviceName,
                appointmentDate: new Date(appointmentDate),
                notes,
                userId: userId ? Number(userId) : null,
            },
        });
        (0, response_1.sendResponse)(res, 201, true, 'Đặt lịch hẹn thành công!', appointment);
    }
    catch (error) {
        next(error);
    }
};
exports.createAppointment = createAppointment;
const updateAppointmentStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updated = await db_1.prisma.appointment.update({
            where: { id: Number(id) },
            data: { status: status },
        });
        (0, response_1.sendResponse)(res, 200, true, 'Cập nhật trạng thái lịch hẹn thành công', updated);
    }
    catch (error) {
        next(error);
    }
};
exports.updateAppointmentStatus = updateAppointmentStatus;
