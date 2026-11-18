"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customOrder_controller_1 = require("../controllers/customOrder.controller");
const router = (0, express_1.Router)();
router.post('/', customOrder_controller_1.createCustomOrder);
exports.default = router;
