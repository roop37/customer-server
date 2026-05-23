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
