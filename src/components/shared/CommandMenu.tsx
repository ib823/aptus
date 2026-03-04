"use client";

import * as React from "react";
import { useRouter, useParams } from "next/navigation";
import {
  FileText,
  Search,
  LayoutDashboard,
  Settings,
  Users,
  Shield,
  FileSearch,
  BookOpen,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

interface SearchResult {
  id: string;
  title: string;
  href: string;
  type: string;
  status?: string;
}

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{
    scopeItems: SearchResult[];
    assessments: SearchResult[];
  }>({ scopeItems: [], assessments: [] });
  const [loading, setLoading] = React.useState(false);
  
  const router = useRouter();
  const params = useParams();
  const assessmentId = params?.id as string | undefined;

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (query.length < 2) {
      setResults({ scopeItems: [], assessments: [] });
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          const data = json.data;
          
          // If we are in an assessment context, transform scope item links to the review page
          if (assessmentId && data.scopeItems) {
            data.scopeItems = data.scopeItems.map((item: SearchResult) => ({
              ...item,
              href: `/assessment/${assessmentId}/review/${item.id}`,
            }));
          }
          
          setResults(data || { scopeItems: [], assessments: [] });
        }
      } catch (err) {
        console.error("Search fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, assessmentId]);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border rounded-md hover:bg-muted transition-colors ml-4 mr-2"
        aria-label="Search or run command"
      >
        <Search className="size-3" />
        <span>Search...</span>
        <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Type a scope ID (e.g. J60) or company name..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>
          
          {(results.scopeItems.length > 0 || results.assessments.length > 0) && (
            <>
              {results.scopeItems.length > 0 && (
                <CommandGroup heading="Scope Items (SAP Catalog)">
                  {results.scopeItems.map((item) => (
                    <CommandItem
                      key={item.id}
                      onSelect={() => runCommand(() => router.push(item.href))}
                    >
                      <FileSearch className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                      {assessmentId && <Badge variant="outline" className="ml-auto text-[10px]">Current Assessment</Badge>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.assessments.length > 0 && (
                <CommandGroup heading="Assessments">
                  {results.assessments.map((item) => (
                    <CommandItem
                      key={item.id}
                      onSelect={() => runCommand(() => router.push(item.href))}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span>{item.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground uppercase">{item.status?.replace('_', ' ')}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              <CommandSeparator />
            </>
          )}

          <CommandGroup heading="Quick Navigation">
            <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
              <LayoutDashboard className="mr-2 h-4 w-4" />
              <span>Dashboard</span>
              <CommandShortcut>⌘D</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/assessments"))}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Assessments List</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/organization"))}>
              <Users className="mr-2 h-4 w-4" />
              <span>Organization Settings</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          
          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => runCommand(() => router.push("/settings/profile"))}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Personal Profile</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => router.push("/admin"))}>
              <Shield className="mr-2 h-4 w-4" />
              <span>Admin Console</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Minimal Badge for the CommandItem
function Badge({ children, variant, className }: { children: React.ReactNode, variant?: string, className?: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded-full border font-medium ${className} ${
      variant === "outline" ? "text-muted-foreground border-border" : "bg-primary text-primary-foreground"
    }`}>
      {children}
    </span>
  );
}
