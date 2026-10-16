"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { resolveSession } from "@/lib/session";
import { EnvBadge } from "@/shell/TopBar";
import { BrandMark } from "@/shell/Brand";
import { Button } from "@/ui/Button";
import { Field, TextInput } from "@/ui/Field";
import { Notice } from "@/ui/States";

function friendlyAuthError(e: unknown): string {
  const code = String((e as { code?: string })?.code ?? "");
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Email or password is incorrect.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  if (code.includes("network")) return "Could not reach the sign-in service. Check your connection.";
  if (code.includes("user-disabled")) return "This account has been disabled.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  // Never show raw SDK text such as "Firebase: Error (auth/...)".
  return "Sign-in failed. Check your details and try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("denied") === "1") {
      setError("Access denied. This account is not an active console admin.");
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Checked AFTER sign-in: the role lookup is itself an authenticated
      // call. A non-admin (or disabled admin) is signed straight back out.
      const session = await resolveSession(cred.user);
      if (!session) {
        await signOut(auth);
        setError("Access denied. This account is not an active console admin.");
        return;
      }
      router.replace("/dashboard");
    } catch (err) {
      const msg = (err as { name?: string })?.name === "AdminApiError" ? (err as Error).message : friendlyAuthError(err);
      setError(msg);
      await signOut(auth).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <BrandMark size={28} />
            </span>
            <h1 className="text-2xl font-semibold text-fg">Akaya Console</h1>
            <p className="mt-1 text-sm text-fg-muted">Sign in with your admin account.</p>
            <div className="mt-3">
              <EnvBadge />
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <Field label="Email" required>
              {(p) => (
                <TextInput
                  {...p}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="you@akayaai.com"
                />
              )}
            </Field>
            <Field label="Password" required>
              {(p) => (
                <TextInput
                  {...p}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              )}
            </Field>
            {error ? (
              <Notice tone="danger" title="Could not sign in">
                {error}
              </Notice>
            ) : null}
            <Button type="submit" variant="primary" loading={loading} disabled={!email || !password} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-8 text-xs text-fg-subtle">
            Access is role-based and every administrative action is recorded in the audit log.
          </p>
        </div>
      </div>
    </div>
  );
}
