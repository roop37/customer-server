import { QueueNames } from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "../utils/redis";

export type TSMSSendingParams = {
  phoneNumber: string;
  // Values for the MSG91 DLT template variables (keys match the template's
  // variable names). The BullMQ job NAME is the template key that the worker
  // (hoizr-workers sms.process.ts) resolves to a MSG91 template id.
  variables?: Record<string, string>;
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
