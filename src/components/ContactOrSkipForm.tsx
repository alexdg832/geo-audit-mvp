"use client";

import { useState, useTransition } from "react";
import { bookCallAction, skipContactAction } from "@/lib/actions/contact";
import { siteConfig } from "@config/site";
import { Button } from "./ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

// Mirrors validateCredentials in src/lib/actions/contact.ts, so the scheduler is not opened for a form the server will reject.
const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function credentialsError(email: string, password: string): string | null {
  if (!email || !password) return "Email and password are required.";
  if (!EMAIL_REGEX.test(email) || email.length > 254) return "Please enter a valid email address.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password must be at most 128 characters.";
  return null;
}

export function ContactOrSkipForm({ auditId }: { auditId: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [goals, setGoals] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"call" | "skip" | null>(null);
  const [schedulerOpened, setSchedulerOpened] = useState(false);
  const [pending, startTransition] = useTransition();
  const canBook = siteConfig.calendlyUrl !== null;

  function buildFormData() {
    const fd = new FormData();
    fd.set("email", email);
    fd.set("password", password);
    fd.set("name", name);
    fd.set("goals", goals);
    return fd;
  }

  function handleBookCall() {
    const validationError = credentialsError(email.trim(), password);
    if (validationError) {
      setError(validationError);
      return;
    }
    // Open synchronously on click so browsers don't block the popup, and only once: a retry after a server-side error
    // must not open a second tab. Without a real link there is nothing to open; the call is still recorded (wantsCall)
    // and the team emails the client to pick a time.
    if (siteConfig.calendlyUrl && !schedulerOpened) {
      window.open(siteConfig.calendlyUrl, "_blank", "noopener,noreferrer");
      setSchedulerOpened(true);
    }
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
        <h3 className="font-semibold text-stone-900">{canBook ? "Book a call" : "Request a call"}</h3>
        <p className="mt-1 text-sm text-stone-600">
          {canBook
            ? "Tell us a bit about your goals and we'll open our scheduler."
            : "Tell us a bit about your goals and we will email you to pick a time."}
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
            {pending && mode === "call" ? (canBook ? "Booking…" : "Sending…") : canBook ? "Book a call" : "Request a call"}
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
