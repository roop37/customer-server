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
  data?: Record<string, unknown>,
  /** Optional inline/attached files (e.g. a golden-pass QR via cid). */
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    cid?: string;
    contentType?: string;
  }>
): Promise<void> => {
  if (!to) return;
  // `attachments` isn't on the published LifecycleEmailJob type yet (no
  // republish for this change); the lifecycle-email worker already reads it
  // off the job. Cast so the extra field rides along to the worker.
  await lifecycleEmailQueue.add(type, {
    type,
    to,
    name,
    data,
    attachments,
  } as LifecycleEmailJob & { attachments?: typeof attachments });
};
