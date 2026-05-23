"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidEmail = exports.isValidPhone = exports.isAlphanumeric = void 0;
const isAlphanumeric = (value) => {
    return /^[a-zA-Z0-9]+$/.test(value);
};
exports.isAlphanumeric = isAlphanumeric;
const isValidPhone = (phone) => {
    return /^\+?[1-9]\d{7,14}$/.test(phone);
};
exports.isValidPhone = isValidPhone;
const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
exports.isValidEmail = isValidEmail;
