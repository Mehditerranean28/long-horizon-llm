
"use client";

import type { EvidenceSegment, EvidenceReference } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { FileText, LinkIcon, ListChecks, PuzzleIcon, NetworkIcon, DatabaseIcon, AlertCircle, CheckCircle2, Loader, Clock, Zap, Tag, GitBranch } from "lucide-react";
import { getTranslations, getSavedLanguage, type AppTranslations } from '@/lib/translations';

interface EvidencePanelProps {
  evidenceSegments: EvidenceSegment[];
  currentStatementText?: string;
  t?: AppTranslations;
}

const ReferenceIcon = ({ type }: { type: EvidenceReference['type'] }) => {
  switch (type) {
    case 'web': return <LinkIcon className="h-4 w-4 text-blue-500 mr-1.5 flex-shrink-0" />;
    case 'api': return <NetworkIcon className="h-4 w-4 text-green-500 mr-1.5 flex-shrink-0" />;
    case 'kb': return <DatabaseIcon className="h-4 w-4 text-purple-500 mr-1.5 flex-shrink-0" />;
    case 'tool': return <PuzzleIcon className="h-4 w-4 text-orange-500 mr-1.5 flex-shrink-0" />;
    default: return <ListChecks className="h-4 w-4 text-gray-500 mr-1.5 flex-shrink-0" />;
  }
};
interface StatusBadgeProps {
  status: EvidenceSegment["status"];
  t?: AppTranslations;
}

const StatusBadge = ({ status, t }: StatusBadgeProps) => {
  const tSafe = t ?? getTranslations(getSavedLanguage());
  switch (status) {
    case "SUCCESS":
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {tSafe.successLabel}
        </Badge>
      );
    case "PROCESSING":
      return (
        <Badge variant="secondary">
          <Loader className="h-3 w-3 mr-1 animate-spin" />
          {tSafe.processingLabel}
        </Badge>
      );
    case "FAILURE_RETRY":
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-600">
          <AlertCircle className="h-3 w-3 mr-1" />
          {tSafe.retryingLabel}
        </Badge>
      );
    case "FAILURE_ABORT":
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" />
          {tSafe.failureLabel}
        </Badge>
      );
    case "RESOURCE_EXCEEDED":
      return (
        <Badge variant="destructive">
          <Zap className="h-3 w-3 mr-1" />
          {tSafe.failureLabel}
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};



export function EvidencePanel({ evidenceSegments, currentStatementText, t }: EvidencePanelProps) {
  const tSafe = t ?? getTranslations(getSavedLanguage());

  const isMocked = evidenceSegments.every(
    (seg) => seg.protoBrainVersionUsed && seg.protoBrainVersionUsed.includes('.mock')
  );

  if (evidenceSegments.length === 0) {
    return (
      <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center text-base font-semibold"><FileText className="mr-2 h-5 w-5 text-primary" /> {tSafe.evidenceTrailTitle}</CardTitle>
        {isMocked && (
          <CardDescription>{tSafe.mockedResultsLabel}</CardDescription>
        )}
        {currentStatementText && (
          <CardDescription>
            Context: &quot;{currentStatementText}&quot;
          </CardDescription>
        )}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{tSafe.noEvidenceMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
    } catch (e) {
      return tSafe.invalidDate;
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center text-base font-semibold"><FileText className="mr-2 h-5 w-5 text-primary" /> {tSafe.evidenceTrailTitle}</CardTitle>
        {isMocked && (
          <CardDescription>{tSafe.mockedResultsLabel}</CardDescription>
        )}
        {currentStatementText && (
          <CardDescription>
            Context: &quot;{currentStatementText.substring(0, 100)}
            {currentStatementText.length > 100 ? '...' : ''}&quot;
          </CardDescription>
        )}
      </CardHeader>
      <ScrollArea className="flex-grow">
        <CardContent className="space-y-2 p-2">
          <Accordion type="multiple" defaultValue={evidenceSegments.map(seg => seg.id)} className="w-full">
            {evidenceSegments.map((segment) => (
              <AccordionItem value={segment.id} key={segment.id} className="mb-1 border bg-card rounded-md shadow-sm">
                <AccordionTrigger className="p-2.5 hover:bg-muted/50 rounded-t-md text-sm">
                  <div className="flex flex-col text-left w-full">
                     <div className="flex justify-between items-center w-full">
                        <span className="font-semibold text-primary truncate pr-2">{segment.title}</span>
                        <StatusBadge status={segment.status} t={tSafe} />
                     </div>
                     {segment.summary && <p className="text-xs text-muted-foreground mt-0.5 text-left">{segment.summary}</p>}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-2.5 border-t text-xs space-y-2">
                  {segment.llmReasoningPath && (
                    <div>
                      <h5 className="font-medium text-xs mb-0.5 text-foreground/80">Reasoning Path:</h5>
                      <p className="p-1.5 bg-muted/30 rounded whitespace-pre-wrap text-xxs">{segment.llmReasoningPath}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xxs text-muted-foreground">
                    <span><Clock className="h-3 w-3 inline mr-1" />Start: {formatDateTime(segment.timestampStart)}</span>
                    <span><Clock className="h-3 w-3 inline mr-1" />End: {formatDateTime(segment.timestampEnd)}</span>
                    <span><Zap className="h-3 w-3 inline mr-1" />Duration: {segment.durationMs !== undefined ? `${segment.durationMs}ms` : 'N/A'}</span>
                    <span><Zap className="h-3 w-3 inline mr-1" />Tokens: {segment.tokensConsumed !== undefined ? segment.tokensConsumed : 'N/A'}</span>
                    <span><GitBranch className="h-3 w-3 inline mr-1" />Proto-Brain: {segment.protoBrainVersionUsed || 'N/A'}</span>
                    {segment.attemptNumber && segment.attemptNumber > 1 && (
                      <span>{tSafe.attemptLabel}: {segment.attemptNumber}</span>
                    )}
                    {segment.retrievalScore !== undefined && (
                      <span>Score: {segment.retrievalScore.toFixed(2)}</span>
                    )}
                  </div>

                  {segment.errors && segment.errors.length > 0 && (
                    <div>
                      <h5 className="font-medium text-xs mb-0.5 text-destructive">Errors:</h5>
                      <ul className="list-disc list-inside pl-2 text-destructive text-xxs">
                        {segment.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                      </ul>
                    </div>
                  )}

                  {segment.references && segment.references.length > 0 && (
                    <div>
                      <h5 className="font-medium text-xs mt-1.5 mb-0.5 text-foreground/80">References:</h5>
                      <Accordion type="multiple" className="w-full text-xxs">
                        {['tool', 'web', 'api', 'kb'].map(refType => {
                          const filteredRefs = segment.references.filter(ref => ref.type === refType);
                          if (filteredRefs.length === 0) return null;
                          return (
                            <AccordionItem value={`${segment.id}-${refType}`} key={`${segment.id}-${refType}`} className="border-b-0 last:border-b-0">
                              <AccordionTrigger className="py-1 px-1 text-xxs text-muted-foreground hover:text-accent [&[data-state=open]>svg]:text-accent">
                                {refType.charAt(0).toUpperCase() + refType.slice(1)} ({filteredRefs.length})
                              </AccordionTrigger>
                              <AccordionContent className="pt-0.5 pb-0.5 pl-3 text-xxs">
                                <ul className="list-none space-y-0.5">
                                  {filteredRefs.map((ref, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <ReferenceIcon type={ref.type} />
                                      <span className="ml-1">
                                        {ref.description}
                                        {ref.url && <a href={ref.url} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500 hover:underline">(link)</a>}
                                        {ref.details && <span className="block text-muted-foreground/70 italic whitespace-pre-wrap">{ref.details}</span>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
