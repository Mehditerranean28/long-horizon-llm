
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from '@/hooks/use-toast';
import type { AppTranslations } from '@/lib/translations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { CopyIcon, CheckIcon } from "lucide-react";
import { useState } from "react";

interface ApiEndpointsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: AppTranslations;
}

interface MockApiEndpoint {
  id: string;
  type: 'App Endpoint (Incoming)' | 'External API Call (Outgoing)';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  examplePayload?: object;
  exampleResponse?: object; // Maybe add this later if needed
}

export function ApiEndpointsDialog({ open, onOpenChange, t }: ApiEndpointsDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const mockEndpoints: MockApiEndpoint[] = [
    {
      id: 'create-task',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/tasks',
      description: t.apiEndpointCreateTaskDescription,
      examplePayload: { query: "User's question", proto_brain_name: 'InitialProtoBrain' },
    },
    {
      id: 'task-status',
      type: 'App Endpoint (Incoming)',
      method: 'GET',
      path: '/tasks/{id}',
      description: t.apiEndpointTaskStatusDescription,
    },
    {
      id: 'ingest-document',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/ingest',
      description: t.apiEndpointIngestDocumentDescription,
      examplePayload: { attachment_name: 'file.pdf', attachment_type: 'application/pdf', attachment_data_uri: 'data:...' },
    },
    {
      id: 'ingest-audio',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/ingest/audio',
      description: t.apiEndpointIngestAudioDescription,
      examplePayload: { attachment_name: 'recording.wav', attachment_type: 'audio/wav', attachment_data_uri: 'data:...' },
    },
    {
      id: 'research-quick',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/research/quick',
      description: t.apiEndpointResearchQuickDescription,
      examplePayload: { query: 'Example topic' },
    },
    {
      id: 'research-report',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/research/report',
      description: t.apiEndpointResearchReportDescription,
      examplePayload: { query: 'Example topic', output_file: 'report.md' },
    },
    {
      id: 'video-script',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/video/script',
      description: t.apiEndpointVideoScriptDescription,
      examplePayload: { video_subject: 'cats', paragraph_number: 1 },
    },
    {
      id: 'video-terms',
      type: 'App Endpoint (Incoming)',
      method: 'POST',
      path: '/video/terms',
      description: t.apiEndpointVideoTermsDescription,
      examplePayload: { video_subject: 'cats', video_script: 'cats are great' },
    },
  ];

  const formatEndpointsForCopy = () => {
    return mockEndpoints.map(endpoint => {
      let text = `Type: ${endpoint.type}\n`;
      text += `Method: ${endpoint.method}\n`;
      text += `Path: ${endpoint.path}\n`;
      text += `Description: ${endpoint.description}\n`;
      if (endpoint.examplePayload) {
        text += `Example Payload: ${JSON.stringify(endpoint.examplePayload, null, 2)}\n`;
      }
      return text;
    }).join('\n------------------------------------\n\n');
  };

  const handleCopy = async () => {
    const textToCopy = formatEndpointsForCopy();
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast({ title: t.copySuccessTitle, description: t.apiInfoCopiedDescription, duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({ title: t.copyErrorTitle, description: t.copyErrorDescription, variant: "destructive" });
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t.apiEndpointsTitle}</DialogTitle>
          <DialogDescription>
            {t.apiEndpointsDescription}
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-grow my-4 pr-3">
          <div className="space-y-4">
            {mockEndpoints.map((endpoint) => (
              <Card key={endpoint.id} className="overflow-hidden">
                <CardHeader className="p-4 bg-muted/30">
                  <CardTitle className="text-md">{endpoint.method} {endpoint.path}</CardTitle>
                  <CardDescription className="text-xs">{endpoint.type}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 text-sm space-y-2">
                  <p><span className="font-semibold">Description:</span> {endpoint.description}</p>
                  {endpoint.examplePayload && (
                    <div>
                      <p className="font-semibold mb-1">Example Payload:</p>
                      <pre className="bg-muted p-2 rounded-md text-xs overflow-x-auto">
                        {JSON.stringify(endpoint.examplePayload, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
        
        <DialogFooter className="mt-auto pt-4 border-t">
          <Button type="button" onClick={handleCopy} variant="outline" className="mr-2">
            {copied ? <CheckIcon className="mr-2 h-4 w-4" /> : <CopyIcon className="mr-2 h-4 w-4" />}
            {copied ? t.copySuccessTitle : t.copyAllInformation}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="default">
              {t.closeSettings}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
