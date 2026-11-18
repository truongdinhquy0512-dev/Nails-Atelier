"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = exports.prisma = void 0;
const client_1 = require("@prisma/client");
exports.prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
const connectDB = async () => {
    try {
        await exports.prisma.$connect();
        console.log('✅ Đã kết nối thành công với PostgreSQL 18!');
    }
    catch (error) {
        console.error('❌ Kết nối Database thất bại:', error);
        process.exit(1);
    }
};
exports.connectDB = connectDB;
