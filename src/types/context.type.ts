import type { FastifyReply, FastifyRequest } from "fastify";

type Context = {
  req: FastifyRequest;
  rep: FastifyReply;
  customerId: string | undefined;
  customerPhone: string | undefined;
  scannerId: string | undefined;
  scannerEventId: string | undefined;
  scannerBusinessId: string | undefined;
};

export default Context;
