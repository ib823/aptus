"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BenchmarkDeltaCardProps {
  label: string;
  yourValue: number;
  benchmarkValue: number;
  unit?: string | undefined;
  higherIsBetter?: boolean | undefined;
}

export function BenchmarkDeltaCard({
  label,
  yourValue,
  benchmarkValue,
  unit = "%",
  higherIsBetter = true,
}: BenchmarkDeltaCardProps) {
  const delta = yourValue - benchmarkValue;
  const isPositive = higherIsBetter ? delta > 0 : delta < 0;
  const isNeutral = Math.abs(delta) < 0.5;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {yourValue.toFixed(1)}{unit}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            Benchmark: {benchmarkValue.toFixed(1)}{unit}
          </span>
          {!isNeutral && (
            <span
              className={`text-xs font-medium ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}{unit}{" "}
              {isPositive ? "(above)" : "(below)"}
            </span>
          )}
          {isNeutral && (
            <span className="text-xs font-medium text-muted-foreground">
              (in line)
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
