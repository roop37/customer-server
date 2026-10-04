import { WaitlistStatus } from "@hoizr-technology/shared";
import { ErrorWithProps } from "mercurius";
import { EnvVars } from "../../../utils/environment";
import { CustomerModel } from "../../customer/schema/customer.schema";
import { EventModel } from "../../event/schema/event.schema";
import { JoinWaitlistInput } from "../interface/waitlist.input";
import { WaitlistEntryModel } from "../schema/waitlist-entry.schema";

const clean = (v?: string) => {
  const t = v?.trim();
  return t ? t : undefined;
};

class WaitlistService {
  private get metaVerified(): boolean {
    return EnvVars.values.META_VERIFIED === "true";
  }

  async myWaitlistStatus(customerId: string, eventId: string) {
    return WaitlistEntryModel.findOne({ eventId, customerId }).lean();
  }

  async joinWaitlist(customerId: string, input: JoinWaitlistInput) {
    const event = await EventModel.findOne({
      _id: input.eventId,
      isDeleted: false,
    })
      .select("waitlistEnabled waitlistCollectSocials title")
      .lean<any>();
    if (!event) throw new ErrorWithProps("Event not found");
    if (!event.waitlistEnabled) {
      throw new ErrorWithProps("The waitlist isn't open for this event.");
    }

    const customer = await CustomerModel.findById(customerId).lean<any>();
    if (!customer) throw new ErrorWithProps("Customer not found");

    // Resolve handles: prefer what was just supplied, else what's on file.
    const instagram = clean(input.instagramHandle) ?? clean(customer.instagramHandle);
    const facebook = clean(input.facebookHandle) ?? clean(customer.facebookHandle);
    const x = clean(input.xHandle) ?? clean(customer.xHandle);

    // Gate: host wants socials + Meta verification pending → Instagram required.
    if (event.waitlistCollectSocials && !this.metaVerified && !instagram) {
      throw new ErrorWithProps(
        "Add your Instagram handle to join this waitlist.",
        { code: "INSTAGRAM_REQUIRED" }
      );
    }

    // Persist any newly-supplied handle to the profile (so no re-prompt later).
    const profilePatch: Record<string, string> = {};
    if (clean(input.instagramHandle)) profilePatch.instagramHandle = clean(input.instagramHandle)!;
    if (clean(input.facebookHandle)) profilePatch.facebookHandle = clean(input.facebookHandle)!;
    if (clean(input.xHandle)) profilePatch.xHandle = clean(input.xHandle)!;
    if (Object.keys(profilePatch).length) {
      await CustomerModel.updateOne({ _id: customerId }, { $set: profilePatch });
    }

    const name =
      [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() ||
      undefined;
    const partySize = Math.max(1, Math.trunc(Number(input.partySize ?? 1)));

    const entry = await WaitlistEntryModel.findOneAndUpdate(
      { eventId: input.eventId, customerId },
      {
        $set: {
          name,
          phone: customer.phoneE164 || customer.phone,
          email: customer.email,
          city: clean(customer.city),
          partySize,
          note: clean(input.note),
          instagramHandle: instagram,
          facebookHandle: facebook,
          xHandle: x,
        },
        // Never downgrade an already-INVITED/CONVERTED entry on re-join.
        $setOnInsert: { status: WaitlistStatus.WAITING },
      },
      { new: true, upsert: true }
    ).lean();

    return entry;
  }
}

export default WaitlistService;
