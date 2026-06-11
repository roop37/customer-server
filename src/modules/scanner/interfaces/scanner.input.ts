import { Field, InputType } from "type-graphql";

@InputType()
export class ScannerLoginInput {
  @Field(() => String)
  email: string;

  @Field(() => String)
  accessCode: string;
}

@InputType()
export class ScanTicketInput {
  @Field(() => String)
  qrCodeData: string;
}

// AUDIT-016: one queued offline scan being synced back to the server.
@InputType()
export class OfflineScanInput {
  @Field(() => String)
  qrCodeData: string;

  @Field(() => Date)
  scannedAt: Date;
}
