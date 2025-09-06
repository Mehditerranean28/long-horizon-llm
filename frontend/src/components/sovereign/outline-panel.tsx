
"use client";

import type { ChatMessage, CognitiveQueryAnalysisProtocol } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { ListTree, MessageSquareText, BrainCircuit, HelpCircleIcon, UserIcon, SaveIcon, CopyIcon, DownloadIcon, CheckIcon, Share2, CornerDownLeft, MinusSquare, FileTextIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { formatConversationForExport } from "@/lib/conversation-formatter";
import { cn } from "@/utils";
import type { AppTranslations } from '@/lib/translations';

interface OutlinePanelProps {
  messages: ChatMessage[];
  onOutlineItemClick: (elementId: string) => void;
  currentConversationId: string;
  t: AppTranslations;
}

export function OutlinePanel({ messages, onOutlineItemClick, currentConversationId, t }: OutlinePanelProps) {
  const { toast } = useToast();
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [openOutlineItems, setOpenOutlineItems] = useState<string[]>([]);

  const displayMessages = messages.filter(msg => !msg.isLoading ||
    (msg.isLoading && (msg.messageType === 'cognitive_analysis_table' || msg.messageType === 'clarification_questions' || msg.messageType === 'deep_research_summary')));

  useEffect(() => {
    // Collapse all items when the messages array changes (new query cycle) or conversation ID changes
    setOpenOutlineItems([]);
  }, [messages.length, currentConversationId]);


  const handleCopyToClipboard = async (textToCopy: string, id: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      toast({ title: t.copySuccessTitle, description: successMessage, duration: 2000 });
      setTimeout(() => setCopiedStates(prev => ({ ...prev, [id]: false })), 2000);
    } catch (err) {
      toast({ title: t.copyErrorTitle, description: t.copyErrorDescription, variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  const handleSaveAsTxt = () => {
    const conversationText = formatConversationForExport(messages);
    const blob = new Blob([conversationText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, -5);
    link.download = `Sovereign-Conversation-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: t.savedSuccessTitle, description: t.savedSuccessDescription, duration: 3000 });
  };

  const getShareableLink = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${window.location.pathname}?id=${currentConversationId}`;
    }
    return "";
  };

  const shareDialogId = "share-link-dialog";

  if (displayMessages.length === 0) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-4 border-b">
          <CardTitle className="flex items-center text-base font-semibold"><ListTree className="mr-2 h-4 w-4 text-primary" /> {t.conversationOutlineTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
          <p className="text-muted-foreground">{t.waitingForFirstResponse}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3 px-4 border-b">
        <CardTitle className="flex items-center text-base font-semibold"><ListTree className="mr-2 h-4 w-4 text-primary" /> {t.conversationOutlineTitle}</CardTitle>
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Collapse All" onClick={() => setOpenOutlineItems([])}>
            <MinusSquare className="h-4 w-4 text-primary/80" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t.saveConversationTitle}>
                <SaveIcon className="h-4 w-4 text-primary/80" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.saveConversationTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t.saveConversationDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-0">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCopyToClipboard(formatConversationForExport(messages), 'copy-conversation', t.conversationCopiedDescription)}>
                  {copiedStates['copy-conversation'] ? <CheckIcon className="mr-2 h-4 w-4" /> : <CopyIcon className="mr-2 h-4 w-4" />}
                  {copiedStates['copy-conversation'] ? t.copySuccessTitle : t.copyToClipboard}
                </AlertDialogAction>
                <AlertDialogAction onClick={handleSaveAsTxt} className="bg-green-600 hover:bg-green-700">
                  <DownloadIcon className="mr-2 h-4 w-4" /> {t.saveAsTxt}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t.shareConversationButton}>
                <Share2 className="h-4 w-4 text-primary/80" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.shareConversationLinkTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t.shareConversationLinkDescription}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-4 p-2 bg-muted rounded-md text-sm overflow-x-auto">
                {getShareableLink()}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleCopyToClipboard(getShareableLink(), shareDialogId, t.linkCopiedDescription)}>
                  {copiedStates[shareDialogId] ? <CheckIcon className="mr-2 h-4 w-4" /> : <CopyIcon className="mr-2 h-4 w-4" />}
                  {copiedStates[shareDialogId] ? t.copySuccessTitle : t.copyLink}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <ScrollArea className="flex-grow">
        <CardContent className="p-2">
          <Accordion
            type="multiple"
            className="w-full"
            value={openOutlineItems}
            onValueChange={setOpenOutlineItems}
          >
            {displayMessages.map((msg, msgIndex) => {
              const isLastMessage = msgIndex === displayMessages.length - 1;
              if (msg.isLoading && (msg.messageType === 'cognitive_analysis_loading' || msg.messageType === 'clarification_loading')) return null;

              let title = "Message";
              let icon = <MessageSquareText className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
              let subItems: { id: string; text: string; level?: number; value?: any }[] = [];
              
              if (msg.role === 'user') {
                title = `User: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`;
                icon = <UserIcon className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
                if (msg.attachmentName) {
                    subItems.push({id: `msg-att-${msg.id}`, text: `Attachment: ${msg.attachmentName}`});
                }
              } else { // Assistant message
                if (msg.messageType === 'cognitive_analysis_table' && msg.cognitiveAnalysisData) {
                  title = "Meta Data"; 
                  icon = <BrainCircuit className="mr-2 h-4 w-4 text-primary shrink-0" />;
                  subItems = Object.entries(msg.cognitiveAnalysisData).map(([key, value]) => ({
                    id: `message-card-${msg.id}`, 
                    text: key,
                    value: value
                  }));
                } else if (msg.messageType === 'clarification_questions') {
                  title = "Clarification"; 
                  icon = <HelpCircleIcon className="mr-2 h-4 w-4 text-primary shrink-0" />; 
                  subItems = msg.parsedContent?.sections
                    .filter(s => s.type === 'heading')
                    .map(s => ({ id: s.id, text: s.text, level: s.level })) || [];
                } else if (msg.messageType === 'deep_research_summary') {
                  title = "Deep Research Summary";
                  icon = <MessageSquareText className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
                  subItems = msg.parsedContent?.sections
                    .filter(s => s.type === 'heading')
                    .map(s => ({ id: s.id, text: s.text, level: s.level })) || [];
                } else if (msg.parsedContent && msg.parsedContent.sections.some(s => s.type === 'heading')) {
                  title = msg.parsedContent.sections.find(s => s.type === 'heading')?.text || "Assistant's Detailed Response";
                  icon = <MessageSquareText className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
                  subItems = msg.parsedContent.sections
                    .filter(s => s.type === 'heading')
                    .map(s => ({ id: s.id, text: s.text, level: s.level })) || [];
                } else if (msg.content) {
                  title = `Assistant: ${msg.content.substring(0, 30)}${msg.content.length > 30 ? '...' : ''}`;
                  icon = <MessageSquareText className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
                } else {
                  title = "Assistant Processing...";
                  icon = <MessageSquareText className="mr-2 h-4 w-4 text-primary/80 shrink-0" />;
                }
              }

              return (
                <AccordionItem value={`msg-${msg.id}`} key={`msg-${msg.id}`} className="border-b group relative">
                   <div className="absolute left-0 top-0 bottom-0 flex items-center pl-1 pointer-events-none">
                    <div className="flex flex-col items-center h-full w-3">
                      <div className={cn("w-px bg-border flex-grow", msgIndex === 0 ? "mt-[1.125rem]" : "")}></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-border my-0.5 group-hover:bg-primary transition-colors"></div>
                      <div className={cn("w-px bg-border flex-grow", isLastMessage ? "mb-[1.125rem]" : "")}></div>
                    </div>
                  </div>
                  <AccordionTrigger
                    onClick={() => onOutlineItemClick(`message-card-${msg.id}`)}
                    className="text-sm hover:text-primary focus:outline-none focus:text-primary rounded p-2 pl-6 hover:bg-accent/10 w-full text-left [&[data-state=open]>svg]:text-accent"
                    aria-label={`Scroll to ${title}`}
                  >
                    <div className="flex items-center min-w-0">
                      {icon}
                      <span className="truncate flex-grow">{title}</span>
                    </div>
                  </AccordionTrigger>
                  {subItems.length > 0 && (
                    <AccordionContent className="pl-10 pr-2 py-1 bg-muted/20 rounded-b-md">
                      <ul className="space-y-0.5 w-full">
                        {subItems.map((item, itemIndex) => (
                          <li key={`${msg.id}-${item.id}-${item.text}-${itemIndex}`} className="overflow-hidden group/subitem relative">
                             <div className="absolute left-0 top-0 bottom-0 flex items-center pl-1 pointer-events-none">
                                <div className="flex flex-col items-center h-full w-3">
                                  <div className={cn("w-px bg-border/70 flex-grow", itemIndex === 0 ? "mt-[0.625rem]" : "")}></div>
                                  <div className="w-1 h-1 rounded-full bg-border/70 my-0.5 group-hover/subitem:bg-primary/70 transition-colors"></div>
                                  <div className={cn("w-px bg-border/70 flex-grow", itemIndex === subItems.length-1 ? "mb-[0.625rem]" : "")}></div>
                                </div>
                              </div>
                            <button
                              onClick={() => onOutlineItemClick(item.id)}
                              className={cn(
                                "block w-full text-left text-xs hover:text-primary focus:outline-none focus:text-primary rounded p-1 pl-5 hover:bg-accent/20 truncate",
                                item.level === 1 ? 'font-medium' : '',
                                item.level === 2 ? 'ml-2' : '',
                                item.level === 3 ? 'ml-4' : ''
                              )}
                              title={item.text}
                            >
                              {item.text}
                            </button>
                            {msg.messageType === 'cognitive_analysis_table' && typeof item.value !== 'undefined' && (
                              <div className="mt-1 pl-5 text-xxs max-w-full">
                                {typeof item.value === 'object' && item.value !== null ? (
                                  <pre className="bg-muted/40 p-1 rounded whitespace-pre-wrap overflow-x-auto">
                                    {JSON.stringify(item.value, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-muted-foreground whitespace-normal break-all">{String(item.value)}</span>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  )}
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
