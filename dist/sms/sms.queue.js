"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsQueue = void 0;
const shared_1 = require("@hoizr-technology/shared");
const bullmq_1 = require("bullmq");
const redis_1 = require("../utils/redis");
exports.smsQueue = new bullmq_1.Queue(shared_1.QueueNames.smsQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
    },
});
