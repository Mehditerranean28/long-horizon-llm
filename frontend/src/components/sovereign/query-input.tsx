
"use client";

import { useState, type FormEvent, useEffect, useRef, ChangeEvent, ClipboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SendIcon, Loader2, FileUp, Camera, Disc3, ImageIcon, GlobeIcon, PenToolIcon, BrainCircuitIcon, SearchIcon, XIcon, Mic, type LucideIcon } from "lucide-react"; // Added XIcon and LucideIcon type
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { MAX_ATTACHMENT_SIZE_BYTES } from '@/constants/attachments';
import { ingestAudio } from "@/api/client";
import type { AppTranslations } from '@/lib/translations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// animated bars styles
import "@/styles/listening.css";

interface QueryInputProps {
  onSubmit: (
    query: string,
    attachment?: { name: string; type: string; dataUri?: string } | null,
    skillName?: string | null
  ) => void;
  isLoading: boolean;
  onTokenCountChange: (count: number) => void;
  simpleMode: boolean;
  onToggleSimpleMode: () => void;
  t: AppTranslations;
}

// SVG Icon for Plus (Attach) - from user's HTML
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M8.25 15.75V9.75H2.25C1.83579 9.75 1.5 9.41421 1.5 9C1.5 8.58579 1.83579 8.25 2.25 8.25H8.25V2.25C8.25 1.83579 8.58579 1.5 9 1.5C9.41421 1.5 9.75 1.83579 9.75 2.25V8.25H15.75L15.8271 8.25391C16.2051 8.29253 16.5 8.61183 16.5 9C16.5 9.38817 16.2051 9.70747 15.8271 9.74609L15.75 9.75H9.75V15.75C9.75 16.1642 9.41421 16.5 9 16.5C8.58579 16.5 8.25 16.1642 8.25 15.75Z" fill="currentColor"></path>
  </svg>
);

// SVG Icon for Skills - from user's HTML
const SkillIconSvg = () => ( // Renamed to avoid conflict with LucideIcon type
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6.58301 12.9966C6.58285 11.8002 5.61336 10.8308 4.41699 10.8306C3.22048 10.8306 2.25016 11.8001 2.25 12.9966C2.25 14.1932 3.22038 15.1636 4.41699 15.1636C5.61346 15.1634 6.58301 14.1931 6.58301 12.9966ZM15.542 11.5405C15.542 11.2645 15.318 11.0407 15.042 11.0405H12.125C11.8489 11.0405 11.625 11.2644 11.625 11.5405V14.4566C11.625 14.7327 11.8489 14.9566 12.125 14.9566H15.042C15.318 14.9564 15.542 14.7326 15.542 14.4566V11.5405ZM7.41797 2.01515C8.24095 0.945708 9.89121 0.981033 10.6592 2.1216L12.6865 5.13332L12.7646 5.25929C13.5201 6.57184 12.5784 8.25017 11.0273 8.2505H6.97266C5.3716 8.25016 4.41956 6.46168 5.31348 5.13332L7.34082 2.1216L7.41797 2.01515ZM9.41504 2.95949C9.22928 2.6835 8.83662 2.66628 8.625 2.90773L8.58496 2.95949L6.55859 5.97121C6.33518 6.3032 6.5726 6.75016 6.97266 6.7505H11.0273C11.4023 6.75018 11.6348 6.35728 11.4785 6.03468L11.4414 5.97121L9.41504 2.95949ZM8.08301 12.9966C8.08301 15.0215 6.44189 16.6634 4.41699 16.6636C2.39195 16.6636 0.75 15.0216 0.75 12.9966C0.750162 10.9717 2.39205 9.33058 4.41699 9.33058C6.44179 9.33076 8.08285 10.9718 8.08301 12.9966ZM17.042 14.4566C17.042 15.561 16.1464 16.4564 15.042 16.4566H12.125C11.0204 16.4566 10.125 15.5611 10.125 14.4566V11.5405C10.125 10.436 11.0204 9.54054 12.125 9.54054H15.042C16.1464 9.54072 17.042 10.4361 17.042 11.5405V14.4566Z" fill="currentColor"></path>
  </svg>
);

export function QueryInput({ onSubmit, isLoading, onTokenCountChange, simpleMode, onToggleSimpleMode, t }: QueryInputProps) {
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | null>(null);
  const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
  const [activeSkillInfo, setActiveSkillInfo] = useState<{ id: string; label: string; icon: LucideIcon } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if ((query.trim() || selectedFile || pastedImage) && !isLoading) {
      let attachmentData = null;
      if (pastedImage) {
        attachmentData = { name: "pasted_image.png", type: "image/png", dataUri: pastedImage };
      } else if (selectedFile) {
        attachmentData = { name: selectedFile.name, type: selectedFile.type, dataUri: fileDataUri || undefined };
      }
      onSubmit(query.trim(), attachmentData, activeSkillInfo?.id ?? null);
      setQuery("");
      resetAttachmentStates();
    }
  };


  const resetAttachmentStates = () => {
    setSelectedFile(null);
    setPastedImage(null);
    setFileDataUri(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  useEffect(() => {
    onTokenCountChange(query.length);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${scrollHeight}px`;
    }
  }, [query, onTokenCountChange]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast({ title: t.fileTooLargeTitle, description: t.fileTooLargeDescription, variant: 'destructive' });
        return;
      }
      setIsProcessingAttachment(true);
      setPastedImage(null);
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setFileDataUri(dataUrl);
        if (file.type.startsWith('image/')) {
          setPastedImage(dataUrl);
        }
        toast({ title: t.fileStoredTitle, description: t.fileStoredDescription });
        setIsProcessingAttachment(false);
      };
      reader.onerror = () => {
        toast({ title: t.errorPreviewingFileTitle, description: t.errorPreviewingFileDescription, variant: 'destructive' });
        setIsProcessingAttachment(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            if (blob.size > MAX_ATTACHMENT_SIZE_BYTES) {
              toast({ title: t.fileTooLargeTitle, description: t.fileTooLargeDescription, variant: 'destructive' });
              event.preventDefault();
              return;
            }
            setIsProcessingAttachment(true);
            setSelectedFile(null);
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              setFileDataUri(dataUrl);
              setPastedImage(dataUrl);
              toast({ title: t.fileStoredTitle, description: t.fileStoredDescription });
              setIsProcessingAttachment(false);
            };
            reader.onerror = () => {
              toast({ title: t.errorPastingImageTitle, description: t.errorPastingImageDescription, variant: "destructive" });
              setIsProcessingAttachment(false);
            }
            reader.readAsDataURL(blob);
            event.preventDefault();
            return;
          }
        }
      }
    }
  };

  const removeAttachment = () => {
    resetAttachmentStates();
  }

  const handleGenericMenuClick = (actionLabel: string) => {
    if (actionLabel === t.connectGoogleDrive) {
      window.open('https://drive.google.com', '_blank');
    } else if (actionLabel === t.connectMicrosoftOneDrive) {
      window.open('https://onedrive.live.com', '_blank');
    } else if (actionLabel === t.takePhoto) {
      fileInputRef.current?.click();
    }
  };

  const handleSkillMenuItemClick = (skillLabel: string, SkillIconComponent: LucideIcon) => {
    let skillId = '';
    if (skillLabel === t.createImage) skillId = 'createImage';
    else if (skillLabel === t.searchTheWeb) skillId = 'searchTheWeb';
    else if (skillLabel === t.writeOrCode) skillId = 'writeOrCode';
    else if (skillLabel === t.runDeepResearch) skillId = 'runDeepResearch';
    setActiveSkillInfo({ id: skillId, label: skillLabel, icon: SkillIconComponent });
  };

  useEffect(() => {
    if (!activeSkillInfo) return;
    const labelMap: Record<string, string> = {
      createImage: t.createImage,
      searchTheWeb: t.searchTheWeb,
      writeOrCode: t.writeOrCode,
      runDeepResearch: t.runDeepResearch,
      searchDocument: t.searchDocument,
    };
    const updatedLabel = labelMap[activeSkillInfo.id];
    if (updatedLabel && updatedLabel !== activeSkillInfo.label) {
      setActiveSkillInfo(info => info && { ...info, label: updatedLabel });
    }
  // activeSkillInfo is intentionally excluded to avoid unnecessary re-renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, activeSkillInfo?.id]);

  const handleMicClick = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast({ title: t.voiceNotSupportedTitle, variant: 'destructive' });
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any = null;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.onresult = (e: any) => {
        const transcript = e.results?.[0]?.[0]?.transcript;
        if (transcript) setQuery(q => `${q} ${transcript}`.trim());
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      recorder.start();
      recognition?.start();

      toast({
        title: (
          <span className="flex items-center gap-2">
            {t.listening}
            <ul className="listening-bars">
              <li></li>
              <li></li>
              <li></li>
              <li></li>
              <li></li>
              <li></li>
            </ul>
          </span>
        ),
        className: 'bg-blue-500 text-white',
        duration: 3000,
      });

      setTimeout(() => {
        recorder.stop();
        recognition?.stop();
      }, 3000);

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const dataUri = reader.result as string;
          try {
            await ingestAudio({
              attachment_name: `recording-${Date.now()}.wav`,
              attachment_type: 'audio/wav',
              attachment_data_uri: dataUri,
              source: 'capture',
            });
            toast({ title: t.audioStoredTitle, className: 'bg-blue-500 text-white' });
          } catch {
            toast({ title: t.audioStoreFailedTitle, variant: 'destructive' });
          }
        };
        reader.readAsDataURL(blob);
      };
    } catch {
      toast({ title: t.voiceNotSupportedTitle, variant: 'destructive' });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isLoading && !isProcessingAttachment) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const attachmentPreview = pastedImage; 
  const nonImageFileName = selectedFile && !selectedFile.type.startsWith("image/") ? selectedFile.name : null;

  return (
    <div className="p-3 bg-background border-t">
      {(attachmentPreview || nonImageFileName || (isProcessingAttachment && !pastedImage && !nonImageFileName)) && (
        <div className="mb-2 p-2 border rounded-md bg-muted/50 flex items-center justify-between max-w-md">
          <div className="flex items-center space-x-2 overflow-hidden">
            {isProcessingAttachment && !attachmentPreview && !nonImageFileName && <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />}
            {!isProcessingAttachment && attachmentPreview && (
              <Image src={pastedImage!} alt={t.attachmentPreviewAlt} width={40} height={40} className="rounded-md object-cover h-10 w-10 shrink-0" />
            )}
            {!isProcessingAttachment && nonImageFileName && (
              <FileUp className="h-6 w-6 text-muted-foreground shrink-0" />
            )}
             {isProcessingAttachment && (attachmentPreview || nonImageFileName) && <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0 ml-2" />}
            <span className="text-sm text-muted-foreground truncate">
              {selectedFile?.name || (pastedImage ? t.pastedImageLabel : "")}
            </span>
          </div>
          {!isLoading && ( 
            <Button variant="ghost" size="icon" onClick={removeAttachment} className="h-6 w-6 shrink-0">
              <XIcon className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      )}
      <div className="relative flex w-full items-end space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isLoading || isProcessingAttachment}
              title={t.attachFileTitle}
              className="shrink-0 h-9 w-9 rounded-full hover:bg-accent/50 p-2"
            >
              <PlusIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => handleGenericMenuClick(t.connectGoogleDrive)}>
              <Disc3 className="mr-2 h-4 w-4" />
              {t.connectGoogleDrive}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleGenericMenuClick(t.connectMicrosoftOneDrive)}>
              <Disc3 className="mr-2 h-4 w-4" />
              {t.connectMicrosoftOneDrive}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleGenericMenuClick(t.takePhoto)}>
              <Camera className="mr-2 h-4 w-4" />
              {t.takePhoto}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleUploadClick}>
              <FileUp className="mr-2 h-4 w-4" />
              {t.addPhotosAndFiles}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title={t.useSkillTitle}
              className="shrink-0 h-9 w-9 rounded-full hover:bg-accent/50 p-2"
              disabled={isLoading || isProcessingAttachment}
            >
              <SkillIconSvg />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>{t.skillsLabel}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleSkillMenuItemClick(t.createImage, ImageIcon)}>
              <ImageIcon className="mr-2 h-4 w-4" />
              {t.createImage}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSkillMenuItemClick(t.searchTheWeb, GlobeIcon)}>
              <GlobeIcon className="mr-2 h-4 w-4" />
              {t.searchTheWeb}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSkillMenuItemClick(t.writeOrCode, PenToolIcon)}>
              <PenToolIcon className="mr-2 h-4 w-4" />
              {t.writeOrCode}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSkillMenuItemClick(t.runDeepResearch, BrainCircuitIcon)}>
              <BrainCircuitIcon className="mr-2 h-4 w-4" />
              {t.runDeepResearch}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSkillMenuItemClick(t.searchDocument, SearchIcon)}>
              <SearchIcon className="mr-2 h-4 w-4" />
              {t.searchDocument}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {activeSkillInfo && (
          <div className="flex items-center gap-1.5">
            <div className="bg-border h-5 w-px"></div> {/* Vertical Separator */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 py-1 rounded-full text-xs flex items-center gap-1.5 bg-muted hover:bg-muted/80"
              onClick={() => setActiveSkillInfo(null)} 
              title={t.activeSkillTitle.replace('{name}', activeSkillInfo.label)}
            >
              <activeSkillInfo.icon className="h-3.5 w-3.5" />
              <span className="mx-1">{activeSkillInfo.label}</span>
              <XIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,application/pdf,application/zip,.doc,.docx,.txt,.md"
        />
        <div className="relative flex-auto flex flex-col">
            <Textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder={t.researchPlaceholder}
            className="text-base bg-transparent border-0 ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 resize-none py-2.5 px-3 min-h-[40px] max-h-40 overflow-y-auto placeholder:text-muted-foreground/70"
            rows={1}
            disabled={isLoading || isProcessingAttachment}
            aria-label={t.queryInputAriaLabel}
            />
        </div>
        <Button
          type="button"
          onClick={handleMicClick}
          disabled={isLoading || isProcessingAttachment}
          size="icon"
          aria-label={t.dictateAriaLabel}
          className="shrink-0 h-9 w-9 rounded-full hover:bg-accent/50 p-2"
        >
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={onToggleSimpleMode}
          disabled={isLoading || isProcessingAttachment}
          size="icon"
          title={t.simpleModeToggleTitle}
          className="shrink-0 h-9 w-9 rounded-full hover:bg-accent/50 p-2"
        >
          <BrainCircuitIcon className="h-4 w-4" color={simpleMode ? '#16a34a' : '#64748b'} />
        </Button>
        <Button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isLoading || isProcessingAttachment || (!query.trim() && !selectedFile && !pastedImage)}
          size="icon"
          aria-label={t.submitQuery}
          className="shrink-0 h-9 w-9 rounded-full bg-foreground text-background hover:bg-foreground/80 disabled:bg-muted disabled:text-muted-foreground"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
