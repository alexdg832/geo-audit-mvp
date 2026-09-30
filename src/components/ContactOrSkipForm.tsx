"use client";

import { useState, useTransition } from "react";
import { bookCallAction, skipContactAction } from "@/lib/actions/contact";
import { siteConfig } from "@config/site";
import { Button } from "./ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function ContactOrSkipForm({ auditId }: { auditId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"call" | "skip" | null>(null);
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    fd.set("name", name);
    fd.set("goals", goals);
    return fd;
  }

  function handleBookCall() {
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    // Open synchronously on click so browsers don't block the popup.
    window.open(siteConfig.calendlyUrl, "_blank", "noopener,noreferrer");
    setError(null);
    setMode("call");
    startTransition(async () => {
      const result = await bookCallAction(auditId, {}, buildFormData());
      if (result?.error) setError(result.error);
    });
  }

  function handleSkip() {
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setError(null);
    setMode("skip");
    startTransition(async () => {
      const result = await skipContactAction(auditId, {}, buildFormData());
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-700">
            Email *
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@business.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-700">
            Password *
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="At least 8 characters"
          />
          <p className="mt-1 text-xs text-stone-500">This becomes your dashboard login.</p>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 p-4">
        <h3 className="font-semibold text-stone-900">Book a call</h3>
        <p className="mt-1 text-sm text-stone-600">
          Tell us a bit about your goals and we&apos;ll open our scheduler.
        </p>
        <div className="mt-3 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Your name"
          />
          <textarea
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            className={inputClass}
            placeholder="What are you hoping to fix?"
            rows={3}
          />
          <Button onClick={handleBookCall} disabled={pending} className="w-full">
            {pending && mode === "call" ? "Booking…" : "Book a call"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSkip}
        disabled={pending}
        className="w-full text-center text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700 disabled:opacity-50"
      >
        {pending && mode === "skip" ? "Setting up your dashboard…" : "Skip for now and see my dashboard"}
      </button>
    </div>
  );
}
