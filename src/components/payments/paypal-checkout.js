"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button, Skeleton } from "@/components/ui";
import { AlertCircle, ShieldCheck, RefreshCw } from "@/components/icons";
import { isCheckoutFeatureEnabled, getPublicPayPalClientId } from "@/lib/payments/feature-guard";

/**
 * Loads the official PayPal JavaScript SDK dynamically.
 * Uses client-id, currency, and intent=capture.
 */
function loadOfficialPayPalSdk({ clientId, currency = "USD" }) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }

  const scriptId = `paypal-sdk-script-${clientId}-${currency}`;

  if (window.paypal && typeof window.paypal.Buttons === "function") {
    return Promise.resolve(window.paypal);
  }

  const existingScript = document.getElementById(scriptId);
  if (existingScript) {
    return new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => {
        if (window.paypal && typeof window.paypal.Buttons === "function") {
          resolve(window.paypal);
        } else {
          reject(new Error("PayPal SDK loaded but Buttons component is unavailable."));
        }
      });
      existingScript.addEventListener("error", () =>
        reject(new Error("Failed to load PayPal SDK script."))
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
    script.async = true;

    script.onload = () => {
      if (window.paypal && typeof window.paypal.Buttons === "function") {
        resolve(window.paypal);
      } else {
        reject(new Error("PayPal SDK script loaded but window.paypal.Buttons is unavailable."));
      }
    };

    script.onerror = () => {
      script.remove();
      reject(new Error("Could not connect to PayPal SDK. Please check your internet connection."));
    };

    document.head.appendChild(script);
  });
}

export function PayPalCheckout({
  token,
  invoiceId,
  transactionId,
  currency = "USD",
  amount,
  onPaymentSuccess = () => {},
  onPaymentPending = () => {},
  onPaymentFailed = () => {},
  onPaymentCancelled = () => {},
  disabled = false,
}) {
  const [resolvedClientId, setResolvedClientId] = useState(getPublicPayPalClientId());
  const [resolvedCurrency, setResolvedCurrency] = useState(currency || "USD");
  const [isGatewayActive, setIsGatewayActive] = useState(isCheckoutFeatureEnabled());
  const [isSandboxMode, setIsSandboxMode] = useState(true);

  const [sdkLoading, setSdkLoading] = useState(true);
  const [sdkError, setSdkError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processing Your Payment...");
  const [actionNotice, setActionNotice] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const buttonContainerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch server-side public PayPal config if client ID is missing
  useEffect(() => {
    let ignore = false;
    async function fetchConfig() {
      try {
        const res = await fetch("/api/paypal/config");
        if (!res.ok) return;
        const config = await res.json();
        if (ignore || !config.success) return;

        if (config.clientId) {
          setResolvedClientId(config.clientId);
        }
        if (config.currency && !currency) {
          setResolvedCurrency(config.currency);
        }
        setIsSandboxMode(config.sandbox !== false);
        setIsGatewayActive(true);
      } catch {
        // Fall back to default environment settings
      }
    }

    if (!resolvedClientId) {
      fetchConfig();
    }
    return () => {
      ignore = true;
    };
  }, [resolvedClientId, currency]);

  // Initialize and render official PayPal Buttons using async loader
  useEffect(() => {
    let ignore = false;

    if (!resolvedClientId || !buttonContainerRef.current) {
      return;
    }

    // Clear previous rendered button instances
    if (buttonContainerRef.current) {
      buttonContainerRef.current.innerHTML = "";
    }

    loadOfficialPayPalSdk({
      clientId: resolvedClientId,
      currency: resolvedCurrency,
    })
      .then(async (paypal) => {
        if (ignore || !buttonContainerRef.current) return;

        const buttons = paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "paypal",
            height: 48,
          },

          // 1. Create Order Callback: Calls backend to get official PayPal Order ID
          createOrder: async () => {
            if (!isMountedRef.current) return "";
            setIsProcessing(true);
            setProcessingMessage("Creating Your Payment Order...");
            setActionNotice(null);

            try {
              const res = await fetch("/api/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, invoiceId, transactionId }),
              });

              const data = await res.json();

              if (!res.ok || !data.success || !data.orderId) {
                const errorMessage = data.error || "Failed to create PayPal order on server.";
                throw new Error(errorMessage);
              }

              if (isMountedRef.current) {
                setProcessingMessage("Continuing to PayPal Sandbox...");
              }

              return data.orderId;
            } catch (err) {
              if (isMountedRef.current) {
                setIsProcessing(false);
                setActionNotice({
                  type: "error",
                  message: err.message || "Payment Could Not Be Completed.",
                });
              }
              throw err;
            }
          },

          // 2. On Approve Callback: Calls backend to capture and settle the approved order
          onApprove: async (data) => {
            if (!isMountedRef.current) return;
            setIsProcessing(true);
            setProcessingMessage("Payment Approved. Verifying Transaction...");
            setActionNotice({
              type: "info",
              message: "Payment Approved. Verifying Transaction...",
            });

            const orderId = data?.orderID || data?.orderId;
            if (!orderId) {
              setIsProcessing(false);
              setActionNotice({
                type: "error",
                message: "PayPal authorization was missing a valid order ID.",
              });
              onPaymentFailed({ error: "Missing order ID from approval." });
              return;
            }

            try {
              if (isMountedRef.current) {
                setProcessingMessage("Processing Your Payment...");
              }

              const captureRes = await fetch("/api/paypal/capture-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, token, invoiceId, transactionId }),
              });

              const captureData = await captureRes.json();
              if (!isMountedRef.current) return;
              setIsProcessing(false);

              if (captureRes.ok && captureData.success) {
                if (captureData.status === "PENDING") {
                  onPaymentPending(captureData);
                } else {
                  setActionNotice({
                    type: "success",
                    message: "Payment Completed Successfully!",
                  });
                  onPaymentSuccess(captureData);
                }
              } else {
                setActionNotice({
                  type: "error",
                  message:
                    captureData.error ||
                    "Payment Could Not Be Completed.",
                });
                onPaymentFailed(captureData);
              }
            } catch (captureErr) {
              if (!isMountedRef.current) return;
              setIsProcessing(false);
              setActionNotice({
                type: "error",
                message: "Network error during payment verification. Please check your connection.",
              });
              onPaymentFailed({ error: captureErr.message });
            }
          },

          // 3. On Cancel Callback
          onCancel: (data) => {
            if (!isMountedRef.current) return;
            setIsProcessing(false);
            setActionNotice({
              type: "warning",
              message: "Payment Cancelled.",
            });
            onPaymentCancelled(data);
          },

          // 4. On Error Callback
          onError: (err) => {
            if (!isMountedRef.current) return;
            setIsProcessing(false);
            setActionNotice({
              type: "error",
              message: "Payment Could Not Be Completed.",
            });
            onPaymentFailed({ error: err?.message || "Gateway error" });
          },
        });

        if (buttons.isEligible && !buttons.isEligible()) {
          if (!ignore) {
            setSdkError(`PayPal is not eligible for payments in ${resolvedCurrency}.`);
            setSdkLoading(false);
          }
          return;
        }

        await buttons.render(buttonContainerRef.current);
        if (!ignore) {
          setSdkLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setSdkLoading(false);
          setSdkError(err.message || "Failed to initialize PayPal Sandbox gateway.");
        }
      });

    return () => {
      ignore = true;
    };
  }, [
    resolvedClientId,
    resolvedCurrency,
    token,
    invoiceId,
    transactionId,
    retryCount,
    onPaymentSuccess,
    onPaymentPending,
    onPaymentFailed,
    onPaymentCancelled,
  ]);

  const handleRetryGateway = () => {
    setSdkLoading(true);
    setSdkError(null);
    setRetryCount((c) => c + 1);
  };

  // 1. Feature Disabled / Missing Credentials State
  if (!isGatewayActive || !resolvedClientId) {
    return (
      <div className="p-5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#64748B] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-[#172033]">PayPal Sandbox Checkout Configuration</h4>
            <p className="text-xs text-[#64748B] leading-relaxed">
              PayPal Checkout is waiting for credentials. Ensure <code className="px-1.5 py-0.5 bg-white/70 rounded font-mono text-[11px]">PAYPAL_CLIENT_ID</code> and <code className="px-1.5 py-0.5 bg-white/70 rounded font-mono text-[11px]">PAYMENT_CHECKOUT_ENABLED=true</code> are configured in your environment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Sandbox Environment Mode Badge */}
      {isSandboxMode && (
        <div className="flex items-center justify-between p-2.5 px-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs shadow-inset-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-extrabold tracking-wider uppercase text-[10px] text-amber-900">
              PAYPAL SANDBOX MODE
            </span>
          </div>
          <span className="text-[11px] font-medium text-amber-700 hidden sm:inline">
            Test account only — no real funds
          </span>
        </div>
      )}

      {/* Action Status Notice (Info / Warning / Error / Success) */}
      {actionNotice && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 transition-all shadow-inset-sm ${
            actionNotice.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : actionNotice.type === "warning"
              ? "bg-amber-50 text-amber-800 border border-amber-200"
              : actionNotice.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          <AlertCircle
            className={`h-4 w-4 shrink-0 mt-0.5 ${
              actionNotice.type === "error"
                ? "text-red-500"
                : actionNotice.type === "warning"
                ? "text-amber-500"
                : actionNotice.type === "success"
                ? "text-emerald-500"
                : "text-blue-500"
            }`}
          />
          <div className="leading-relaxed flex-1 font-medium">{actionNotice.message}</div>
        </div>
      )}

      {/* Loading Skeleton: Connecting to PayPal Sandbox */}
      {sdkLoading && (
        <div className="space-y-3 p-4 rounded-2xl bg-[#E8EDF4] border border-white/60 shadow-raised-sm" aria-busy="true">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <p className="text-[11px] text-[#64748B] text-center font-medium">Connecting to PayPal Sandbox...</p>
        </div>
      )}

      {/* SDK Initialization Error */}
      {sdkError && !sdkLoading && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-3 shadow-inset-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Payment Gateway Unavailable</p>
              <p className="text-[11px] mt-0.5 text-red-600">{sdkError}</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetryGateway}
            icon={RefreshCw}
            iconPosition="left"
            className="text-xs"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* Official PayPal Buttons Container */}
      <div className="relative">
        {isProcessing && (
          <div className="absolute inset-0 z-20 bg-[#E8EDF4]/90 dark:bg-[#111726]/90 backdrop-blur-xs rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] shadow-raised-sm p-4">
            <svg className="animate-spin h-5 w-5 text-[#0070BA]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>{processingMessage}</span>
          </div>
        )}

        <div
          ref={buttonContainerRef}
          id="paypal-buttons-container"
          className={`min-h-[48px] rounded-xl overflow-hidden transition-opacity ${
            isProcessing || disabled ? "opacity-50 pointer-events-none" : "opacity-100"
          }`}
        />
      </div>

      {/* Security & Verification Footer */}
      <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
          <span>Official PayPal Checkout</span>
        </div>
        <span className="font-mono text-[10px] tracking-wide uppercase opacity-75">
          v2/checkout/orders • CAPTURE
        </span>
      </div>
    </div>
  );
}
