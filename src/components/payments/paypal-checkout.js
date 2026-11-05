"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Badge, Skeleton } from "@/components/ui";
import { CreditCard, AlertCircle, ShieldCheck, RefreshCw } from "@/components/icons";
import { isCheckoutFeatureEnabled, getPublicPayPalClientId } from "@/lib/payments/feature-guard";

const PAYPAL_V6_SDK_URL = "https://www.sandbox.paypal.com/web-sdk/v6/core";

// Module-level script loader cache to prevent duplicate script loading across renders
let sdkScriptPromise = null;

function loadPayPalV6Sdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window is not available"));
  }

  if (window.paypal && typeof window.paypal.createInstance === "function") {
    return Promise.resolve(window.paypal);
  }

  if (sdkScriptPromise) {
    return sdkScriptPromise;
  }

  // Check if an existing script tag already exists in DOM
  const existingScript = document.querySelector(`script[src="${PAYPAL_V6_SDK_URL}"]`);
  if (existingScript) {
    sdkScriptPromise = new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(window.paypal));
      existingScript.addEventListener("error", () => reject(new Error("Failed to load PayPal SDK script")));
    });
    return sdkScriptPromise;
  }

  sdkScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PAYPAL_V6_SDK_URL;
    script.async = true;
    script.setAttribute("data-namespace", "paypal");

    script.onload = () => {
      if (window.paypal && typeof window.paypal.createInstance === "function") {
        resolve(window.paypal);
      } else {
        reject(new Error("PayPal SDK loaded but window.paypal.createInstance is unavailable"));
      }
    };

    script.onerror = () => {
      sdkScriptPromise = null;
      script.remove();
      reject(new Error("Could not connect to PayPal SDK. Please check your internet connection."));
    };

    document.head.appendChild(script);
  });

  return sdkScriptPromise;
}

export function PayPalCheckout({
  token,
  currency = "USD",
  amount,
  onPaymentSuccess = () => {},
  onPaymentPending = () => {},
  onPaymentFailed = () => {},
  onPaymentCancelled = () => {},
  disabled = false,
}) {
  const isEnabled = isCheckoutFeatureEnabled();
  const clientId = getPublicPayPalClientId();

  const [sdkLoading, setSdkLoading] = useState(isEnabled && Boolean(clientId));
  const [sdkError, setSdkError] = useState(null);
  const [isEligible, setIsEligible] = useState(false);
  const [session, setSession] = useState(null);

  // In-flight payment processing states
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize PayPal JavaScript SDK v6 instance and one-time payment session
  const initializePayPal = useCallback(async () => {
    if (!isEnabled || !clientId) {
      return;
    }

    try {
      const paypal = await loadPayPalV6Sdk();
      if (!isMountedRef.current) return;

      const instance = await paypal.createInstance({
        clientId,
        components: ["paypal-payments"],
        pageType: "checkout",
      });

      if (!isMountedRef.current) return;

      // Check payment method eligibility for the invoice currency using currencyCode
      let eligible = true;
      if (typeof instance.findEligibleMethods === "function") {
        try {
          const eligibleMethods = await instance.findEligibleMethods({ currencyCode: currency });
          if (eligibleMethods && typeof eligibleMethods.isEligible === "function") {
            eligible = eligibleMethods.isEligible("paypal");
          } else if (Array.isArray(eligibleMethods)) {
            eligible = eligibleMethods.includes("paypal");
          }
        } catch {
          // Fall back to default eligible if check fails safely
          eligible = true;
        }
      }

      if (!isMountedRef.current) return;
      setIsEligible(eligible);

      if (!eligible) {
        setSdkLoading(false);
        return;
      }

      // Initialize the v6 one-time checkout session
      const oneTimeSession = await instance.createPayPalOneTimePaymentSession({
        onApprove: async (data) => {
          if (!isMountedRef.current) return;
          setIsProcessing(true);
          setActionNotice({
            type: "info",
            message: "PayPal authorization confirmed. Finalizing verified settlement with server...",
          });

          const orderId = data?.orderId || data?.orderID;
          if (!orderId) {
            setIsProcessing(false);
            setActionNotice({
              type: "error",
              message: "PayPal approval did not include a valid order reference. Please retry.",
            });
            onPaymentFailed({ error: "Missing orderId in approval" });
            return;
          }

          try {
            const captureRes = await fetch("/api/payments/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, orderId }),
            });

            const captureData = await captureRes.json();
            if (!isMountedRef.current) return;

            setIsProcessing(false);

            if (captureRes.ok && captureData.success) {
              if (captureData.status === "PENDING") {
                onPaymentPending(captureData);
              } else {
                onPaymentSuccess(captureData);
              }
            } else {
              setActionNotice({
                type: "error",
                message: captureData.error || "Payment capture could not be verified by the server. Please contact support.",
              });
              onPaymentFailed(captureData);
            }
          } catch {
            if (!isMountedRef.current) return;
            setIsProcessing(false);
            setActionNotice({
              type: "error",
              message: "Network error during settlement verification. Please refresh or retry.",
            });
            onPaymentFailed({ error: "Network capture exception" });
          }
        },
        onCancel: (data) => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          setActionNotice({
            type: "warning",
            message: "Checkout was cancelled. Your invoice remains open and you have not been charged.",
          });
          onPaymentCancelled(data);
        },
        onError: (err) => {
          if (!isMountedRef.current) return;
          setIsProcessing(false);
          setActionNotice({
            type: "error",
            message: "Payment gateway encountered an issue. Please try again or select another payment option.",
          });
          onPaymentFailed({ error: err?.message || "Gateway session error" });
        },
      });

      if (isMountedRef.current) {
        setSession(oneTimeSession);
        setSdkLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setSdkLoading(false);
        setSdkError(err.message || "Failed to initialize payment gateway.");
      }
    }
  }, [isEnabled, clientId, currency, token, onPaymentSuccess, onPaymentPending, onPaymentFailed, onPaymentCancelled]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) {
        await initializePayPal();
      }
    })();
    return () => {
      ignore = true;
    };
  }, [initializePayPal]);

  const handleRetryGateway = () => {
    setSdkLoading(true);
    setSdkError(null);
    initializePayPal();
  };

  // Handle customer button click to initiate checkout
  const handleInitiatePayment = async () => {
    if (!session || isProcessing || disabled) return;

    setIsProcessing(true);
    setActionNotice(null);

    try {
      const createOrder = async () => {
        const res = await fetch("/api/payments/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (!res.ok || !data.success || !data.orderId) {
          throw new Error(data.error || "Failed to create payment order on server.");
        }

        // v6 contract strictly requires returning { orderId }
        return { orderId: data.orderId };
      };

      const createOrderPromise = createOrder();

      // Official v6 contract: pass presentationMode options as arg 1, and createOrder promise as arg 2
      await session.start(
        { presentationMode: "auto" },
        createOrderPromise
      );
    } catch (err) {
      if (isMountedRef.current) {
        setIsProcessing(false);
        setActionNotice({
          type: "error",
          message: err.message || "Could not start payment checkout. Please try again.",
        });
      }
    }
  };

  // 1. Feature Disabled / Schema Unavailable State
  if (!isEnabled || !clientId) {
    return (
      <div className="p-5 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 shadow-inset-sm space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#64748B] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-[#172033]">Online Checkout Temporarily Unavailable</h4>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Online PayPal payments are currently disabled pending scheduled activation. Please contact the merchant directly to arrange settlement or try again later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Loading State (Skeletons)
  if (sdkLoading) {
    return (
      <div className="space-y-3 p-4 rounded-2xl bg-[#E8EDF4] border border-white/60 shadow-raised-sm" aria-busy="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <p className="text-[11px] text-[#64748B] text-center">Loading secure payment gateway...</p>
      </div>
    );
  }

  // 3. SDK Loading Error State
  if (sdkError) {
    return (
      <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Payment Gateway Initialization Failed</p>
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
          Retry Gateway Connection
        </Button>
      </div>
    );
  }

  // 4. Currency Not Eligible State
  if (!isEligible) {
    return (
      <div className="p-4 rounded-2xl bg-[#E8EDF4] border border-[#CBD5E1]/60 text-xs text-[#64748B] space-y-2">
        <p className="font-bold text-[#172033]">Payment Method Ineligible</p>
        <p>PayPal is not available for transactions in {currency}. Please contact the merchant for alternate payment instructions.</p>
      </div>
    );
  }

  // 5. Active PayPal v6 Button & Action Status View
  return (
    <div className="space-y-3.5">
      {/* Notice Banner */}
      {actionNotice && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 transition-all ${
            actionNotice.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : actionNotice.type === "warning"
              ? "bg-amber-50 text-amber-800 border border-amber-200"
              : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}
        >
          <AlertCircle
            className={`h-4 w-4 shrink-0 mt-0.5 ${
              actionNotice.type === "error"
                ? "text-red-500"
                : actionNotice.type === "warning"
                ? "text-amber-500"
                : "text-blue-500"
            }`}
          />
          <div className="leading-relaxed flex-1">{actionNotice.message}</div>
        </div>
      )}

      {/* Primary PayPal Action Button */}
      <div className="relative">
        <button
          type="button"
          onClick={handleInitiatePayment}
          disabled={isProcessing || disabled || !session}
          className="w-full h-12 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] active:bg-[#004C87] text-white font-bold text-sm tracking-wide shadow-raised flex items-center justify-center gap-2.5 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0070BA] focus-visible:ring-offset-2"
          aria-label="Pay with PayPal Sandbox"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Connecting to PayPal...</span>
            </>
          ) : (
            <>
              {/* PayPal Text Mark */}
              <span className="font-extrabold italic tracking-tight text-base font-sans">
                Pay<span className="text-[#00B2E3]">Pal</span>
              </span>
              <span className="font-medium text-xs opacity-90 border-l border-white/30 pl-2">
                Checkout Sandbox
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-1">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
          <span>Encrypted PayPal session</span>
        </div>
        <span className="font-mono">intent: CAPTURE</span>
      </div>
    </div>
  );
}
