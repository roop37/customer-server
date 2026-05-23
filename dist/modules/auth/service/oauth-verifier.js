"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGoogleIdToken = void 0;
const mercurius_1 = require("mercurius");
const google_auth_library_1 = require("google-auth-library");
const environment_1 = require("../../../utils/environment");
const auth_errors_1 = require("../interfaces/auth.errors");
let cachedClient = null;
const getClient = () => {
    if (cachedClient)
        return cachedClient;
    cachedClient = new google_auth_library_1.OAuth2Client(environment_1.EnvVars.values.GOOGLE_OAUTH_CLIENT_ID);
    return cachedClient;
};
const verifyGoogleIdToken = async (idToken) => {
    if (!idToken || idToken.length < 32) {
        throw new mercurius_1.ErrorWithProps("Invalid Google sign-in", {
            code: auth_errors_1.CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
        });
    }
    let payload;
    try {
        const ticket = await getClient().verifyIdToken({
            idToken,
            audience: environment_1.EnvVars.values.GOOGLE_OAUTH_CLIENT_ID,
        });
        payload = ticket.getPayload();
    }
    catch {
        throw new mercurius_1.ErrorWithProps("Invalid Google sign-in", {
            code: auth_errors_1.CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
        });
    }
    if (!payload?.sub || !payload?.email) {
        throw new mercurius_1.ErrorWithProps("Invalid Google sign-in", {
            code: auth_errors_1.CustomerAuthErrorCodes.INVALID_GOOGLE_TOKEN,
        });
    }
    if (payload.email_verified === false) {
        // Reject — we use Google's email as the de-facto verified identifier
        // when matching/linking to existing accounts. An unverified email
        // would let anyone with the address claim the matching customer.
        throw new mercurius_1.ErrorWithProps("Your Google email is not verified yet. Verify it with Google, then try again.", { code: auth_errors_1.CustomerAuthErrorCodes.GOOGLE_EMAIL_NOT_VERIFIED });
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
exports.verifyGoogleIdToken = verifyGoogleIdToken;
