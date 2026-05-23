import { QueueNames } from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "../utils/redis";

export type TEmailJobParams = {
  emailSendingConfig: { template: string; subject: string };
  to: string;
  name?: string;
  code?: string;
  data?: Record<string, any>;
};

export const customerEmailQueue = new Queue<TEmailJobParams>(
  QueueNames.customerEmailQueue,
  {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  }
);
