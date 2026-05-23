import { QueueNames } from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "../utils/redis";

export type TSMSSendingParams = {
  phoneNumber: string;
  message: string;
};

export const smsQueue = new Queue<TSMSSendingParams>(QueueNames.smsQueue, {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
});
