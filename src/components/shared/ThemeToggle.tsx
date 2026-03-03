"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Switch both next-themes and UI5 web component themes */
function applyTheme(theme: string) {
  // Dynamic import to avoid SSR issues with UI5 theme API
  void import("@ui5/webcomponents-base/dist/config/Theme.js").then(({ setTheme: setUi5Theme }) => {
    setUi5Theme(theme === "dark" ? "sap_horizon_dark" : "sap_horizon");
  });
}

export function ThemeToggle() {
  const { setTheme } = useTheme();

  const handleSetTheme = (theme: string) => {
    setTheme(theme);
    if (theme !== "system") {
      applyTheme(theme);
    } else {
      // For system, detect preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9">
          <Sun className="size-4 rotate-0 scale-100 transition-transform" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleSetTheme("light")}>
          <Sun className="size-4 mr-2" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme("dark")}>
          <Moon className="size-4 mr-2" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleSetTheme("system")}>
          <Monitor className="size-4 mr-2" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
