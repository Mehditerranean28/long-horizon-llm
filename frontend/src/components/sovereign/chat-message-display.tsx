
"use client";

import type { ChatMessage, ContentSection, EvidenceSegment, CognitiveQueryAnalysisProtocol } from "@/types";
import { UserIcon, PlusCircleIcon, SearchIcon, FileTextIcon, CopyIcon, CheckIcon, BrainCircuit, Loader2, ClipboardList, Pen, Volume2, ThumbsUp, ThumbsDown, Share2 } from "lucide-react";
import { ThreeDotsLoading } from "@/components/ui/three-dots-loading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader as ShadTableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/utils";
import { getTranslations, getSavedLanguage, type AppTranslations } from '@/lib/translations';

// Internal component to render JSON as a collapsible tree/table
const JsonTreeView: React.FC<{ data: any; level?: number; t: AppTranslations }> = ({ data, level = 0, t }) => {
  if (data === null || data === undefined || typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return <span className="text-xs text-foreground/80">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    return (
      <Accordion type="single" collapsible className="w-full space-y-0.5 ml-2 border-l pl-2 border-muted-foreground/30">
      {data.length === 0 && <span className="text-xs italic text-muted-foreground ml-2">{t.emptyArrayLabel}</span>}
        {data.map((item, index) => (
          <AccordionItem value={`item-${index}`} key={index} className="border-b-0">
            <AccordionTrigger className="py-0.5 px-1 text-xs hover:bg-muted/50 rounded-sm w-full justify-start text-muted-foreground hover:text-accent data-[state=open]:text-accent">
              [{index}]
            </AccordionTrigger>
            <AccordionContent className="pt-0 pb-0 pl-2">
              <JsonTreeView data={item} level={level + 1} t={t} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  }

  // It's an object
  return (
    <Accordion type="multiple" className="w-full space-y-0.5 ml-2 border-l pl-2 border-muted-foreground/30" defaultValue={level === 0 ? Object.keys(data) : []}>
      {Object.keys(data).length === 0 && <span className="text-xs italic text-muted-foreground ml-2">{t.emptyObjectLabel}</span>}
      {Object.entries(data).map(([key, value]) => (
        <AccordionItem value={key} key={key} className="border-b-0">
          <AccordionTrigger className="py-0.5 px-1 text-xs hover:bg-muted/50 rounded-sm w-full justify-start text-muted-foreground hover:text-accent data-[state=open]:text-accent">
            <span className="font-semibold text-foreground/90 mr-1">{key}:</span>
          </AccordionTrigger>
          <AccordionContent className="pt-0 pb-0 pl-2">
            <JsonTreeView data={value} level={level + 1} t={t} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};


export function ChatMessageDisplay({ message, onDeepDive, onShowEvidence, originalQueryForDeepDive, onEditMessage, t }: ChatMessageDisplayProps) {
  const tSafe = t ?? getTranslations(getSavedLanguage());
  const isUser = message.role === 'user';
  const { toast } = useToast();
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

  const handleCopy = async (textToCopy: string, id: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      toast({ title: tSafe.copySuccessTitle, description: tSafe.contentCopiedDescription, duration: 2000 });
      setTimeout(() => setCopiedStates(prev => ({ ...prev, [id]: false })), 2000);
    } catch (err) {
      toast({ title: tSafe.copyErrorTitle, description: tSafe.copyErrorDescription, variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleEdit = (messageId: string, current: string) => {
    const updated = window.prompt(tSafe.editMessagePrompt, current);
    if (updated && updated !== current) {
      onEditMessage(messageId, updated);
    }
  };

  const handleSpeak = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(message.content);
      window.speechSynthesis.speak(utter);
    } else {
      toast({ title: tSafe.readingUnsupportedTitle ?? 'Speech unsupported', description: tSafe.readingUnsupportedDescription ?? 'Your browser does not support speech synthesis.', variant: 'destructive' });
    }
  };

  const handleGoodResponse = () => {
    toast({ title: tSafe.successLabel, description: tSafe.feedbackRecorded ?? 'Feedback recorded.' });
  };

  const handleBadResponse = () => {
    toast({ title: tSafe.successLabel, description: tSafe.feedbackRecorded ?? 'Feedback recorded.' });
  };

  const handleShareMessage = () => {
    handleCopy(message.content, `share-${message.id}`);
  };

  const renderContentSection = (section: ContentSection, index: number) => {
    const sectionScrollId = section.id;

    switch (section.type) {
      case 'heading':
        const HeadingTag = `h${(section.level || 0) + 2}` as keyof JSX.IntrinsicElements; // h2, h3, h4
        return (
          <div key={index} id={sectionScrollId} className="group/section flex items-center mt-3 mb-1.5 scroll-mt-20">
            <HeadingTag className="text-md font-semibold mr-2 flex-grow text-foreground"> {/* Ensure foreground color */}
              {section.text}
            </HeadingTag>
            {section.canDeepDive && (
              <Button
                variant="ghost"
                size="icon"
                className="opacity-50 group-hover/section:opacity-100 transition-opacity h-7 w-7"
                onClick={() => onDeepDive(section.text, section.text, originalQueryForDeepDive)}
                title={tSafe.deepDiveButton}
                aria-label={`${tSafe.deepDiveButton} ${section.text}`}
              >
                <PlusCircleIcon className="h-4 w-4 text-primary" />
              </Button>
            )}
          </div>
        );
      case 'paragraph':
        return (
          <div key={index} id={sectionScrollId} className="group/section flex items-start my-1.5 scroll-mt-20">
            <p className="text-sm leading-relaxed flex-grow whitespace-pre-wrap text-foreground">{section.text}</p> {/* Ensure foreground color */}
            {section.canShowEvidence && (
              <Button
                variant="ghost"
                size="icon"
                className="opacity-50 group-hover/section:opacity-100 transition-opacity ml-1 h-6 w-6"
                onClick={() => onShowEvidence(section.text, section.id, message.messageType)}
                title={tSafe.showReferencesButton}
                aria-label={`${tSafe.showReferencesButton} ${section.text.substring(0,30)}...`}
              >
                <SearchIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
              </Button>
            )}
          </div>
        );
      case 'list':
        return (
          <ul key={index} id={sectionScrollId} className="list-disc pl-5 my-1.5 space-y-0.5 scroll-mt-20 text-foreground"> {/* Ensure foreground color */}
            {section.items?.map((item, itemIndex) => (
              <li key={itemIndex} id={`${section.id}-item-${itemIndex}`} className="group/section flex items-start text-sm">
                <span className="flex-grow">{item}</span>
                 {section.canShowEvidence && (
                    <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-50 group-hover/section:opacity-100 transition-opacity ml-1 h-6 w-6"
                        onClick={() => onShowEvidence(item, `${section.id}-item-${itemIndex}`, message.messageType)}
                        title={tSafe.showReferencesButton}
                        aria-label={`${tSafe.showReferencesButton} ${item.substring(0,30)}...`}
                    >
                        <SearchIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                    </Button>
                 )}
              </li>
            ))}
          </ul>
        );
      case 'citation':
        return (
          <div key={index} id={sectionScrollId} className="my-1 text-xs text-muted-foreground italic scroll-mt-20 flex items-center">
            <FileTextIcon className="h-3 w-3 mr-1" />
            {section.text}
          </div>
        );
      case 'code':
        const codeBlockId = `code-${section.id}`;
        return (
          <div key={index} id={sectionScrollId} className="my-2 group/code-block relative scroll-mt-20">
            {section.language && (
              <div className="text-xs text-muted-foreground mb-1 pl-2">{section.language}</div>
            )}
            <pre className="bg-muted/50 p-3 rounded-md overflow-x-auto">
              <code className={`text-sm ${section.language ? `language-${section.language}` : ''} text-foreground`}> {/* Ensure foreground color */}
                {section.text}
              </code>
            </pre>
            <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-7 w-7 opacity-50 group-hover/code-block:opacity-100 transition-opacity"
                onClick={() => handleCopy(section.text, codeBlockId)}
                title={copiedStates[codeBlockId] ? tSafe.copySuccessTitle : tSafe.copyCode}
              >
                {copiedStates[codeBlockId] ? <CheckIcon className="h-4 w-4 text-green-500" /> : <CopyIcon className="h-4 w-4" />}
            </Button>
          </div>
        );
      default:
        return <p key={index} id={sectionScrollId} className="text-sm my-1.5 scroll-mt-20 whitespace-pre-wrap text-foreground">{section.text}</p>; {/* Ensure foreground color */}
    }
  };

  const renderCognitiveAnalysisTable = (
    analysisData: CognitiveQueryAnalysisProtocol | null | undefined,
  ) => {
    if (!analysisData) return <p className="text-sm text-muted-foreground">{tSafe.noAnalysisDataMessage}</p>;
    return (
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="cognitive-analysis">
          <AccordionTrigger className="p-2 text-sm font-medium bg-muted/60 hover:bg-muted rounded-md w-full justify-start">
            <BrainCircuit className="h-4 w-4 mr-2 text-primary" />
            {tSafe.cognitiveAnalysisDetails}
          </AccordionTrigger>
          <AccordionContent className="p-1 pt-2">
            <div className="max-h-96 overflow-y-auto">
              <Table className="table-fixed">
                <ShadTableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">{tSafe.tableKeyHeader}</TableHead>
                    <TableHead className="w-2/3">{tSafe.tableValueHeader}</TableHead>
                  </TableRow>
                </ShadTableHeader>
                <TableBody>
                  {Object.entries(analysisData).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="font-medium align-top py-1.5 pr-1 break-words">{key}</TableCell>
                      <TableCell className="py-1.5 pl-1">
                         {typeof value === 'object' && value !== null ? (
                           <JsonTreeView data={value} t={tSafe} />
                         ) : (
                           <pre className="whitespace-pre-wrap text-xs bg-muted/30 p-1.5 rounded-sm break-words text-foreground"> {/* Ensure foreground color */}
                            {String(value)}
                           </pre>
                         )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const messageContentId = `message-content-${message.id}`;

  let mainContent: ReactNode;
  let showReferencesLink = false;

  if (message.isLoading && message.messageType === 'cognitive_analysis_loading') {
    mainContent = (
      <div className="flex items-center space-x-2 text-primary p-3">
        <BrainCircuit className="h-5 w-5 animate-pulse" />
        <p className="text-sm">{tSafe.analyzingYourQuery}</p>
      </div>
    );
  } else if (message.isLoading && message.messageType === 'clarification_loading') {
    mainContent = (
      <div className="flex items-center space-x-2 text-primary p-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">{tSafe.formulatingUnderstanding}</p>
      </div>
    );
  } else if (message.isLoading) {
    mainContent = (
      <div className="flex items-center justify-center p-3 text-primary">
        <ThreeDotsLoading />
      </div>
    );
  } else if (message.messageType === 'cognitive_analysis_table') {
    mainContent = renderCognitiveAnalysisTable(message.cognitiveAnalysisData);
    showReferencesLink = true;
  } else if (message.parsedContent && message.parsedContent.sections.length > 0) {
     mainContent = message.parsedContent.sections.map(renderContentSection);
     if (message.messageType === 'clarification_questions' || message.messageType === 'deep_research_summary') {
       showReferencesLink = true;
     }
  } else {
     mainContent = (
       <>
        <p className={cn("text-base whitespace-pre-wrap", isUser ? "" : "text-foreground")}>
          {message.content}
        </p>
        {message.attachmentPreviewUrl && (
          <div className="mt-2">
            <Image src={message.attachmentPreviewUrl} alt={message.attachmentName || tSafe.attachmentPreviewAlt} width={200} height={200} className="rounded-md object-cover"/>
            {message.attachmentName && <p className="text-xs text-muted-foreground mt-1">{message.attachmentName}</p>}
          </div>
        )}
       </>
     );
     if (!isUser) showReferencesLink = true;
  }


  return (
    <div className={cn("flex", isUser ? 'py-3 justify-end' : 'py-1.5 justify-start')}> {/* Reduced py for assistant */}
      <div className={cn(
          "group/message-card relative flex items-center", // items-center for vertical alignment with side buttons
          isUser ? 'flex-row-reverse space-x-reverse space-x-1' : 'flex-row space-x-1'
      )}>
        <Card
          id={`message-card-${message.id}`}
          className={cn(
            "shadow-md",
            isUser 
              ? 'bg-muted text-muted-foreground rounded-3xl max-w-[70%] px-4 py-2' 
              : 'bg-card text-card-foreground rounded-lg max-w-3xl' // Assistant card
          )}
        >
          <CardContent className={cn(isUser ? 'p-0' : 'p-3')}>
            {mainContent}
            {!isUser && showReferencesLink && message.mockEvidenceSegments && message.mockEvidenceSegments.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <Button
                  variant="link"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-primary p-0 h-auto"
                  onClick={() => onShowEvidence(message.content, message.id, message.messageType)}
                >
                  <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> {tSafe.showReferencesButton}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {!message.isLoading && (
            <div className={cn(
              "flex flex-col items-center space-y-0.5 opacity-0 group-hover/message-card:opacity-70 transition-opacity",
              // "self-start pt-1" // Align to top of the card
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={() => handleEdit(message.id, message.content)}
                title={tSafe.editMessageButton}
              >
                <Pen className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={handleGoodResponse}
                title={tSafe.goodResponseButton}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={handleBadResponse}
                title={tSafe.badResponseButton}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={handleSpeak}
                title={tSafe.readAloudButton}
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={() => handleCopy(message.content, messageContentId)}
                title={copiedStates[messageContentId] ? tSafe.copySuccessTitle : tSafe.copyRawMessage}
              >
                {copiedStates[messageContentId] ? <CheckIcon className="h-3.5 w-3.5 text-green-500" /> : <CopyIcon className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent/50"
                onClick={handleShareMessage}
                title={tSafe.shareMessageButton}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
            </div>
        )}
      </div>
    </div>
  );
}

interface ChatMessageDisplayProps {
  message: ChatMessage;
  onDeepDive: (sectionTitle: string, sectionText: string, originalQuery?: string) => void;
  onShowEvidence: (statementText: string, sectionIdOrMessageId: string | undefined, messageType: ChatMessage['messageType'], customEvidence?: EvidenceSegment[]) => void;
  originalQueryForDeepDive?: string;
  onEditMessage: (id: string, newContent: string) => void;
  t?: AppTranslations;
}

    