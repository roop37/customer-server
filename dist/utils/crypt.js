"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptData = exports.encryptData = void 0;
const crypto_1 = __importDefault(require("crypto"));
const environment_1 = require("./environment");
const algorithm = "aes-256-gcm";
const encryptData = (value) => {
    const key = environment_1.EnvVars.values.ENCRYPTION_KEY ?? "";
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}$$${authTag}$$${encrypted}`;
};
exports.encryptData = encryptData;
const decryptData = (encryptedValue, useFrontendKey = false) => {
    const key = useFrontendKey
        ? environment_1.EnvVars.values.CLIENT_ENCRYPTION_KEY
        : environment_1.EnvVars.values.ENCRYPTION_KEY;
    const [ivHex, authTagHex, encryptedText] = encryptedValue.split("$$");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto_1.default.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
};
exports.decryptData = decryptData;
