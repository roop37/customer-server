import {
  LifecycleEmailJob,
  LifecycleEmailType,
  QueueNames,
} from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "./redis";

const lifecycleEmailQueue = new Queue<LifecycleEmailJob>(
  QueueNames.lifecycleEmailQueue,
  {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  }
);

export const enqueueLifecycleEmail = async (
  type: LifecycleEmailType,
  to: string,
  name?: string,
  data?: Record<string, unknown>
): Promise<void> => {
  if (!to) return;
  await lifecycleEmailQueue.add(type, { type, to, name, data });
};
