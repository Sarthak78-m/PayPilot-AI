"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Badge, Divider } from "@/components/ui";
import {
  Bot,
  ArrowLeft,
  Sparkles,
  Send,
  AlertCircle,
  RefreshCw,
  Clock,
  User,
} from "@/components/icons";
import { sendAssistantMessage } from "@/lib/api/assistant-service";
import { getSessionUser } from "@/lib/auth/auth-client";

const EXAMPLE_PROMPTS = [
  {
    title: "How much money am I owed?",
    description: "Calculates total outstanding receivables across all clients",
    tag: "Receivables",
  },
  {
    title: "Summarize my outstanding invoices.",
    description: "Provides an itemized breakdown of unpaid client accounts",
    tag: "Invoices",
  },
  {
    title: "Which invoices are overdue?",
    description: "Filters invoices that have surpassed their payment due dates",
    tag: "Overdue",
  },
  {
    title: "How can I improve my payment collection?",
    description: "Offers tactical tips for faster freelance invoice settlements",
    tag: "Best Practices",
  },
];

function formatTime(date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date || new Date());
  } catch {
    return "";
  }
}

function AssistantChatView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputPrompt, setInputPrompt] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [activeError, setActiveError] = useState(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messageCounterRef = useRef(1);

  useEffect(() => {
    let mounted = true;
    getSessionUser().then((res) => {
      if (mounted && res?.authenticated && res.user) {
        setCurrentUser(res.user);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-focus textarea if query param is provided
  useEffect(() => {
    if (initialQuery && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [initialQuery]);

  // Auto-scroll to latest message or error
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, activeError]);

  const handleSendMessage = async (textToSend) => {
    const promptText = (typeof textToSend === "string" ? textToSend : inputPrompt).trim();
    if (!promptText || loading) return;

    const userMessageId = `msg-u-${messageCounterRef.current++}`;
    const userMessage = {
      id: userMessageId,
      role: "user",
      content: promptText,
      timestamp: formatTime(new Date()),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputPrompt("");
    setActiveError(null);
    setLoading(true);
    setLastFailedPrompt(promptText);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendAssistantMessage({
        message: promptText,
        history: historyPayload,
      });

      if (res.error) {
        setActiveError({
          message: res.error,
          isUnavailable: Boolean(res.isUnavailable),
          is401: Boolean(res.is401),
        });
      } else if (res.data?.reply) {
        const assistantMessageId = `msg-a-${messageCounterRef.current++}`;
        const assistantMessage = {
          id: assistantMessageId,
          role: "assistant",
          content: res.data.reply,
          timestamp: formatTime(new Date()),
        };
        setMessages([...nextMessages, assistantMessage]);
        setLastFailedPrompt(null);
      } else {
        setActiveError({
          message: "The assistant returned an empty response. Please try again.",
          isUnavailable: false,
        });
      }
    } catch {
      setActiveError({
        message: "An unexpected client-side error occurred while transmitting your request.",
        isUnavailable: false,
      });
    } finally {
      setLoading(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setActiveError(null);
    setLastFailedPrompt(null);
    setInputPrompt("");
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const userDisplayName = currentUser?.name || currentUser?.email?.split("@")[0] || "User";
  const userInitials = userDisplayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col h-[calc(100vh-125px)] min-h-[580px] max-w-5xl mx-auto space-y-3">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#172033] tracking-tight">
              PayPilot AI Assistant
            </h1>
            <Badge variant="primary" size="sm">
              Conversational Copilot
            </Badge>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Real-time financial intelligence, accounts receivable insights, and collections advisory.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {messages.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              iconPosition="left"
              onClick={handleClearChat}
              disabled={loading}
              title="Reset current conversation"
            >
              New Chat
            </Button>
          )}

          <Link href="/dashboard">
            <Button variant="secondary" size="sm" icon={ArrowLeft} iconPosition="left">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Main Chat Surface */}
      <Card
        variant="raised"
        className="flex-1 flex flex-col min-h-0 p-0 overflow-hidden border border-[#CBD5E1]/60"
      >
        {/* Architecture Notice Banner */}
        <div className="px-4 py-2.5 bg-[#E8EDF4] border-b border-[#CBD5E1]/60 flex items-center justify-between text-xs text-[#64748B] shrink-0">
          <div className="flex items-center gap-2 truncate">
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
            <span className="truncate">
              <strong>Backend Integration Notice:</strong> Client UI is wired to{" "}
              <code className="text-[#172033] bg-[#CBD5E1]/50 px-1 py-0.5 rounded font-mono text-[11px]">
                POST /api/assistant/chat
              </code>
              . Endpoint rollout pending.
            </span>
          </div>
          <span className="text-[11px] font-mono shrink-0 hidden md:inline text-[#64748B]">
            Zero Fabricated Data
          </span>
        </div>

        {/* Conversation Stream Container */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation history"
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {/* Empty State */}
          {messages.length === 0 && (
            <div className="h-full flex flex-col justify-center items-center py-6 sm:py-8 max-w-2xl mx-auto text-center space-y-6">
              <div className="space-y-3">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white flex items-center justify-center mx-auto shadow-primary-glow">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#172033] tracking-tight">
                    How can I assist your business today?
                  </h2>
                  <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto mt-1 leading-relaxed">
                    Select a suggested inquiry below or enter your own query to analyze your receivables and collections.
                  </p>
                </div>
              </div>

              {/* Suggested Prompt Cards */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.title}
                    type="button"
                    onClick={() => handleSendMessage(prompt.title)}
                    disabled={loading}
                    className="p-3.5 rounded-xl bg-[#E8EDF4] border border-white/60 shadow-raised-sm hover:shadow-raised active:shadow-inset-sm transition-all text-left group flex flex-col justify-between gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">
                          {prompt.tag}
                        </span>
                        <Sparkles className="h-3 w-3 text-[#2563EB] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs font-bold text-[#172033] group-hover:text-[#2563EB] transition-colors">
                        {prompt.title}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#64748B] leading-snug">
                      {prompt.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages Stream */}
          {messages.map((message) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.id}
                className={`flex items-start gap-2.5 sm:gap-3 ${
                  isUser ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center shrink-0 shadow-raised-sm text-xs font-bold ${
                    isUser
                      ? "bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] text-white shadow-primary-glow"
                      : "bg-[#E8EDF4] text-[#2563EB] border border-white/80"
                  }`}
                  aria-hidden="true"
                >
                  {isUser ? userInitials || <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Bubble Container */}
                <div
                  className={`flex flex-col ${
                    isUser ? "items-end" : "items-start"
                  } max-w-[85%] sm:max-w-[75%]`}
                >
                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                      isUser
                        ? "bg-[#2563EB] text-white shadow-primary-glow rounded-tr-sm"
                        : "bg-[#E8EDF4] border border-white/70 shadow-raised-sm text-[#172033] rounded-tl-sm whitespace-pre-wrap"
                    }`}
                  >
                    {message.content}
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#64748B] px-1">
                    <Clock className="h-2.5 w-2.5 opacity-60" />
                    <span>{message.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator (Assistant Thinking) */}
          {loading && (
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-[#E8EDF4] text-[#2563EB] border border-white/80 flex items-center justify-center shrink-0 shadow-raised-sm">
                <Bot className="h-4 w-4" />
              </div>
              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#E8EDF4] border border-white/70 shadow-raised-sm rounded-tl-sm flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-[#2563EB] animate-bounce" />
                </div>
                <span className="text-xs text-[#64748B] ml-1.5 font-medium">
                  Connecting to Copilot service...
                </span>
              </div>
            </div>
          )}

          {/* Truthful Error State Banner */}
          {activeError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 shadow-raised-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-[#DC2626]">Service Unavailable</p>
                  <p className="text-[#991B1B] leading-relaxed">{activeError.message}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {activeError.is401 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => router.push("/login")}
                  >
                    Sign In
                  </Button>
                ) : lastFailedPrompt ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSendMessage(lastFailedPrompt)}
                    disabled={loading}
                  >
                    Retry
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <Divider />

        {/* 3. Pinned Message Input */}
        <div className="p-3 sm:p-4 bg-[#E8EDF4] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5"
          >
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={2}
                placeholder="Ask PayPilot AI about your receivables, invoices, or cashflow..."
                aria-label="Message prompt"
                className="w-full bg-[#E8EDF4] text-[#172033] placeholder-[#94A3B8] text-xs sm:text-sm rounded-xl p-3 shadow-inset-sm border border-[#D1D8E2] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB] focus:outline-none transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
              <span className="text-[10px] text-[#64748B] hidden lg:inline">
                <kbd className="px-1.5 py-0.5 bg-[#CBD5E1]/60 rounded text-[9px] font-mono">Enter ↵</kbd> send •{" "}
                <kbd className="px-1.5 py-0.5 bg-[#CBD5E1]/60 rounded text-[9px] font-mono">Shift + Enter</kbd> new line
              </span>

              <Button
                type="submit"
                variant="primary"
                size="md"
                icon={Send}
                iconPosition="right"
                loading={loading}
                disabled={!inputPrompt.trim() || loading}
                className="shadow-primary-glow min-w-[100px]"
              >
                Send
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <Card variant="raised-lg" className="p-8 text-center text-[#64748B]">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-[#CBD5E1] rounded mx-auto" />
            <div className="h-32 bg-[#CBD5E1] rounded" />
          </div>
        </Card>
      }
    >
      <AssistantChatView />
    </Suspense>
  );
}
