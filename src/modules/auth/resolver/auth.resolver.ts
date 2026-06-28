import { Arg, Ctx, Mutation, Resolver } from "type-graphql";
import Context from "../../../types/context.type";
import {
  CustomerCookieKeys,
  clearCustomerCookie,
  readTokenFromRequest,
  setCustomerCookie,
} from "../../../utils/cookie";
import {
  refreshCustomerAuthTokens,
  revokeCustomerRefreshToken,
} from "../../../utils/jwt";
import {
  CustomerAppleStartInput,
  CustomerGoogleStartInput,
  CustomerOtpRequestInput,
  CustomerOtpVerifyInput,
  CustomerPendingSignupRequestOtpInput,
  CustomerPendingSignupVerifyOtpInput,
} from "../interfaces/auth.input";
import {
  CustomerAuthResponse,
  CustomerGoogleStartResponse,
  CustomerOtpResponse,
  CustomerPendingSignupRequestOtpResponse,
  CustomerPendingSignupVerifyOtpResponse,
  CustomerTokenRefreshResponse,
  GoogleStartOutcome,
} from "../interfaces/auth.objects";
import AuthService from "../service/auth.service";
import OAuthService from "../service/oauth.service";

@Resolver()
export class AuthResolver {
  private readonly service = new AuthService();
  private readonly oauth = new OAuthService();

  @Mutation(() => CustomerOtpResponse)
  async customerRequestOtp(
    @Arg("input") input: CustomerOtpRequestInput
  ): Promise<CustomerOtpResponse> {
    return this.service.requestOtp(input);
  }

  @Mutation(() => CustomerAuthResponse)
  async customerVerifyOtp(
    @Arg("input") input: CustomerOtpVerifyInput,
    @Ctx() ctx: Context
  ): Promise<CustomerAuthResponse> {
    const result = await this.service.verifyOtp(input);

    setCustomerCookie(CustomerCookieKeys.ACCESS_TOKEN, result.accessToken, ctx.rep);
    setCustomerCookie(CustomerCookieKeys.REFRESH_TOKEN, result.refreshToken, ctx.rep);
    setCustomerCookie(CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);

    return {
      customerId: result.customerId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * Step 1 of Google sign-in. The frontend obtains a Google ID token
   * via @react-oauth/google and passes it here. Server verifies the
   * token and either logs the customer straight in (LOGGED_IN /
   * LINKED_EXISTING_BY_EMAIL) or returns a pending token so the client
   * can collect + verify the customer's phone via the pending-signup
   * mutations.
   */
  @Mutation(() => CustomerGoogleStartResponse)
  async customerGoogleStart(
    @Arg("input") input: CustomerGoogleStartInput,
    @Ctx() ctx: Context
  ): Promise<CustomerGoogleStartResponse> {
    const result = await this.oauth.googleStart(input);

    if (
      (result.outcome === GoogleStartOutcome.LOGGED_IN ||
        result.outcome === GoogleStartOutcome.LINKED_EXISTING_BY_EMAIL) &&
      result.accessToken &&
      result.refreshToken
    ) {
      setCustomerCookie(
        CustomerCookieKeys.ACCESS_TOKEN,
        result.accessToken,
        ctx.rep
      );
      setCustomerCookie(
        CustomerCookieKeys.REFRESH_TOKEN,
        result.refreshToken,
        ctx.rep
      );
      if (result.uniqueId) {
        setCustomerCookie(CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);
      }
    }

    return result;
  }

  /**
   * Apple sign-in start. Wired but stubbed — throws
   * APPLE_NOT_CONFIGURED until creds land. See
   * /docs/APPLE_SIGN_IN_ENABLEMENT.md.
   */
  @Mutation(() => CustomerGoogleStartResponse)
  async customerAppleStart(
    @Arg("input") input: CustomerAppleStartInput
  ): Promise<CustomerGoogleStartResponse> {
    return this.oauth.appleStart(input);
  }

  @Mutation(() => CustomerPendingSignupRequestOtpResponse)
  async customerPendingSignupRequestOtp(
    @Arg("input") input: CustomerPendingSignupRequestOtpInput
  ): Promise<CustomerPendingSignupRequestOtpResponse> {
    return this.oauth.pendingSignupRequestOtp(input);
  }

  @Mutation(() => CustomerPendingSignupVerifyOtpResponse)
  async customerPendingSignupVerifyOtp(
    @Arg("input") input: CustomerPendingSignupVerifyOtpInput,
    @Ctx() ctx: Context
  ): Promise<CustomerPendingSignupVerifyOtpResponse> {
    const result = await this.oauth.pendingSignupVerifyOtp(input);

    setCustomerCookie(
      CustomerCookieKeys.ACCESS_TOKEN,
      result.accessToken,
      ctx.rep
    );
    setCustomerCookie(
      CustomerCookieKeys.REFRESH_TOKEN,
      result.refreshToken,
      ctx.rep
    );
    setCustomerCookie(CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);

    return result;
  }

  @Mutation(() => CustomerTokenRefreshResponse)
  async customerTokenRefresh(
    @Ctx() ctx: Context
  ): Promise<CustomerTokenRefreshResponse> {
    const refreshToken = readTokenFromRequest(
      ctx.req,
      CustomerCookieKeys.REFRESH_TOKEN
    );
    if (!refreshToken) return { success: false };

    const result = await refreshCustomerAuthTokens(refreshToken);
    if (!result) return { success: false };

    setCustomerCookie(CustomerCookieKeys.ACCESS_TOKEN, result.aToken, ctx.rep);
    setCustomerCookie(CustomerCookieKeys.REFRESH_TOKEN, result.rToken, ctx.rep);
    setCustomerCookie(CustomerCookieKeys.UNIQUE_ID, result.uniqueId, ctx.rep);

    return {
      success: true,
      accessToken: result.aToken,
      refreshToken: result.rToken,
    };
  }

  @Mutation(() => Boolean)
  async customerLogout(@Ctx() ctx: Context): Promise<boolean> {
    if (ctx.customerId) {
      const uniqueId = ctx.req.cookies?.[CustomerCookieKeys.UNIQUE_ID];
      if (uniqueId) {
        await revokeCustomerRefreshToken(ctx.customerId, uniqueId);
      }
    }

    clearCustomerCookie(CustomerCookieKeys.ACCESS_TOKEN, ctx.rep);
    clearCustomerCookie(CustomerCookieKeys.REFRESH_TOKEN, ctx.rep);
    clearCustomerCookie(CustomerCookieKeys.UNIQUE_ID, ctx.rep);

    return true;
  }
}
