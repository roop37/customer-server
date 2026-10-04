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
const enqueueLifecycleEmail = async (type, to, name, data, 
/** Optional inline/attached files (e.g. a golden-pass QR via cid). */
attachments) => {
    if (!to)
        return;
    // `attachments` isn't on the published LifecycleEmailJob type yet (no
    // republish for this change); the lifecycle-email worker already reads it
    // off the job. Cast so the extra field rides along to the worker.
    await lifecycleEmailQueue.add(type, {
        type,
        to,
        name,
        data,
        attachments,
    });
};
exports.enqueueLifecycleEmail = enqueueLifecycleEmail;
