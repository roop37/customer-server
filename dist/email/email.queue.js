"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customerEmailQueue = void 0;
const shared_1 = require("@hoizr-technology/shared");
const bullmq_1 = require("bullmq");
const redis_1 = require("../utils/redis");
exports.customerEmailQueue = new bullmq_1.Queue(shared_1.QueueNames.customerEmailQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
    },
});
