"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueLifecycleEmail = void 0;
const shared_1 = require("@hoizr-technology/shared");
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const lifecycleEmailQueue = new bullmq_1.Queue(shared_1.QueueNames.lifecycleEmailQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 50,
    },
});
const enqueueLifecycleEmail = async (type, to, name, data) => {
    if (!to)
        return;
    await lifecycleEmailQueue.add(type, { type, to, name, data });
};
exports.enqueueLifecycleEmail = enqueueLifecycleEmail;
