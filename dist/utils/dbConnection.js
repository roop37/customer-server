"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToMongoDb = void 0;
const typegoose_1 = require("@typegoose/typegoose");
const logger_1 = require("../log/logger");
const environment_1 = require("./environment");
const connectToMongoDb = async () => {
    try {
        await typegoose_1.mongoose.connect(environment_1.EnvVars.values.DB_URI, {
            maxPoolSize: 10,
            dbName: environment_1.EnvVars.values.DB_NAME,
        });
        logger_1.logger.info("DB Connected!");
    }
    catch (error) {
        logger_1.logger.error(error);
        process.exit(1);
    }
};
exports.connectToMongoDb = connectToMongoDb;
