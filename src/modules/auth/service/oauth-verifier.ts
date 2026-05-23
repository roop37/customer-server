import { ErrorWithProps } from "mercurius";
import { OAuth2Client } from "google-auth-library";
import { EnvVars } from "../../../utils/environment";
import { CustomerAuthErrorCodes } from "../interfaces/auth.errors";

let cachedClient: OAuth2Client | null = null;

const getClient = (): OAuth2Client => {
  if (cachedClient) return cachedClient;
  cachedClient = new OAuth2Client(EnvVars.values.GOOGLE_OAUTH_CLIENT_ID);
  return cachedClient;
};

export type GoogleProfile = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
};

export const verifyGoogleIdToken = async (
  idToken: string
): Promise<GoogleProfile> => {
  if (!idToken || idToken.length < 32) {
    throw new ErrorWithProps("Invalid Google sign-in", {
      code: CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
    });
  }

  let payload;
  try {
    const ticket = await getClient().verifyIdToken({
      idToken,
      audience: EnvVars.values.GOOGLE_OAUTH_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ErrorWithProps("Invalid Google sign-in", {
      code: CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
    });
  }

  if (!payload?.sub || !payload?.email) {
    throw new ErrorWithProps("Invalid Google sign-in", {
      code: CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
    });
  }

  if (payload.email_verified === false) {
    // Reject — we use Google's email as the de-facto verified identifier
    // when matching/linking to existing accounts. An unverified email
    // would let anyone with the address claim the matching customer.
    throw new ErrorWithProps(
      "Your Google email is not verified yet. Verify it with Google, then try again.",
      { code: CustomerAuthErrorCodes.GOOGLE_EMAIL_NOT_VERIFIED }
    );
  }

  return {
    id: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified ?? false,
    name: payload.name,
    givenName: payload.given_name,
    familyName: payload.family_name,
    picture: payload.picture,
  };
};
