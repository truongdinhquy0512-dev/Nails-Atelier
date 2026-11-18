"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalErrorHandler = exports.notFoundHandler = void 0;
const response_1 = require("../utils/response");
const notFoundHandler = (req, res) => {
    (0, response_1.sendResponse)(res, 404, false, `Đường dẫn ${req.originalUrl} không tồn tại trên hệ thống.`);
};
exports.notFoundHandler = notFoundHandler;
const globalErrorHandler = (err, req, res, next) => {
    console.error('🔥 Global Error Log:', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Lỗi hệ thống nội bộ!';
    (0, response_1.sendResponse)(res, statusCode, false, message, null, process.env.NODE_ENV === 'development' ? err : null);
};
exports.globalErrorHandler = globalErrorHandler;
