"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BoundLogo } from "@/components/shared/BoundLogo";
import { UI_TEXT } from "@/constants/ui-text";
import { signIn } from "next-auth/react";

function LoginForm() {
  const searchParams = useSearchParams();
  const isVerify = searchParams.get("verify") === "true";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(isVerify);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);

      await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/assessments",
      });

      setSent(true);
      setLoading(false);
    },
    [email],
  );

  return (
    <Card className="shadow-md border-gray-200">
      <CardHeader className="text-center pb-2">
        <BoundLogo size="lg" className="mb-6" />
        <h1 className="text-2xl font-bold text-gray-950">
          {sent ? UI_TEXT.auth.magicLinkSent : UI_TEXT.auth.loginTitle}
        </h1>
        <p className="text-base text-gray-600 mt-1">
          {sent ? UI_TEXT.auth.magicLinkDescription : UI_TEXT.auth.loginSubtitle}
        </p>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-center py-6">
            <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
            <p className="text-sm text-gray-500">
              {UI_TEXT.auth.magicLinkDescription}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={UI_TEXT.auth.emailPlaceholder}
                  className="pl-10 h-11"
                  required
                  autoFocus
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11"
              disabled={!email || loading}
            >
              {loading ? "Sending..." : UI_TEXT.auth.sendMagicLink}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
