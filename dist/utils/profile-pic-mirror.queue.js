"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueProfilePicMirror = void 0;
const shared_1 = require("@hoizr-technology/shared");
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const profilePicMirrorQueue = new bullmq_1.Queue(shared_1.QueueNames.customerProfilePicMirrorQueue, {
    connection: redis_1.redisClient,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 50,
    },
});
const enqueueProfilePicMirror = async (customerId, remoteUrl) => {
    if (!customerId || !remoteUrl)
        return;
    await profilePicMirrorQueue.add("mirror", { customerId, remoteUrl });
};
exports.enqueueProfilePicMirror = enqueueProfilePicMirror;
