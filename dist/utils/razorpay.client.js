"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRazorpay = void 0;
const razorpay_1 = __importDefault(require("razorpay"));
const environment_1 = require("./environment");
let razorpayInstance = null;
const getRazorpay = () => {
    if (!razorpayInstance) {
        razorpayInstance = new razorpay_1.default({
            key_id: environment_1.EnvVars.values.RAZORPAY_KEY_ID,
            key_secret: environment_1.EnvVars.values.RAZORPAY_KEY_SECRET,
        });
    }
    return razorpayInstance;
};
exports.getRazorpay = getRazorpay;
