import {
  CustomerProfilePicMirrorJob,
  QueueNames,
} from "@hoizr-technology/shared";
import { Queue } from "bullmq";
import { redisClient } from "./redis";

const profilePicMirrorQueue = new Queue<CustomerProfilePicMirrorJob>(
  QueueNames.customerProfilePicMirrorQueue,
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

export const enqueueProfilePicMirror = async (
  customerId: string,
  remoteUrl: string
): Promise<void> => {
  if (!customerId || !remoteUrl) return;
  await profilePicMirrorQueue.add("mirror", { customerId, remoteUrl });
};
