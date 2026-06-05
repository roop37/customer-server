import { Invoice } from "@hoizr-technology/shared";
import { getModelForClass } from "@typegoose/typegoose";

/**
 * customer-server needs READ access to the Invoice collection so the
 * order detail page can mint a fresh signed download URL when the
 * customer clicks "Download invoice". Writes still belong to
 * hoizr-workers (paid-order-fanout → generateCustomerPlatformFeeInvoice).
 */
const InvoiceModel = getModelForClass(Invoice, {
  schemaOptions: { timestamps: true, collection: "invoices" },
});

export { Invoice, InvoiceModel };
