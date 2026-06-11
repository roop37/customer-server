import { Arg, Ctx, Mutation, Query, Resolver, UseMiddleware } from "type-graphql";
import { isScannerAuthenticated } from "../../../middlewares/scanner-auth";
import Context from "../../../types/context.type";
import {
  OfflineScanInput,
  ScanTicketInput,
  ScannerLoginInput,
} from "../interfaces/scanner.input";
import {
  OfflineScanResult,
  ScanTicketResponse,
  ScannerEventSummary,
  ScannerLoginResponse,
  ScannerManifest,
  ScannerRefreshResponse,
} from "../interfaces/scanner.objects";
import ScannerService from "../service/scanner.service";

@Resolver()
export class ScannerResolver {
  private readonly service = new ScannerService();

  @Mutation(() => ScannerLoginResponse)
  async scannerLogin(
    @Arg("input") input: ScannerLoginInput
  ): Promise<ScannerLoginResponse> {
    return this.service.login(input);
  }

  /**
   * Swap a long-lived scanner refresh token for a fresh access+refresh
   * pair. Mirrors the customer / host refresh flow. No middleware — the
   * refresh token is the authentication for this endpoint; the service
   * verifies it against the DB-tied `authTokenVersion`.
   */
  @Mutation(() => ScannerRefreshResponse)
  async scannerTokenRefresh(
    @Arg("refreshToken") refreshToken: string
  ): Promise<ScannerRefreshResponse> {
    return this.service.refreshTokens(refreshToken);
  }

  @Query(() => ScannerEventSummary)
  @UseMiddleware(isScannerAuthenticated)
  async scannerEventSummary(@Ctx() ctx: Context): Promise<ScannerEventSummary> {
    return this.service.getEventSummary(ctx);
  }

  @Mutation(() => ScanTicketResponse)
  @UseMiddleware(isScannerAuthenticated)
  async scanTicket(
    @Arg("input") input: ScanTicketInput,
    @Ctx() ctx: Context
  ): Promise<ScanTicketResponse> {
    return this.service.scanTicket(input, ctx);
  }

  /**
   * AUDIT-016: download every valid ticket for the scanner's event so the
   * app can validate + admit guests fully offline.
   */
  @Query(() => ScannerManifest)
  @UseMiddleware(isScannerAuthenticated)
  async scannerEventManifest(@Ctx() ctx: Context): Promise<ScannerManifest> {
    return this.service.getEventManifest(ctx);
  }

  /**
   * AUDIT-016: replay queued offline check-ins once the network is back.
   * Returns a per-item result so the client can reconcile conflicts.
   */
  @Mutation(() => [OfflineScanResult])
  @UseMiddleware(isScannerAuthenticated)
  async syncOfflineScans(
    @Arg("scans", () => [OfflineScanInput]) scans: OfflineScanInput[],
    @Ctx() ctx: Context
  ): Promise<OfflineScanResult[]> {
    return this.service.syncOfflineScans(scans, ctx);
  }
}
