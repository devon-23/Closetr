"use client";

import { useState } from "react";
import { BevelButton } from "@/components/ui/BevelButton";
import { createClient } from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

type LoginFormProps = {
  /** Where to land after the magic link is followed. */
  next: string;
};

export function LoginForm({ next }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus({ kind: "sending" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setStatus(
      error ? { kind: "error", message: error.message } : { kind: "sent" },
    );
  }

  if (status.kind === "sent") {
    return (
      <div className="py-4 text-center">
        <p className="display text-sm text-[var(--color-accent)]">
          ✉ check your email!
        </p>
        <p className="microcopy mt-2">
          we sent a link to {email}. it expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label htmlFor="email" className="label mb-1 block">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="field"
        />
      </div>

      {status.kind === "error" && (
        // role="alert" so a screen reader announces the failure.
        <p role="alert" className="text-[11px] text-[#a03050]">
          ✗ {status.message}
        </p>
      )}

      <BevelButton
        type="submit"
        variant="primary"
        disabled={status.kind === "sending"}
        className="w-full py-1.5"
      >
        {status.kind === "sending" ? "sending..." : "★ Send magic link ★"}
      </BevelButton>
    </form>
  );
}
