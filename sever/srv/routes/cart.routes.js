"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cart_controller_1 = require("../controllers/cart.controller");
const router = (0, express_1.Router)();
router.get('/:userId', cart_controller_1.getCart);
router.post('/items', cart_controller_1.addToCart);
exports.default = router;
