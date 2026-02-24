import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
        <FileQuestion className="w-16 h-16 text-muted-foreground/40 mx-auto mb-6" />
        <h1 className="text-4xl font-bold text-foreground mb-2">Page not found</h1>
        <p className="text-base text-muted-foreground mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/dashboard">
            <Button size="lg">Go to Dashboard</Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" size="lg">Sign In</Button>
          </Link>
        </div>
        <p className="mt-8 text-sm text-muted-foreground/60">aptus</p>
      </div>
    </main>
  );
}
