import { HostFeedback } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/** Same `host_feedback` collection main-server + admin read from. */
export const HostFeedbackModel = getModelForClass(HostFeedback, {
  schemaOptions: { collection: "host_feedback", timestamps: true },
});
