"use client";

import React from "react";
import { Modal, Button } from "@/components/ui";
import { Download } from "@/components/icons";
import { OfficialReceiptDocument } from "./official-receipt-document";

export function PaymentReceiptModal({
  isOpen,
  onClose,
  payment,
}) {
  if (!payment) return null;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      const originalTitle = document.title;
      const ref = payment.orderId || payment.paypalOrderId || payment.internalReference || payment.id || "Receipt";
      document.title = `PayPilot-Receipt-${ref}`;
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      description=""
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 pt-1">
        <div id="official-print-receipt-wrapper">
          <OfficialReceiptDocument
            payment={payment}
            invoice={{
              customerName: payment.payerName || payment.customer,
              customerEmail: payment.payerEmail || payment.customerEmail,
              description: payment.category || payment.description || "Digital Invoice Payment",
              amount: payment.amount,
              currency: payment.currency,
              orderId: payment.orderId || payment.paypalOrderId,
              captureId: payment.captureId || payment.paypalCaptureId,
            }}
          />
        </div>

        {/* Action Buttons (hidden during print) */}
        <div className="no-print flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-[#CBD5E1]/40">
          <Button
            variant="primary"
            size="sm"
            onClick={handlePrint}
            icon={Download}
            iconPosition="left"
            className="w-full sm:w-auto shadow-md"
          >
            Download / Print PDF Receipt
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
