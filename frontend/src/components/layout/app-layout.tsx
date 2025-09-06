
"use client";

import { QueryInput } from '@/components/sovereign/query-input';
import { ChatMessageDisplay } from '@/components/sovereign/chat-message-display';
import { EvidencePanel } from '@/components/sovereign/evidence-panel';
import { OutlinePanel } from '@/components/sovereign/outline-panel';
import { BudgetTelemetry } from '@/components/sovereign/budget-telemetry';
import { DeepResearchVisualizer } from '@/components/sovereign/deep-research-visualizer';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { UserAccountDialog } from '@/components/user/user-account-dialog';
import { ArchiveDialog } from '@/components/research/ArchiveDialog';
import { LoginDialog } from '@/components/auth/login-dialog';
import { RegisterDialog } from '@/components/auth/register-dialog';
import { ChatHistoryPanel } from '@/components/layout/chat-history-panel';

import { useSovereignChat } from '@/hooks/use-sovereign-chat';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatSession } from '@/types/chat-session';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from '@/components/ui/button';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ListTreeIcon, SearchIcon as EvidenceIconLucide, Workflow, Settings, UserCircle2, Archive as ArchiveIcon, Maximize, Minimize, LogIn, UserPlus, PanelLeftOpen, PanelLeftClose, PanelRightOpen, PanelRightClose, Palette, PlusCircle, BrainCircuitIcon, ChevronDown, Menu } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { WEBSOCKET_MAX_RECONNECTS_EVENT } from '@/api/websocket';
import { API_BASE_URL } from '@/constants/api';
import type { ChatMessage, EvidenceSegment } from '@/types';
import { cn } from "@/utils";
import { useToast } from '@/hooks/use-toast';
import { getTranslations, getSavedLanguage, type LanguageCode, type AppTranslations, translations } from '@/lib/translations';
import LanguageSelector from '@/components/ui/language-selector';
import { v4 as uuidv4 } from 'uuid';
import Image from 'next/image';
import { checkBackendConnectivity } from '@/monitoring/backend';
import { checkLocalLlmConnectivity } from '@/monitoring/local-llm';
import { ThreeDotsLoading } from '@/components/ui/three-dots-loading';

export type Theme =
  | "ultra-white"
  | "theme-dune"
  | "theme-warhammer-ultramarines"
  | "theme-dracula"
  | "theme-tron"
  | "theme-dow"
  | "dark"
  | "theme-matrix"
  | "theme-blade-runner"
  | "theme-wall-e"
  | "theme-wes-anderson"
  | "theme-evangelion"
  | "theme-westworld"
  | "theme-severance"
  | "theme-fringe"
  | "theme-helix"
  | "theme-chaos-marines"
  | "theme-high-contrast"
  | "theme-dyslexia";


const knownThemeClasses: Theme[] = [
  "dark",
  "theme-dune",
  "theme-dracula",
  "theme-warhammer-ultramarines",
  "theme-tron",
  "theme-dow",
  "theme-matrix",
  "theme-blade-runner",
  "theme-wall-e",
  "theme-wes-anderson",
  "theme-evangelion",
  "theme-westworld",
  "theme-severance",
  "theme-fringe",
  "theme-helix",
  "theme-chaos-marines",
  "theme-high-contrast",
  "theme-dyslexia"
];

interface ThemeSwitcherButtonIconProps {
  label: string;
}

const ThemeSwitcherButtonIcon = ({ label }: ThemeSwitcherButtonIconProps) => (
  <div
    className={cn("flex items-center justify-center h-8 w-8 rounded-sm cursor-pointer")}
    title={label}
  >
    <Palette className="h-5 w-5 text-primary/80" />
  </div>
);



interface Model {
  id: string;
  name: string;
  variant: string;
  description: string;
  url?: string;
  provider: string;
}

export function AppLayout({ initialLanguage }: { initialLanguage?: LanguageCode }) {
  const [simpleMode, setSimpleMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('simpleMode') === 'true';
    }
    return false;
  });

  const {
    messages,
    submitQuery,
    currentEvidenceSegments,
    showEvidenceForStatement,
    currentUserMessagesTokenCount,
    interactionStage,
    deepResearchNodes,
    deepResearchEdges,
    isLoading: isCogniQuestLoading,
    isProcessingInitialChain,
    isProcessingClarification,
    isProcessingDeepResearch,
    currentConversationId,
    currentCorrelationId,
    runUsage,
    lastStepDurationMs,
    lastFailedStepInfo,
    handleTryAgain,
    clearLastFailedStep,
    startNewChat,
    loadMockSession,
    editMessage,
  } = useSovereignChat({ simpleMode });

  const toggleSimpleMode = useCallback(() => {
    setSimpleMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('simpleMode', String(next));
      }
      return next;
    });
  }, []);

  const { isAuthenticated, logout } = useAuth();
  const { toast } = useToast();

  const overallIsLoading = isCogniQuestLoading || isProcessingInitialChain || isProcessingClarification || isProcessingDeepResearch || !!lastFailedStepInfo;

  const isMobile = useIsMobile();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeEvidenceStatement, setActiveEvidenceStatement] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("outline");

  const researchVisualizerRef = useRef<HTMLDivElement>(null);

  const sessionStartTime = useRef(Date.now()).current;
  const [sessionDurationMs, setSessionDurationMs] = useState(0);
  const tokenBudget = typeof window !== 'undefined' ? parseInt(localStorage.getItem('tokenBudget') ?? '16000', 10) : 16000;
  const timeBudget = typeof window !== 'undefined' ? parseInt(localStorage.getItem('timeBudget') ?? '300', 10) : 300;

  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [_currentTheme, setCurrentThemeState] = useState<Theme>("ultra-white");

  const [currentLanguage, setCurrentLanguageState] = useState<LanguageCode>(() => initialLanguage ?? getSavedLanguage());
  const [t, setT] = useState<AppTranslations>(() => getTranslations(initialLanguage ?? getSavedLanguage()));

  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(!isMobile);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const initialModels = useMemo<Model[]>(
    () => [
      {
        id: "sovereign-local",
        name: "Sovereign",
        variant: "local",
        description: `Proxy via ${API_BASE_URL}`,
        url: API_BASE_URL,
        provider: "backend",
      },
      { id: "o4-mini-high", name: "ChatGPT", variant: "o4-mini-high", description: "Fastest and most affordable o4 model.", provider: "openai" },
      { id: "o4", name: "ChatGPT", variant: "o4", description: "Our most advanced model.", provider: "openai" },
      { id: "o3.5", name: "ChatGPT", variant: "3.5", description: "Great for everyday tasks.", provider: "openai" },
      { id: "phi3-mini", name: "Phi", variant: "3-mini", description: "Small fast local model.", provider: "client-local" },
      { id: "gemma-7b", name: "Gemma", variant: "7B", description: "Open-weight performant model.", provider: "client-local" },
      { id: "mistral-7b", name: "Mistral", variant: "7B", description: "Powerful open-weight model.", provider: "client-local" },
      { id: "minicpm-o-2.6", name: "MiniCPM", variant: "o 2.6", description: "Multimodal local model.", provider: "client-local" },
      { id: "transformersjs-phi2", name: "transformers.js", variant: "phi-2", description: "Runs in your browser", provider: "transformersjs" },
    ],
    []
  );
  const [availableModels, setAvailableModels] = useState<Model[]>(initialModels);
  const [currentModel, setCurrentModel] = useState<Model>(initialModels[0]);
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('cq_model') : null;
    const storedProvider = typeof window !== 'undefined' ? localStorage.getItem('cq_provider') : null;
    if (stored) {
      const existing = initialModels.find(m => m.id === stored);
      if (existing) {
        setCurrentModel({ ...existing, provider: storedProvider || existing.provider });
      }
    }
  }, [initialModels]);
  const [showCustomModelDialog, setShowCustomModelDialog] = useState(false);
  const [customModelName, setCustomModelName] = useState("");
  const [customModelUrl, setCustomModelUrl] = useState("");

  // On initial load, check backend health and warn if unreachable
  useEffect(() => {
    (async () => {
      const backendOk = await checkBackendConnectivity();
      if (!backendOk) {
        toast({
          title: t.backendUnreachableTitle,
          description: t.mockResponsesDescription,
          variant: 'destructive',
        });
      }
    })();
  }, [toast, t]);

  const handleModelSelect = (modelId: string) => {
    const selectedModel = availableModels.find(m => m.id === modelId);
    if (!selectedModel) return;

    // update UI immediately
    setCurrentModel(selectedModel);
    localStorage.setItem('cq_model', modelId);
    localStorage.setItem('cq_provider', selectedModel.provider);
    if (selectedModel.url) {
      localStorage.setItem('cq_model_url', selectedModel.url);
    } else {
      localStorage.removeItem('cq_model_url');
    }
    toast({ title: t.modelChangedTitle, description: t.modelChangedDescription.replace('{model}', `${selectedModel.name} ${selectedModel.variant}`) });

    // check connectivity in the background to avoid blocking the dropdown
    (async () => {
      if (selectedModel.provider === 'client-local') {
        const llmOk = await checkLocalLlmConnectivity();
        if (!llmOk) {
          toast({ title: t.localLlmUnreachableTitle, description: t.localLlmUnreachableDescription, variant: 'destructive' });
        }
      } else {
        const backendOk = await checkBackendConnectivity();
        if (!backendOk) {
          toast({ title: t.backendUnreachableTitle, description: t.mockResponsesDescription, variant: 'destructive' });
        }
      }
    })();
  };

  const handleAddCustomModel = () => {
    if (!customModelName.trim()) {
      toast({ title: t.modelNameErrorTitle, description: t.modelNameErrorDescription, variant: "destructive" });
      return;
    }
    const newModel: Model = {
      id: uuidv4(),
      name: customModelName.trim(),
      variant: "Custom",
      description: customModelUrl.trim() ? "URL: " + customModelUrl.trim() : "User-added custom model.",
      url: (() => {
        const trimmedUrl = customModelUrl.trim();
        return trimmedUrl === "" ? undefined : trimmedUrl;
      })(),
      provider: "client-local",
    };
    setAvailableModels(prev => [...prev, newModel]);
    setCurrentModel(newModel);
    localStorage.setItem('cq_model', newModel.id);
    localStorage.setItem('cq_provider', newModel.provider);
    if (newModel.url) {
      localStorage.setItem('cq_model_url', newModel.url);
    } else {
      localStorage.removeItem('cq_model_url');
    }
    setShowCustomModelDialog(false);
    setCustomModelName("");
    setCustomModelUrl("");
    toast({
      title: t.customModelAddedTitle,
      description: t.customModelAddedDescription.replace('{name}', newModel.name)
    });
  };

  const modelSelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="group flex cursor-pointer items-center gap-1 rounded-lg py-1.5 px-3 text-lg hover:bg-accent/50 font-normal whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Model selector"
          data-testid="model-switcher-dropdown-button"
        >
          <div className="flex items-center">
            <span className="text-lg font-semibold">{currentModel.name}</span>
            <span className="ml-1.5 text-sm text-muted-foreground">{currentModel.variant}</span>
          </div>
          <ChevronDown className="ml-1 h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t.selectModelLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableModels.map((model) => (
          <DropdownMenuItem key={model.id} onSelect={() => handleModelSelect(model.id)}>
            <div className="flex flex-col">
              <span>
                {model.name} <span className="text-xs text-muted-foreground">{model.variant}</span>
              </span>
              <span className="text-xs text-muted-foreground">{model.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setShowCustomModelDialog(true)}>
          <PlusCircle className="mr-2 h-4 w-4" /> {t.addCustomModel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );


  const toggleLeftPanel = useCallback(() => setIsLeftPanelOpen(prev => !prev), []);
  const toggleRightPanel = useCallback(() => setIsRightPanelOpen(prev => !prev), []);

  const setTheme = useCallback((theme: Theme) => {
    setCurrentThemeState(theme);
    if (typeof window !== 'undefined') {
      localStorage.setItem("app-theme", theme);
      const htmlEl = document.documentElement;
      
      htmlEl.classList.remove(...knownThemeClasses); // Remove all known theme classes
      if (theme !== "ultra-white") { // "ultra-white" uses the :root defaults, no specific class
         htmlEl.classList.add(theme);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let initialTheme: Theme = "ultra-white";
      const savedTheme = localStorage.getItem("app-theme") as Theme | null;

      if (savedTheme && (knownThemeClasses.includes(savedTheme) || savedTheme === "ultra-white")) {
          initialTheme = savedTheme;
      } else if (savedTheme) {
        localStorage.removeItem("app-theme");
      }
      setTheme(initialTheme);

      const savedLanguage = getSavedLanguage();
      setCurrentLanguageState(savedLanguage);

      if (!localStorage.getItem('app-language')) {
        import('@/lib/ip-language').then(({ getLanguageFromIP }) => {
          getLanguageFromIP().then((detected) => {
            if (detected && detected !== savedLanguage) {
              setCurrentLanguageState(detected);
              localStorage.setItem('app-language', detected);
            }
          });
        });
      }

      import('@/lib/client-info').then(({ collectClientInfo, sendClientInfo }) => {
        collectClientInfo().then((info) => {
          sendClientInfo(info);
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setT(getTranslations(currentLanguage));
  }, [currentLanguage]);

  const handleSetLanguage = useCallback((language: LanguageCode) => {
    setCurrentLanguageState(language);
    if (typeof window !== 'undefined') {
      localStorage.setItem("app-language", language);
    }
    const langObj = translations[language] as AppTranslations | undefined;
    const langName = langObj?.appTitle ?? language.toUpperCase(); // Fallback to code if title missing
    const { languageSelectedTitle, languageSelectedDescription } =
      getTranslations(language);
    toast({
      title: languageSelectedTitle,
      description: languageSelectedDescription.replace('{language}', langName),
    });
  }, [toast]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
    if (liveRegionRef.current) {
      const last = messages[messages.length - 1];
      if (last && !last.isLoading) {
        liveRegionRef.current.textContent = last.content;
      }
    }
  }, [messages, overallIsLoading]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSessionDurationMs(Date.now() - sessionStartTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartTime]);

  useEffect(() => {
    if (interactionStage === 'PROCESSING_COGNITIVE_ANALYSIS' || interactionStage === 'PROCESSING_CLARIFICATION' || interactionStage === 'AWAITING_USER_CLARIFICATION' || interactionStage === 'INITIAL_QUERY') {
      setActiveTab("outline");
    } else if (interactionStage === 'PROCESSING_DEEP_RESEARCH') {
      setActiveTab("action-graph");
    } else if (interactionStage === 'IDLE_AFTER_DEEP_RESEARCH') {
      // Keep action-graph active as per previous request
      // setActiveTab("action-graph"); // Intentionally keep action-graph active
      // Only switch back to outline if a new query is initiated (handled by the first condition in this effect)
    }
  }, [interactionStage]);


  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (lastFailedStepInfo) {
      timerId = setTimeout(() => {
        if (lastFailedStepInfo) { 
            clearLastFailedStep();
        }
      }, 3000);
    }
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [lastFailedStepInfo, clearLastFailedStep]);

  // Renamed from scrollToElementById to avoid confusion and ensure it's always defined in this scope.
  const handleOutlineItemClick = useCallback((elementId: string) => {
    if (typeof document !== 'undefined') {
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        console.warn('Element with ID ' + elementId + ' not found for scrolling.');
      }
    }
  }, []);

  const handleShowEvidence = useCallback((statementText: string, sectionIdOrMessageId?: string | undefined, messageType?: ChatMessage['messageType'], customEvidence?: EvidenceSegment[]) => {
     if (!showEvidenceForStatement || !setActiveEvidenceStatement || !setActiveTab || !setIsRightPanelOpen) {
        console.error("handleShowEvidence: One or more required functions are undefined.");
        return;
    }
    setIsRightPanelOpen(true);
    setActiveEvidenceStatement(statementText);
    if(showEvidenceForStatement){
      showEvidenceForStatement(statementText, sectionIdOrMessageId, messageType, customEvidence);
    } else {
      console.error("showEvidenceForStatement from useSovereignChat is not defined.");
    }
    setActiveTab("evidence");
  }, [showEvidenceForStatement, setActiveTab, setIsRightPanelOpen]);

  const [isResearchFullScreen, setIsResearchFullScreen] = useState(false);

  const toggleResearchFullScreen = async () => {
    const element = researchVisualizerRef.current;
    const targetElement = isMobile && typeof document !== 'undefined' ? document.documentElement : element;

    if (!targetElement) return;

    if (typeof document !== 'undefined') {
      if (!document.fullscreenElement) {
        try {
          await targetElement.requestFullscreen();
          setIsResearchFullScreen(true);
        } catch (err) {
          console.error("Error attempting to enable full-screen mode:", err);
        }
      } else if (document.exitFullscreen) {
          await document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      if (typeof document !== 'undefined') {
        setIsResearchFullScreen(!!document.fullscreenElement);
      }
    };
    if (typeof document !== 'undefined') {
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
    }
  }, []);

  const hasShownWsFailure = useRef(false);
  useEffect(() => {
    const handleWsFailure = () => {
      if (hasShownWsFailure.current) return;
      hasShownWsFailure.current = true;

      toast({
        title: t.metricsConnectionFailedTitle,
        description: t.metricsConnectionFailedDescription,
        variant: 'destructive',
      });

      const fallback = availableModels.find(m => m.provider === 'transformersjs');
      if (fallback) {
        setCurrentModel(fallback);
        if (typeof window !== 'undefined') {
          localStorage.setItem('cq_model', fallback.id);
          localStorage.setItem('cq_provider', fallback.provider);
        }
      }

      toast({
        title: t.transformersEnabledTitle,
        description: t.transformersEnabledDescription,
        className: 'bg-green-500 text-white',
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(WEBSOCKET_MAX_RECONNECTS_EVENT, handleWsFailure);
      return () => window.removeEventListener(WEBSOCKET_MAX_RECONNECTS_EVENT, handleWsFailure);
    }
  }, [
    availableModels,
    toast,
    t.metricsConnectionFailedTitle,
    t.metricsConnectionFailedDescription,
    t.transformersEnabledTitle,
    t.transformersEnabledDescription,
  ]);


  const handleLoginSuccess = useCallback(() => {
    setShowLoginDialog(false);
  }, []);

  const handleRegisterSuccess = useCallback(() => {
    setShowRegisterDialog(false);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setIsLeftPanelOpen(false);
  }, [logout, setIsLeftPanelOpen]);

  const handleNewChat = useCallback((cid?: string) => {
    startNewChat(cid);
  }, [startNewChat]);

  const handleLoadSession = useCallback((session: ChatSession) => {
    loadMockSession(session.id, session.correlationId ?? undefined);
  }, [loadMockSession]);

  const handleLoadArchived = useCallback((session: ChatSession) => {
    loadMockSession(session.id, session.correlationId ?? undefined);
  }, [loadMockSession]);

  const liveRegionRef = useRef<HTMLDivElement>(null);

  const renderChatArea = () => (
    <div className="relative flex flex-col flex-grow overflow-hidden">
      {_currentTheme === "ultra-white" && (
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none"
          src="/incite.mp4"
        />
      )}
      <ScrollArea className="relative z-10 flex-grow bg-background" ref={scrollAreaRef}>
        <div className="p-4 space-y-1">
          {messages.map((msg) => (
            <ChatMessageDisplay
              key={msg.id}
              message={msg}
              onDeepDive={() => {}}
              onShowEvidence={handleShowEvidence}
              originalQueryForDeepDive={messages.find(m => m.role === 'user')?.content ?? t.yourQueryFallback}
              onEditMessage={editMessage}
              t={t}
            />
          ))}
          <div ref={messagesEndRef} />
          <div aria-live="polite" role="status" ref={liveRegionRef} className="sr-only" />
        </div>
      </ScrollArea>
       {lastFailedStepInfo && (
        <div className="p-3 border-t bg-destructive/10 text-destructive-foreground flex items-center justify-between">
          <p className="text-sm">{t.errorBannerMessage}</p>
          <Button onClick={handleTryAgain} variant="destructive" size="sm">
            {t.tryAgain}
          </Button>
        </div>
      )}
    </div>
  );

 const renderDesktopLayout = () => (
    <div className="flex flex-grow overflow-hidden min-h-0">
      {/* Left Panel (Chat History) */}
      <div
        role="navigation"
        className={cn(
          "transition-all duration-300 ease-in-out bg-card shadow-lg flex flex-col border-r border-border overflow-hidden",
          isLeftPanelOpen ? "md:w-80" : "md:w-0 opacity-0 pointer-events-none md:pointer-events-auto md:opacity-100 md:hidden"
        )}
      >
        {isLeftPanelOpen && (
          <ChatHistoryPanel
            onLogout={handleLogout}
            onClose={toggleLeftPanel}
            onNewChat={handleNewChat}
            onLoadSession={handleLoadSession}
            t={t}
            messages={messages}
          />
        )}
      </div>

      {/* Main Content Area (Chat) */}
      <div className="flex-grow flex flex-col rounded-lg border bg-card shadow-sm overflow-hidden min-h-0">
        {renderChatArea()}
      </div>

      {/* Right Info Panel */}
      <div
        role="complementary"
        className={cn(
          "relative flex flex-col bg-card shadow-lg border-l transition-all duration-300 ease-in-out",
           isRightPanelOpen ? "md:w-96" : "md:w-12"
        )}
      >
        {!isRightPanelOpen && (
          <div className="h-full flex items-start justify-center pt-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRightPanel}
              title="Open Info Panel"
              className="h-8 w-8 bg-card hover:bg-muted border shadow-sm"
            >
              <PanelRightOpen className="h-5 w-5 text-primary/80" />
            </Button>
          </div>
        )}

        {isRightPanelOpen && (
          <>
            {/* Panel Header: TabsList and Close Button */}
            <div className="flex justify-between items-center p-2 border-b sticky top-0 bg-card z-10">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow min-w-0"> {/* Ensure TabsList doesn't overflow */}
                    <TabsList className="grid grid-cols-3 rounded-md h-8">
                        <TabsTrigger value="outline" className="text-xs px-2 py-1 h-auto rounded-sm data-[state=active]:shadow-sm">
                            <ListTreeIcon className="mr-1.5 h-3.5 w-3.5" /> {t.outlineTab}
                        </TabsTrigger>
                        <TabsTrigger value="evidence" className="text-xs px-2 py-1 h-auto rounded-sm data-[state=active]:shadow-sm">
                            <EvidenceIconLucide className="mr-1.5 h-3.5 w-3.5" /> {t.evidenceTab}
                        </TabsTrigger>
                        <TabsTrigger value="action-graph" className="text-xs px-2 py-1 h-auto rounded-sm data-[state=active]:shadow-sm" disabled={deepResearchNodes.length === 0 && interactionStage !== 'PROCESSING_DEEP_RESEARCH'}>
                            <Workflow className="mr-1.5 h-3.5 w-3.5" /> {t.actionGraphTab}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleRightPanel}
                    title="Close Info Panel"
                    className="h-8 w-8 ml-2 shrink-0"
                >
                    <PanelRightClose className="h-5 w-5 text-primary/80" />
                </Button>
            </div>

            {/* Tabs Content Area - This needs to be a flex child that can grow and shrink */}
            <div className="flex-grow overflow-hidden min-h-0">
              <Tabs value={activeTab} className="flex-grow flex flex-col overflow-hidden min-h-0"> {/* Removed onValueChange here as it's on the parent Tabs */}
                  <TabsContent value="outline" className="flex-grow overflow-y-auto p-0 m-0 min-h-0">
                  <OutlinePanel
                      messages={messages}
                      onOutlineItemClick={handleOutlineItemClick}
                      currentConversationId={currentConversationId}
                      t={t}
                  />
                  </TabsContent>
                  <TabsContent value="evidence" className="flex-grow overflow-y-auto p-0 m-0 min-h-0">
                  <EvidencePanel evidenceSegments={currentEvidenceSegments} currentStatementText={activeEvidenceStatement} t={t} />
                  </TabsContent>
                  <TabsContent value="action-graph" className="flex flex-col flex-grow overflow-hidden p-0 m-0 min-h-0 relative" ref={researchVisualizerRef}>
                    <div className="w-full flex-grow min-h-0">
                      {(deepResearchNodes.length > 0 || interactionStage === 'PROCESSING_DEEP_RESEARCH') ? (
                      <>
                          <DeepResearchVisualizer initialNodes={deepResearchNodes} initialEdges={deepResearchEdges} />
                          <Button
                          variant="ghost"
                          size="icon"
                          onClick={toggleResearchFullScreen}
                          className="absolute top-2 right-2 z-10 bg-background/70 hover:bg-background"
                          title={isResearchFullScreen ? "Exit Fullscreen" : "Fullscreen"}
                          >
                          {isResearchFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                          </Button>
                      </>
                      ) : (
                      <div className="p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                          {t.noActionGraphData}
                      </div>
                      )}
                  </div>
                  </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>
    </div>
  );

  const renderMobileLayout = () => (
    <div className="flex flex-col flex-grow overflow-hidden">
      {/* Mobile Header */}
      <div className="p-2 border-b flex justify-between items-center bg-card">
        <Sheet open={isLeftPanelOpen} onOpenChange={setIsLeftPanelOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <PanelLeftOpen className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[80vw] sm:w-[350px] flex flex-col p-0">
            <SheetTitle asChild>
              <VisuallyHidden>{t.chatHistoryTitle}</VisuallyHidden>
            </SheetTitle>
            <ChatHistoryPanel
              onLogout={handleLogout}
              onClose={toggleLeftPanel}
              onNewChat={handleNewChat}
              onLoadSession={handleLoadSession}
              t={t}
              messages={messages}
            />
          </SheetContent>
        </Sheet>

        <div className="flex-grow flex justify-center items-center">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="px-3 h-8 text-sm">
                        {activeTab === 'outline' && <ListTreeIcon className="mr-2 h-4 w-4" />}
                        {activeTab === 'evidence' && <EvidenceIconLucide className="mr-2 h-4 w-4" />}
                        {activeTab === 'action-graph' && <Workflow className="mr-2 h-4 w-4" />}
                        <span className="capitalize">
                          {activeTab === 'outline' && t.outlineTab}
                          {activeTab === 'evidence' && t.evidenceTab}
                          {activeTab === 'action-graph' && t.actionGraphTab}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                    <DropdownMenuItem onSelect={() => { setIsRightPanelOpen(true); setActiveTab("outline");}}>
                        <ListTreeIcon className="mr-2 h-4 w-4" /> {t.outlineTab}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setIsRightPanelOpen(true); setActiveTab("evidence");}} disabled={currentEvidenceSegments.length === 0}>
                        <EvidenceIconLucide className="mr-2 h-4 w-4" /> {t.evidenceTab}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { setIsRightPanelOpen(true); setActiveTab("action-graph");}} disabled={deepResearchNodes.length === 0 && interactionStage !== 'PROCESSING_DEEP_RESEARCH'}>
                        <Workflow className="mr-2 h-4 w-4" /> {t.actionGraphTab}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <Sheet open={isRightPanelOpen && isMobile} onOpenChange={setIsRightPanelOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <PanelRightOpen className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[80vw] sm:w-[350px] flex flex-col p-0">
            <SheetTitle asChild>
              <VisuallyHidden>Additional Panels</VisuallyHidden>
            </SheetTitle>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow flex flex-col overflow-hidden min-h-0">
                 <TabsList className="grid w-full grid-cols-3 rounded-none border-b-0">
                  <TabsTrigger value="outline" className="rounded-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                    <ListTreeIcon className="mr-2 h-4 w-4" /> {t.outlineTab}
                  </TabsTrigger>
                  <TabsTrigger value="evidence" className="rounded-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                  <EvidenceIconLucide className="mr-2 h-4 w-4" /> {t.evidenceTab}
                  </TabsTrigger>
                  <TabsTrigger value="action-graph" className="rounded-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary" disabled={deepResearchNodes.length === 0 && interactionStage !== 'PROCESSING_DEEP_RESEARCH'}>
                  <Workflow className="mr-2 h-4 w-4" /> {t.actionGraphTab}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="outline" className="flex-grow overflow-y-auto p-0 m-0 min-h-0">
                  <OutlinePanel
                    messages={messages}
                    onOutlineItemClick={handleOutlineItemClick}
                    currentConversationId={currentConversationId}
                    t={t}
                  />
                </TabsContent>
                <TabsContent value="evidence" className="flex-grow overflow-y-auto p-0 m-0 min-h-0">
                  <EvidencePanel evidenceSegments={currentEvidenceSegments} currentStatementText={activeEvidenceStatement} t={t} />
                </TabsContent>
                <TabsContent value="action-graph" className="flex-grow overflow-hidden p-0 m-0 h-full min-h-0 relative" ref={researchVisualizerRef}>
                   <div className="w-full h-full min-h-0">
                    {(deepResearchNodes.length > 0 || interactionStage === 'PROCESSING_DEEP_RESEARCH') ? (
                      <>
                        <DeepResearchVisualizer initialNodes={deepResearchNodes} initialEdges={deepResearchEdges} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={toggleResearchFullScreen}
                          className="absolute top-2 right-2 z-10 bg-background/70 hover:bg-background"
                          title={isResearchFullScreen ? "Exit Fullscreen" : "Fullscreen"}
                        >
                          {isResearchFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground h-full flex items-center justify-center">
                        {t.noActionGraphData}
                      </div>
                    )}
                   </div>
                </TabsContent>
              </Tabs>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Chat Area for Mobile */}
      <div className="flex-grow overflow-hidden">
        {renderChatArea()}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-background font-sans" role="application">
      <header className="flex items-center justify-between p-2 border-b sticky top-0 bg-background/80 backdrop-blur-md z-30" role="banner">
        <div className="flex items-center space-x-2">
           {!isMobile && (
             <Button variant="ghost" size="icon" onClick={toggleLeftPanel} title={isLeftPanelOpen ? "Close Chat History" : "Open Chat History"} className="h-8 w-8">
              {isLeftPanelOpen ? <PanelLeftClose className="h-5 w-5 text-primary/80" /> : <PanelLeftOpen className="h-5 w-5 text-primary/80" />}
            </Button>
           )}
          <Image src="/theranthrope.png" alt="Sovereign" width={28} height={28} />
          <span className="font-headline text-xl font-bold">Sovereign</span>
          {!isMobile && modelSelector}
        </div>

        <div className="flex-grow flex justify-center items-center px-4 h-6">
          {overallIsLoading && <ThreeDotsLoading />}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="icon" className="p-0 h-auto w-auto" title={t.themeSwitcherLabel}>
                <ThemeSwitcherButtonIcon label={t.themeSwitcherLabel} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t.themeSwitcherLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setTheme("ultra-white")}>Ultra White (Default)</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-dracula")}>Dark Purple</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-dune")}>Dune</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-dow")}>DOW</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-warhammer-ultramarines")}>Warhammer Ultramarines</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-chaos-marines")}>Warhammer Chaos</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-matrix")}>Matrix</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-tron")}>Tron</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-blade-runner")}>Blade Runner</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-wall-e")}>WALL-E</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-wes-anderson")}>Wes Anderson</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-evangelion")}>Evangelion</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-westworld")}>Westworld</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-severance")}>Severance</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-fringe")}>Fringe</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-helix")}>Helix CDC</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("dark")}>Default Dark</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-high-contrast")}>High Contrast</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTheme("theme-dyslexia")}>Dyslexia Friendly</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!isMobile && (
            <LanguageSelector currentLanguage={currentLanguage} onChange={handleSetLanguage} />
          )}

          {!isMobile && (
            <BudgetTelemetry
              currentUserMessagesTokenCount={currentUserMessagesTokenCount}
              sessionDurationMs={sessionDurationMs}
              lastStepDurationMs={lastStepDurationMs}
              tokensUsed={runUsage.tokens}
              tokenBudget={tokenBudget}
              timeUsed={runUsage.time_seconds}
              timeBudget={timeBudget}
              correlationId={currentCorrelationId}
              t={t}
            />
          )}
          {!isMobile && isAuthenticated && (
            <ArchiveDialog onLoad={handleLoadArchived} t={t}>
              <Button variant="ghost" size="icon" title={t.archiveTitle}>
                <ArchiveIcon className="h-5 w-5 text-primary/80" />
              </Button>
            </ArchiveDialog>
          )}
          {!isMobile && (
            <SettingsDialog t={t}>
              <Button variant="ghost" size="icon" title={t.settingsTitle}>
                <Settings className="h-5 w-5 text-primary/80" />
              </Button>
            </SettingsDialog>
          )}


          {isAuthenticated ? (
            <UserAccountDialog onLogout={handleLogout} t={t}>
              <Button variant="ghost" size="icon" title={t.userAccountTitle}>
                <UserCircle2 className="h-5 w-5 text-primary/80" />
              </Button>
            </UserAccountDialog>
          ) : (
            <>
              <LoginDialog t={t} onLoginSuccess={handleLoginSuccess} open={showLoginDialog} onOpenChange={setShowLoginDialog}>
                <Button variant="outline" size="sm" onClick={() => setShowLoginDialog(true)}>
                  <LogIn className="mr-2 h-4 w-4" /> {t.loginButton}
                </Button>
              </LoginDialog>
              <RegisterDialog t={t} onRegisterSuccess={handleRegisterSuccess} open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
                <Button variant="outline" size="sm" onClick={() => setShowRegisterDialog(true)}>
                  <UserPlus className="mr-2 h-4 w-4" /> {t.registerButton}
                </Button>
              </RegisterDialog>
            </>
          )}
        </div>
      </header>

      <main id="main-content" role="main" className="flex flex-col flex-grow overflow-hidden min-h-0" tabIndex={-1}>
        {isMobile ? renderMobileLayout() : renderDesktopLayout()}
      </main>

      <div className={cn("shrink-0", isMobile && "pb-12")}>
        <QueryInput
          t={t}
          onSubmit={submitQuery}
          isLoading={overallIsLoading}
          onTokenCountChange={() => {}}
          simpleMode={simpleMode}
          onToggleSimpleMode={toggleSimpleMode}
        />
      </div>

      <Dialog open={showCustomModelDialog} onOpenChange={setShowCustomModelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.customModelDialogTitle}</DialogTitle>
            <DialogDescription>{t.customModelDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customModelName" className="text-right">{t.customModelNameLabel}</Label>
              <Input id="customModelName" value={customModelName} onChange={(e) => setCustomModelName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="customModelUrl" className="text-right">{t.customModelUrlLabel}</Label>
              <Input id="customModelUrl" value={customModelUrl} onChange={(e) => setCustomModelUrl(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomModelDialog(false)}>{t.deleteConfirmCancel}</Button>
            <Button onClick={handleAddCustomModel}>{t.saveModelButton}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isMobile && (
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/80 backdrop-blur-md flex justify-center py-2">
              <Button variant="ghost" size="icon" aria-label="Menu">
                <Menu className="h-6 w-6" />
              </Button>
            </div>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[60vh] flex flex-col gap-4 overflow-y-auto">
            <div className="flex justify-center">{modelSelector}</div>
            <LanguageSelector currentLanguage={currentLanguage} onChange={handleSetLanguage} />
            <BudgetTelemetry
              currentUserMessagesTokenCount={currentUserMessagesTokenCount}
              sessionDurationMs={sessionDurationMs}
              lastStepDurationMs={lastStepDurationMs}
              tokensUsed={runUsage.tokens}
              tokenBudget={tokenBudget}
              timeUsed={runUsage.time_seconds}
              timeBudget={timeBudget}
              correlationId={currentCorrelationId}
              t={t}
            />
            {isAuthenticated && (
              <ArchiveDialog onLoad={handleLoadArchived} t={t}>
                <Button variant="ghost" className="w-full justify-start">
                  <ArchiveIcon className="mr-2 h-4 w-4" /> {t.archiveTitle}
                </Button>
              </ArchiveDialog>
            )}
            <SettingsDialog t={t}>
              <Button variant="ghost" className="w-full justify-start">
                <Settings className="mr-2 h-4 w-4" /> {t.settingsTitle}
              </Button>
            </SettingsDialog>
          </SheetContent>
        </Sheet>
      )}

    </div>
  );
}
