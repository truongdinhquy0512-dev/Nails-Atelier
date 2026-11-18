"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const router = (0, express_1.Router)();
router.post('/quote', order_controller_1.getCheckoutQuote);
router.post('/', order_controller_1.createOrder);
exports.default = router;
