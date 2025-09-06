
"use client";

import { Clock } from "lucide-react";
import type { AppTranslations } from '@/lib/translations';

interface BudgetTelemetryProps {
  currentUserMessagesTokenCount: number;
  sessionDurationMs: number;
  lastStepDurationMs: number | null;
  tokensUsed: number;
  tokenBudget: number;
  timeUsed: number;
  timeBudget: number;
  correlationId?: string | null;
  t: AppTranslations;
}

export function BudgetTelemetry({
  currentUserMessagesTokenCount,
  sessionDurationMs,
  lastStepDurationMs,
  tokensUsed,
  tokenBudget,
  timeUsed,
  timeBudget,
  correlationId,
  t,
}: BudgetTelemetryProps) {

  const formatSessionDuration = (ms: number) => {
    if (ms < 0) return "0s";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formattedTime = "";
    if (hours > 0) {
      formattedTime += `${hours}h `;
    }
    if (minutes > 0 || hours > 0) {
      formattedTime += `${minutes}m `;
    }
    formattedTime += `${seconds}s`;
    return formattedTime.trim();
  };

  const formatStepDuration = (ms: number | null) => {
    if (ms === null || ms < 0) return "N/A";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formattedTokensRemaining = `${Math.max(tokenBudget - tokensUsed, 0)}`;
  const formattedTimeRemaining = formatSessionDuration((timeBudget - timeUsed) * 1000);
  const formattedTokensUsed = `${tokensUsed}/${tokenBudget}`;
  const formattedTimeUsed = `${formatSessionDuration(timeUsed * 1000)}/${formatSessionDuration(timeBudget * 1000)}`;

  return (
    <div className="flex items-center space-x-2 text-xs text-muted-foreground p-1.5 rounded-md shadow-sm border bg-card">
      <Clock className="h-4 w-4 text-primary shrink-0" />
      <div className="flex flex-col md:flex-row md:space-x-2 items-center">
        {correlationId && (
          <>
            <span className="whitespace-nowrap">{t.runIdLabel}: {correlationId}</span>
            <span className="hidden md:inline">|</span>
          </>
        )}
        <span className="whitespace-nowrap">{t.inputTokensLabel}: {currentUserMessagesTokenCount}</span>
        <span className="hidden md:inline">|</span>
        <span className="whitespace-nowrap">{t.usageLabel}: {formattedTokensUsed}</span>
        <span className="hidden md:inline">|</span>
        <span className="whitespace-nowrap">{t.remainingLabel}: {formattedTokensRemaining}</span>
        <span className="hidden md:inline">|</span>
        <span className="whitespace-nowrap">{t.lastStepLabel}: {formatStepDuration(lastStepDurationMs)}</span>
        <span className="hidden md:inline">|</span>
        <span className="whitespace-nowrap">{t.timeLabel}: {formattedTimeUsed}</span>
        <span className="hidden md:inline">|</span>
        <span className="whitespace-nowrap">{t.timeLeftLabel}: {formattedTimeRemaining}</span>
      </div>
    </div>
  );
}
