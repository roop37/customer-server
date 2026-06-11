import { SignupProvider, toE164 } from "@hoizr-technology/shared";
import { CustomerModel } from "../schema/customer.schema";

/**
 * Resolve (and optionally create) the customer behind an order — used by both
 * guest checkout and host-issued offline tickets.
 *
 * Phone is the primary identity (per Roop: "if I already have an account via
 * my number, set the customer id as that"). We match phone first, then email.
 * When `createIfMissing` is true (guest checkout with the sign-up switch on)
 * and we have the full required profile, we auto-create a PHONE-provider
 * account so the buyer's tickets live in a real account they can later log
 * into with the same number.
 */
export type ResolvedCustomer = {
  customerId?: string;
  existed: boolean; // matched an existing account
  created: boolean; // we created a new account just now
  accountEmail?: string; // existing/created account's email (for dual receipt)
};

export const resolveCustomerForOrder = async (params: {
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  createIfMissing: boolean;
}): Promise<ResolvedCustomer> => {
  const e164 = toE164(params.phone);
  const rawPhone = (params.phone ?? "").trim();
  const email = params.email?.trim().toLowerCase();

  // 1) Match by phone (primary identity).
  const orPhone: any[] = [];
  if (e164) orPhone.push({ phoneE164: e164 }, { phone: e164 });
  if (rawPhone) orPhone.push({ phone: rawPhone });
  if (orPhone.length) {
    const byPhone = await CustomerModel.findOne({
      $or: orPhone,
      isDeleted: { $ne: true },
    })
      .select("_id email")
      .lean<{ _id: any; email?: string }>();
    if (byPhone) {
      return {
        customerId: String(byPhone._id),
        existed: true,
        created: false,
        accountEmail: byPhone.email,
      };
    }
  }

  // 2) Match by email (a returning buyer who used a different number).
  if (email) {
    const byEmail = await CustomerModel.findOne({
      email,
      isDeleted: { $ne: true },
    })
      .select("_id email")
      .lean<{ _id: any; email?: string }>();
    if (byEmail) {
      return {
        customerId: String(byEmail._id),
        existed: true,
        created: false,
        accountEmail: byEmail.email,
      };
    }
  }

  // 3) Create — only when asked AND we have everything the schema requires.
  const canCreate =
    params.createIfMissing &&
    !!e164 &&
    !!email &&
    !!params.firstName?.trim() &&
    !!params.lastName?.trim();
  if (!canCreate) {
    return { existed: false, created: false };
  }
  try {
    const created = await CustomerModel.create({
      phone: e164,
      phoneE164: e164,
      firstName: params.firstName!.trim(),
      lastName: params.lastName!.trim(),
      email,
      signupProvider: SignupProvider.PHONE,
      authTokenVersion: 0,
    });
    return {
      customerId: String(created._id),
      existed: false,
      created: true,
      accountEmail: created.email,
    };
  } catch {
    // Lost a unique-key race (phone/email) — re-resolve to the winner.
    const winner = await CustomerModel.findOne({
      $or: [{ phoneE164: e164 }, { email }],
    })
      .select("_id email")
      .lean<{ _id: any; email?: string }>();
    if (winner) {
      return {
        customerId: String(winner._id),
        existed: true,
        created: false,
        accountEmail: winner.email,
      };
    }
    return { existed: false, created: false };
  }
};
