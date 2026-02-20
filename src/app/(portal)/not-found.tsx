import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FileQuestion className="w-12 h-12 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-950 mb-2">Page Not Found</h2>
      <p className="text-base text-gray-600 mb-6 max-w-md">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/assessments">
        <Button>Back to Assessments</Button>
      </Link>
    </div>
  );
}
