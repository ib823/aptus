"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, AlertCircle, Building2, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ABeamLogo } from "@/components/shared/ABeamLogo";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4 sm:px-6">
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <div className="text-center text-muted-foreground py-16">
              Loading...
            </div>
          }
        >
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const planParam = searchParams?.get("plan") ?? "TRIAL";

  const [form, setForm] = useState({
    orgName: "",
    fullName: "",
    email: "",
    plan: planParam,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: { message?: string };
        };
        setError(data.error?.message ?? "Signup failed");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
        <CardHeader className="text-center pb-2">
          <ABeamLogo size="lg" className="mb-6 justify-center" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <h1 className="text-xl font-semibold mb-2">Account created</h1>
            <p className="text-sm text-muted-foreground text-center mb-6">
              Check your email to verify your account and get started.
            </p>
            <Link href="/login" className="w-full">
              <Button className="w-full">Go to Login</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="text-center pb-2">
        <ABeamLogo size="lg" className="mb-6 justify-center" />
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="text-base text-muted-foreground mt-1">
          Start your free 14-day trial. No credit card required.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="org-name"
              className="block text-sm font-medium mb-1"
            >
              Organization Name
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="org-name"
                name="orgName"
                type="text"
                required
                value={form.orgName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, orgName: e.target.value }))
                }
                placeholder="Acme Consulting"
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="full-name"
              className="block text-sm font-medium mb-1"
            >
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="full-name"
                name="fullName"
                type="text"
                required
                value={form.fullName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, fullName: e.target.value }))
                }
                placeholder="Jane Smith"
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signup-email"
              className="block text-sm font-medium mb-1"
            >
              Work Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="signup-email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="jane@acme.com"
                className="pl-10"
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="mt-6 space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            By creating an account you agree to our{" "}
            <a
              href="/terms"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener"
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
