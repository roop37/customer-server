"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = void 0;
const environment_1 = require("./environment");
exports.isProduction = environment_1.EnvVars.values.SERVER_ENV === "production";
