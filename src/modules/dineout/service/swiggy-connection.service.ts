import { SwiggyConnectionStatus } from "@hoizr-technology/shared";
import axios from "axios";
import { SwiggyDineoutConnectionModel } from "../schema/swiggy-dineout.schema";
import { encryptSwiggyToken, decryptSwiggyToken } from "../util/token-crypto";
import { hashSwiggyUserId } from "../util/identity";
import {
  isSafeSwiggyMcpBase,
  isSwiggyDineoutReady,
  swiggyDineoutConfig,
} from "../config";

const REAUTH_WINDOW_MS = 60_000;

/**
 * The Swiggy token vault. One row per Hoizr customer. The access token is
 * encrypted at rest and decrypted only in-memory at call time; the Swiggy
 * user id is stored only as a SHA-256 hash. Nothing here is ever returned
 * to the browser.
 */
export class SwiggyConnectionService {
  async upsertConnection(input: {
    customerId: string;
    accessToken: string;
    expiresInSec: number;
    swiggyUserId: string;
  }): Promise<void> {
    const now = new Date();
    await SwiggyDineoutConnectionModel.updateOne(
      { customerId: input.customerId },
      {
        $set: {
          encryptedAccessToken: encryptSwiggyToken(input.accessToken),
          tokenExpiresAt: new Date(now.getTime() + input.expiresInSec * 1000),
          swiggyUserIdHash: hashSwiggyUserId(input.swiggyUserId),
          status: SwiggyConnectionStatus.CONNECTED,
        },
        $setOnInsert: { customerId: input.customerId, connectedAt: now },
      },
      { upsert: true }
    );
  }

  /** Returns a usable plaintext token, or null if missing/expired/revoked. */
  async getActiveToken(customerId: string): Promise<string | null> {
    if (!isSwiggyDineoutReady()) return null;
    const conn = await SwiggyDineoutConnectionModel.findOne({
      customerId,
    }).lean();
    if (!conn || conn.status !== SwiggyConnectionStatus.CONNECTED) return null;
    if (
      !conn.tokenExpiresAt ||
      conn.tokenExpiresAt.getTime() <= Date.now() + REAUTH_WINDOW_MS
    ) {
      await this.markExpired(customerId);
      return null;
    }
    try {
      return decryptSwiggyToken(conn.encryptedAccessToken);
    } catch {
      await this.markExpired(customerId);
      return null;
    }
  }

  async getStatus(customerId: string): Promise<{
    connected: boolean;
    status: SwiggyConnectionStatus | null;
    expiresAt: Date | null;
  }> {
    if (!isSwiggyDineoutReady()) {
      return { connected: false, status: null, expiresAt: null };
    }
    const conn = await SwiggyDineoutConnectionModel.findOne({
      customerId,
    }).lean();
    if (!conn) return { connected: false, status: null, expiresAt: null };
    const withinReauthWindow =
      conn.status === SwiggyConnectionStatus.CONNECTED &&
      (!conn.tokenExpiresAt ||
        conn.tokenExpiresAt.getTime() <= Date.now() + REAUTH_WINDOW_MS);
    if (withinReauthWindow) {
      await this.markExpired(customerId);
      return {
        connected: false,
        status: SwiggyConnectionStatus.EXPIRED,
        expiresAt: conn.tokenExpiresAt ?? null,
      };
    }
    const live = conn.status === SwiggyConnectionStatus.CONNECTED;
    if (live) {
      try {
        decryptSwiggyToken(conn.encryptedAccessToken);
      } catch {
        await this.markExpired(customerId);
        return {
          connected: false,
          status: SwiggyConnectionStatus.EXPIRED,
          expiresAt: conn.tokenExpiresAt ?? null,
        };
      }
    }
    return {
      connected: live,
      status: conn.status,
      expiresAt: conn.tokenExpiresAt ?? null,
    };
  }

  async markExpired(customerId: string): Promise<void> {
    await SwiggyDineoutConnectionModel.updateOne(
      { customerId },
      { $set: { status: SwiggyConnectionStatus.EXPIRED } }
    );
  }

  async markRevoked(customerId: string): Promise<void> {
    await SwiggyDineoutConnectionModel.updateOne(
      { customerId },
      { $set: { status: SwiggyConnectionStatus.REVOKED } }
    );
  }

  /**
   * Disconnect is intentionally allowed while the feature kill switch is off:
   * revocation is a safety operation, not a feature/data operation. A locally
   * stored token is deleted only after Swiggy confirms logout or reports that
   * the session is already invalid (401/419). On an ambiguous transport/5xx
   * failure the vault row stays intact so revocation can be retried.
   */
  async disconnect(customerId: string): Promise<void> {
    const conn = await SwiggyDineoutConnectionModel.findOne({
      customerId,
    }).lean();
    if (!conn) return;

    let accessToken: string;
    try {
      accessToken = decryptSwiggyToken(conn.encryptedAccessToken);
    } catch {
      throw new Error(
        "Unable to revoke the Swiggy session; the local connection was retained"
      );
    }

    const { mcpBase } = swiggyDineoutConfig();
    if (!isSafeSwiggyMcpBase(mcpBase)) {
      throw new Error(
        "Unable to revoke the Swiggy session; the logout endpoint is unsafe"
      );
    }
    try {
      await axios.post(`${mcpBase}/auth/logout`, undefined, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15_000,
      });
    } catch (error: any) {
      const status = Number(error?.response?.status ?? 0);
      if (status !== 401 && status !== 419) {
        throw new Error(
          "Unable to revoke the Swiggy session; the local connection was retained"
        );
      }
    }

    // A reconnect can replace the ciphertext while remote logout is in
    // flight. Delete only the row we actually revoked, never the new session.
    await SwiggyDineoutConnectionModel.deleteOne({
      customerId,
      encryptedAccessToken: conn.encryptedAccessToken,
    });
  }
}
