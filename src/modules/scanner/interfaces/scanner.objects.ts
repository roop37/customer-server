import { Field, ID, Int, ObjectType, registerEnumType } from "type-graphql";

export enum ScanResultStatus {
  OK = "OK",
  ALREADY_CHECKED_IN = "ALREADY_CHECKED_IN",
  WRONG_EVENT = "WRONG_EVENT",
  ORDER_NOT_FOUND = "ORDER_NOT_FOUND",
  PAYMENT_INCOMPLETE = "PAYMENT_INCOMPLETE",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
  INVALID_QR = "INVALID_QR",
  SCANNER_INACTIVE = "SCANNER_INACTIVE",
  EVENT_NOT_STARTED = "EVENT_NOT_STARTED",
  EVENT_ENDED = "EVENT_ENDED",
}
registerEnumType(ScanResultStatus, { name: "ScanResultStatus" });

@ObjectType()
export class ScannerLoginResponse {
  @Field(() => String)
  scannerId: string;

  @Field(() => String)
  eventId: string;

  @Field(() => String)
  businessId: string;

  @Field(() => String)
  scannerName: string;

  @Field(() => String)
  scannerType: string;

  @Field(() => String)
  accessToken: string;

  @Field(() => String)
  refreshToken: string;
}

/**
 * Response from a refresh-token swap. Smaller than the login response —
 * the scanner already knows its identity, all it needs are fresh tokens.
 */
@ObjectType()
export class ScannerRefreshResponse {
  @Field(() => String)
  accessToken: string;

  @Field(() => String)
  refreshToken: string;
}

@ObjectType()
export class ScannedTicketLine {
  @Field(() => String)
  ticketName: string;

  @Field(() => Int)
  quantity: number;
}

@ObjectType()
export class ScannedExtraLine {
  @Field(() => String)
  extraName: string;

  @Field(() => Int)
  quantity: number;
}

@ObjectType()
export class ScannedOrderSummary {
  @Field(() => ID)
  orderId: string;

  @Field(() => String, { nullable: true })
  customerName?: string;

  @Field(() => String, { nullable: true })
  customerPhone?: string;

  @Field(() => [ScannedTicketLine])
  tickets: ScannedTicketLine[];

  @Field(() => [ScannedExtraLine], { nullable: true })
  extras?: ScannedExtraLine[];

  @Field(() => Int)
  totalTickets: number;

  @Field(() => Date)
  checkedInAt: Date;

  @Field(() => Date, { nullable: true })
  previousCheckInAt?: Date;
}

@ObjectType()
export class ScanTicketResponse {
  @Field(() => ScanResultStatus)
  status: ScanResultStatus;

  @Field(() => String)
  message: string;

  @Field(() => ScannedOrderSummary, { nullable: true })
  order?: ScannedOrderSummary;
}

@ObjectType()
export class ScannerEventSummary {
  @Field(() => ID)
  eventId: string;

  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => String, { nullable: true })
  city?: string;

  @Field(() => Int)
  totalScanned: number;
}

// AUDIT-016: offline manifest — one cached, scannable ticket.
@ObjectType()
export class ScannerManifestEntry {
  @Field(() => ID)
  orderId: string;

  @Field(() => String)
  qrCodeData: string;

  @Field(() => String, { nullable: true })
  customerName?: string;

  @Field(() => String, { nullable: true })
  customerPhone?: string;

  @Field(() => [ScannedTicketLine])
  tickets: ScannedTicketLine[];

  @Field(() => Int)
  totalTickets: number;

  @Field(() => Boolean)
  checkedIn: boolean;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean)
  refunded: boolean;
}

@ObjectType()
export class ScannerManifest {
  @Field(() => ID)
  eventId: string;

  @Field(() => String, { nullable: true })
  title?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field(() => Date)
  generatedAt: Date;

  @Field(() => [ScannerManifestEntry])
  entries: ScannerManifestEntry[];
}

// AUDIT-016: per-item result of replaying a queued offline scan.
@ObjectType()
export class OfflineScanResult {
  @Field(() => String)
  qrCodeData: string;

  @Field(() => ScanResultStatus)
  status: ScanResultStatus;

  @Field(() => String)
  message: string;
}
