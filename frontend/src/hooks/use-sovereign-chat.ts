
"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage, EvidenceSegment, ParsedChatMessageContent } from "@/types";
import { useMutation } from '@tanstack/react-query';
import {
  answerQuestionAction,
  generateClarificationAction,
  deepResearchAction,
  simpleChatAction,
} from '@/app/actions';
import { queryBrowserLLM } from '@/lib/browser-llm';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { parseAiAnswerContent } from '@/lib/markdown-parser';
import type { ApiError, RunStatusResponse } from '@/api/client';
import { getRunStatus, subscribeRunUpdates, ingestDocument } from '@/api/client';
import { checkBackendConnectivity } from '@/monitoring/backend';
import { logMetric, logVerbose } from '@/monitoring/logger';
import { getTranslations, getSavedLanguage, type AppTranslations } from '@/lib/translations';
import type { CognitiveQueryAnalysisProtocol } from '@/types/cognitive-protocol';
import type {
  AnswerQuestionInput, AnswerQuestionOutput,
  GenerateClarificationInput, GenerateClarificationOutput,
  DeepResearchInput, DeepResearchOutput, DeepResearchNodeData
} from '@/types/action-io-types';
import type { Node, Edge } from 'reactflow';

const USE_TOOL_API = false;

export type InteractionStage =
  | 'INITIAL_QUERY'
  | 'PROCESSING_COGNITIVE_ANALYSIS'
  | 'PROCESSING_CLARIFICATION'
  | 'AWAITING_USER_CLARIFICATION'
  | 'PROCESSING_DEEP_RESEARCH'
  | 'IDLE_AFTER_DEEP_RESEARCH';

export interface UseSovereignChatReturn {
  messages: ChatMessage[];
  submitQuery: (
    query: string,
    attachment?: { name: string; type: string; dataUri?: string } | null,
    skillName?: string | null
  ) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  currentEvidenceSegments: EvidenceSegment[];
  showEvidenceForStatement: (statementText: string, sectionIdOrMessageId?: string | undefined, messageType?: ChatMessage['messageType'], customEvidence?: EvidenceSegment[]) => void;
  currentUserMessagesTokenCount: number;
  interactionStage: InteractionStage;
  deepResearchNodes: Node<DeepResearchNodeData>[];
  deepResearchEdges: Edge[];
  isProcessingInitialChain: boolean;
  isProcessingClarification: boolean;
  isProcessingDeepResearch: boolean;
  isProcessingSimpleChat: boolean;
  currentConversationId: string;
  lastStepDurationMs: number | null;
  lastFailedStepInfo: { stage: 'cognitive' | 'clarification' | 'deepResearch' | 'simpleChat'; input: any; messageIdToUpdate: string | null } | null;
  handleTryAgain: () => void;
  clearLastFailedStep: () => void;
  startNewChat: (correlationId?: string) => void;
  loadMockSession: (sessionId: string, correlationId?: string | null) => void;
  editMessage: (id: string, newContent: string) => void;
}

const retryDelay = (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000); // Max 10s

export function useSovereignChat(options?: { simpleMode?: boolean }): UseSovereignChatReturn {
  const simpleMode = options?.simpleMode ?? false;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentEvidenceSegments, setCurrentEvidenceSegments] = useState<EvidenceSegment[]>([]);
  const [interactionStage, setInteractionStage] = useState<InteractionStage>('INITIAL_QUERY');
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => uuidv4());

  useEffect(() => {
    logMetric(`Stage changed to ${interactionStage}`);
  }, [interactionStage]);

  const [storedCognitiveAnalysis, setStoredCognitiveAnalysis] = useState<CognitiveQueryAnalysisProtocol | null>(null);
  const originalUserQueryRef = useRef<string | null>(null);
  // Placeholder for future attachment feature. Currently this state is set when a user
  // uploads a file but is not used elsewhere yet.
  const [originalUserAttachment, setOriginalUserAttachment] = useState<{ name: string; type: string; dataUri?: string } | null>(null);
  const [currentUserMessagesTokenCount, setCurrentUserMessagesTokenCount] = useState<number>(0);
  const [lastStepDurationMs, setLastStepDurationMs] = useState<number | null>(null);
  const [lastFailedStepInfo, setLastFailedStepInfo] = useState<{ stage: 'cognitive' | 'clarification' | 'deepResearch' | 'simpleChat'; input: any; messageIdToUpdate: string | null } | null>(null);


  const [deepResearchNodes, setDeepResearchNodes] = useState<Node<DeepResearchNodeData>[]>([]);
  const [deepResearchEdges, setDeepResearchEdges] = useState<Edge[]>([]);
  const [currentCorrelationId, setCurrentCorrelationId] = useState<string | null>(null);
  const [runUsage, setRunUsage] = useState<{ tokens: number; time_seconds: number }>({ tokens: 0, time_seconds: 0 });

  const [mockModeNotified, setMockModeNotified] = useState(false);

  const { toast } = useToast();
  const notifyMockMode = useCallback(() => {
    if (!mockModeNotified) {
      const t: AppTranslations = getTranslations(getSavedLanguage());
      toast({ title: t.backendUnreachableTitle, description: t.mockResponsesDescription, variant: 'destructive' });
      setMockModeNotified(true);
    }
  }, [mockModeNotified, toast]);

  const cognitiveAnalysisMsgIdRef = useRef<string | null>(null);
  const clarificationMsgIdRef = useRef<string | null>(null);
  const deepResearchMsgIdRef = useRef<string | null>(null);
  const simpleChatMsgIdRef = useRef<string | null>(null);

  const calculateUserTokenCount = (currentMessages: ChatMessage[]): number => {
    return currentMessages
      .filter(msg => msg.role === 'user')
      .reduce((sum, msg) => sum + (msg.content?.length || 0), 0); // Each char is roughly 0.5 token, sum of chars
  };

  useEffect(() => {
    setCurrentUserMessagesTokenCount(calculateUserTokenCount(messages));
  }, [messages]);

  useEffect(() => {
    if (!currentCorrelationId) return;
    const provider = typeof window !== 'undefined'
      ? localStorage.getItem('cq_provider')
      : null;
    if (provider === 'transformersjs') return;
    let cancelled = false;
    let interval: NodeJS.Timer | null = null;

    const poll = async () => {
      try {
        const status = await getRunStatus(currentCorrelationId);
        if (!cancelled) {
          setRunUsage({ tokens: status.resource_usage.tokens, time_seconds: status.resource_usage.time_seconds });
        }
      } catch (e) {
        console.warn('status poll failed', e);
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    const start = async () => {
      const backendOk = await checkBackendConnectivity();
      if (!backendOk) {
        console.warn('Backend unreachable; skipping status polling');
        return;
      }
      await poll();
      if (!cancelled) {
        interval = setInterval(poll, 2000);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [currentCorrelationId]);

  useEffect(() => {
    if (!currentCorrelationId) return;
    const provider = typeof window !== 'undefined'
      ? localStorage.getItem('cq_provider')
      : null;
    if (provider === 'transformersjs') return;
    const unsubscribe = subscribeRunUpdates(currentCorrelationId, (update) => {
      if (update.event === 'stage_completed') {
        setRunUsage((prev) => ({
          tokens: prev.tokens + (update.tokens ?? 0),
          time_seconds: prev.time_seconds + (update.elapsed ?? 0),
        }));
      } else if (update.event === 'run_finalized' && update.result?.resource_usage) {
        setRunUsage({
          tokens: update.result.resource_usage.tokens,
          time_seconds: update.result.resource_usage.time_seconds,
        });
      } else if (update.event === 'budget_threshold') {
        if (update.resource === 'tokens') {
          setRunUsage((prev) => ({ ...prev, tokens: update.used }));
        } else if (update.resource === 'time_seconds') {
          setRunUsage((prev) => ({ ...prev, time_seconds: update.used }));
        }
      }
    });
    return () => unsubscribe();
  }, [currentCorrelationId]);

  const addMessageToList = useCallback((
    role: 'user' | 'assistant',
    content: string,
    isLoading = false,
    messageType?: ChatMessage['messageType'],
    cognitiveAnalysisData?: CognitiveQueryAnalysisProtocol | null,
    attachmentName?: string,
    attachmentPreviewUrl?: string,
    mockEvidenceSegments?: EvidenceSegment[]
  ): string => {
    const newMessage: ChatMessage = {
      id: uuidv4(),
      role,
      content,
      parsedContent: (isLoading || role === 'user' || !content || messageType === 'cognitive_analysis_table' || messageType === 'cognitive_analysis_loading' || messageType === 'clarification_loading')
                     ? undefined
                     : parseAiAnswerContent(content),
      cognitiveAnalysisData: (messageType === 'cognitive_analysis_table' && cognitiveAnalysisData) ? cognitiveAnalysisData : undefined,
      isLoading,
      timestamp: new Date(),
      messageType,
      attachmentName,
      attachmentPreviewUrl,
      mockEvidenceSegments,
    };
    logVerbose('Adding message', { id: newMessage.id, role, messageType });
    setMessages(prev => {
      const updated = [...prev, newMessage];
      logVerbose('Message list size', { size: updated.length });
      return updated;
    });
    return newMessage.id;
  }, []);

  const updateMessageInList = useCallback((id: string, updates: Partial<ChatMessage>) => {
    logVerbose('Updating message', { id, updates });
    setMessages(prevMsgs => {
      const updated = prevMsgs.map(msg => {
        if (msg.id === id) {
          const updatedMsg = { ...msg, ...updates, isLoading: updates.isLoading !== undefined ? updates.isLoading : msg.isLoading };

          if (updates.content && !updatedMsg.isLoading && updatedMsg.role === 'assistant' &&
              (updatedMsg.messageType === 'clarification_questions' || updatedMsg.messageType === 'deep_research_summary' || updatedMsg.messageType === undefined /* for simple assistant text */)) {
            updatedMsg.parsedContent = parseAiAnswerContent(updates.content);
          }

          if (updates.messageType === 'cognitive_analysis_table' && typeof updates.content === 'string') {
             try {
                const parsedJson = JSON.parse(updates.content) as CognitiveQueryAnalysisProtocol;
                updatedMsg.cognitiveAnalysisData = parsedJson;
                // Do not setStoredCognitiveAnalysis here, it's handled in mutation onSuccess
             } catch (e) {
                console.error("Error parsing cognitive analysis JSON for storage in updateMessageInList:", e);
                updatedMsg.cognitiveAnalysisData = null;
             }
          }
          
          if (updates.mockEvidenceSegments) {
            updatedMsg.mockEvidenceSegments = [...(msg.mockEvidenceSegments || []), ...updates.mockEvidenceSegments];
          }
          return updatedMsg;
        }
        return msg;
      });
      logVerbose('Updated message', { id });
      return updated;
    });
  }, []);

  const showEvidenceForStatement = useCallback((statementText: string, sectionIdOrMessageId?: string | undefined, messageType?: ChatMessage['messageType'], customEvidence?: EvidenceSegment[]) => {
    if (customEvidence) {
      setCurrentEvidenceSegments(customEvidence);
      logVerbose('Show evidence from custom segments', { count: customEvidence.length });
      return;
    }

    const relevantMessage = messages.find(msg => {
      if (msg.id === sectionIdOrMessageId) return true;
      if (typeof msg.content === 'string' && msg.content.includes(statementText)) return true;
      if (msg.messageType === 'cognitive_analysis_table' && msg.cognitiveAnalysisData) {
        try {
          const analysisString = JSON.stringify(msg.cognitiveAnalysisData);
          if (analysisString.includes(statementText)) return true;
        } catch (e) {
            console.error("Error stringifying cognitiveAnalysisData for evidence search:", e);
        }
      }
      return false;
    });

    if (relevantMessage && relevantMessage.mockEvidenceSegments) {
      setCurrentEvidenceSegments(relevantMessage.mockEvidenceSegments);
      logVerbose('Show evidence for statement', { statementText, count: relevantMessage.mockEvidenceSegments.length });
    } else {
      const t: AppTranslations = getTranslations(getSavedLanguage());
      console.warn(
        t.noRelevantEvidenceSegmentsFound,
        statementText,
        "ID:",
        sectionIdOrMessageId,
      );
      setCurrentEvidenceSegments([]); // Clear evidence if none found
    }
  }, [messages]);

  const resetInitialChainStates = () => {
    cognitiveAnalysisMsgIdRef.current = null;
    clarificationMsgIdRef.current = null;
    setStoredCognitiveAnalysis(null);
    originalUserQueryRef.current = null;
    setOriginalUserAttachment(null);
    setInteractionStage('INITIAL_QUERY');
    simpleChatMsgIdRef.current = null;
    logMetric('Reset initial chain states');
  };

  const resetForNewQueryCycle = (conversationId?: string, cid?: string | null) => {
    resetInitialChainStates();
    // Reset the message ID for any prior deep research summary so new runs don't
    // try to update an old message.
    deepResearchMsgIdRef.current = null;
    simpleChatMsgIdRef.current = null;
    setDeepResearchNodes([]);
    setDeepResearchEdges([]);
    setCurrentEvidenceSegments([]);
    setLastStepDurationMs(null);
    setLastFailedStepInfo(null);
    setCurrentConversationId(conversationId ?? uuidv4()); // Generate new ID for new conversation if not provided
    if (cid !== undefined) {
      setCurrentCorrelationId(cid);
      setRunUsage({ tokens: 0, time_seconds: 0 });
    }
    logMetric('Reset for new query cycle', { conversationId: conversationId ?? 'new', cid });
  };

  const startNewChat = (cid?: string) => {
    setMessages([]);
    const correlation = cid ?? uuidv4();
    resetForNewQueryCycle(undefined, correlation);
    logMetric('Start new chat', { correlation });
  };

  const loadMockSession = (sessionId: string, cid?: string | null) => {
    const msg: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: `Loaded conversation ${sessionId}`,
      parsedContent: parseAiAnswerContent(`Loaded conversation ${sessionId}`),
      timestamp: new Date(),
    };
    setMessages([msg]);
    resetForNewQueryCycle(sessionId, cid);
    logMetric('Loaded mock session', { sessionId });
  };

  const editMessage = (id: string, newContent: string) => {
    logVerbose('Edit message', { id });
    updateMessageInList(id, { content: newContent, parsedContent: parseAiAnswerContent(newContent) });
  };

  const handleMutationError = (error: Error, context: string, messageIdRef: React.MutableRefObject<string | null>, stage: 'cognitive' | 'clarification' | 'deepResearch' | 'simpleChat', input: any) => {
    logMetric('Mutation error', { context, stage });
    console.error(`Error in ${context}:`, error);
    const apiErr = error as ApiError;
    const message = apiErr.body?.message ?? error.message;
    const t: AppTranslations = getTranslations(getSavedLanguage());
    toast({ title: t.errorInContextTitle.replace('{context}', context), description: message, variant: "destructive" });
    if (apiErr.isNetworkError || apiErr.isTimeout) {
      notifyMockMode();
    }
    if (messageIdRef.current) {
      updateMessageInList(messageIdRef.current, {
        content: t.errorProcessingContext
          .replace('{context}', context.toLowerCase())
          .replace('{message}', message),
        isLoading: false,
        messageType: undefined,
        cognitiveAnalysisData: null,
      });
      setLastFailedStepInfo({ stage, input, messageIdToUpdate: messageIdRef.current });
    } else {
        setLastFailedStepInfo({ stage, input, messageIdToUpdate: null });
    }
  };

  const appendEvidenceAndUpdateDuration = (newSegments?: EvidenceSegment[]) => {
    if (newSegments && newSegments.length > 0) {
      setCurrentEvidenceSegments(prev => [...prev, ...newSegments]);
      const lastSegment = newSegments[newSegments.length - 1];
      if (lastSegment.durationMs !== undefined && lastSegment.status !== 'PROCESSING') {
        setLastStepDurationMs(lastSegment.durationMs);
      }
    }
  };

  const cognitiveAnalysisMutation = useMutation({
    mutationFn: async (input: AnswerQuestionInput) => {
      setInteractionStage('PROCESSING_COGNITIVE_ANALYSIS');
      logMetric('Cognitive analysis mutation start');
      const model = localStorage.getItem('cq_model') || undefined;
      const provider = localStorage.getItem('cq_provider') || undefined;
      const modelUrl = localStorage.getItem('cq_model_url') || undefined;
      if (provider === 'transformersjs') {
        const answer = await queryBrowserLLM(input.question);
        return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4(), usingMock: false } as AnswerQuestionOutput;
      }
      return answerQuestionAction(
        input,
        model,
        provider,
        currentCorrelationId ?? undefined,
        modelUrl || undefined
      );
    },
    onSuccess: (data: AnswerQuestionOutput, variables) => {
      logMetric('Cognitive analysis mutation success');
      if (data.correlationId) {
        setCurrentCorrelationId(data.correlationId);
      }
      if (data.queued) {
        const t: AppTranslations = getTranslations(getSavedLanguage());
        toast({
          title: t.tooManyRequestsTitle,
          description: t.tooManyRequestsDescription,
        });
      }
      if (data.usingMock) {
        notifyMockMode();
      }
      let parsedAnalysis: CognitiveQueryAnalysisProtocol | null = null;
      try {
        if (typeof data.answer === 'string') {
           parsedAnalysis = JSON.parse(data.answer) as CognitiveQueryAnalysisProtocol;
           if (parsedAnalysis && typeof (parsedAnalysis as any).Error === 'string') { 
             throw new Error((parsedAnalysis as any).Error as string);
           }
        } else {
            throw new Error("Cognitive analysis response is not a valid JSON string.");
        }
      } catch (e) {
        console.error("Error parsing cognitive analysis JSON or received error object:", e);
        if (cognitiveAnalysisMsgIdRef.current) {
          updateMessageInList(cognitiveAnalysisMsgIdRef.current, {
            content: t.cognitiveAnalysisFailed.replace('{error}', (e as Error).message),
            isLoading: false,
            messageType: undefined, 
            cognitiveAnalysisData: null,
            mockEvidenceSegments: data.mockEvidenceSegments
          });
        }
        appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
        setLastFailedStepInfo({stage: 'cognitive', input: variables, messageIdToUpdate: cognitiveAnalysisMsgIdRef.current});
        return;
      }

      if (data.mockEvidenceSegments && data.mockEvidenceSegments.length > 0 && data.mockEvidenceSegments[data.mockEvidenceSegments.length - 1].status !== 'SUCCESS') {
         if (cognitiveAnalysisMsgIdRef.current) {
             updateMessageInList(cognitiveAnalysisMsgIdRef.current, {
                content: data.mockEvidenceSegments[data.mockEvidenceSegments.length -1].summary || t.cognitiveStepIssue,
                isLoading: false, messageType: undefined, cognitiveAnalysisData: null, mockEvidenceSegments: data.mockEvidenceSegments
             });
         }
         appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
         setLastFailedStepInfo({stage: 'cognitive', input: variables, messageIdToUpdate: cognitiveAnalysisMsgIdRef.current});
         return;
      }
      
      if (cognitiveAnalysisMsgIdRef.current) {
        updateMessageInList(cognitiveAnalysisMsgIdRef.current, {
          content: data.answer, 
          messageType: 'cognitive_analysis_table',
          cognitiveAnalysisData: parsedAnalysis,
          isLoading: false,
          mockEvidenceSegments: data.mockEvidenceSegments,
        });
      }
      appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
      setStoredCognitiveAnalysis(parsedAnalysis);

      if (simpleMode) {
        setInteractionStage('IDLE_AFTER_DEEP_RESEARCH');
        return;
      }

      if (parsedAnalysis && originalUserQueryRef.current) {
        clarificationMsgIdRef.current = addMessageToList('assistant', '', true, 'clarification_loading');
        clarificationMutation.mutate({
          cognitiveAnalysis: parsedAnalysis,
          originalQuestion: originalUserQueryRef.current,
        });
      } else {
        console.error("Critical error: Missing parsedAnalysis or originalUserQuery for clarification step.");
        if(clarificationMsgIdRef.current) updateMessageInList(clarificationMsgIdRef.current, {content: t.clarificationMissingContextError, isLoading: false});
        resetInitialChainStates();
      }
    },
    onError: (error: Error, variables) => handleMutationError(error, "Cognitive Analysis", cognitiveAnalysisMsgIdRef, 'cognitive', variables),
    retry: 2,
    retryDelay,
  });

  const clarificationMutation = useMutation({
    mutationFn: async (input: GenerateClarificationInput) => {
      setInteractionStage('PROCESSING_CLARIFICATION');
      logMetric('Clarification mutation start');
      const model = localStorage.getItem('cq_model') || undefined;
      const provider = localStorage.getItem('cq_provider') || undefined;
      const modelUrl = localStorage.getItem('cq_model_url') || undefined;
      if (provider === 'transformersjs') {
        const query = `Clarify: ${input.originalQuestion}`;
        const clarificationText = await queryBrowserLLM(query);
        return { clarificationText, mockEvidenceSegments: [], queued: false, usingMock: false } as GenerateClarificationOutput;
      }
      return generateClarificationAction(
        input,
        model,
        provider,
        currentCorrelationId ?? undefined,
        modelUrl || undefined
      );
    },
    onSuccess: (data: GenerateClarificationOutput, variables) => {
      logMetric('Clarification mutation success');
      if (data.queued) {
        const t: AppTranslations = getTranslations(getSavedLanguage());
        toast({
          title: t.tooManyRequestsTitle,
          description: t.tooManyRequestsDescription,
        });
      }
      if (
        data.mockEvidenceSegments &&
        data.mockEvidenceSegments.length > 0 &&
        data.mockEvidenceSegments[data.mockEvidenceSegments.length - 1].status !== 'SUCCESS'
      ) {
        if (clarificationMsgIdRef.current) {
          updateMessageInList(clarificationMsgIdRef.current, {
            content:
              data.mockEvidenceSegments[data.mockEvidenceSegments.length - 1].summary ||
              t.clarificationStepIssue,
            isLoading: false,
            messageType: undefined,
            mockEvidenceSegments: data.mockEvidenceSegments,
          });
        }
        appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
        setLastFailedStepInfo({
          stage: 'clarification',
          input: variables,
          messageIdToUpdate: clarificationMsgIdRef.current,
        });
        return;
      }

      if (clarificationMsgIdRef.current) {
        updateMessageInList(clarificationMsgIdRef.current, {
          content: data.clarificationText,
          messageType: 'clarification_questions',
          isLoading: false,
          mockEvidenceSegments: data.mockEvidenceSegments,
        });
      }
      appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
      setInteractionStage('AWAITING_USER_CLARIFICATION');
    },
    onError: (error: Error, variables) => handleMutationError(error, "Clarification Generation", clarificationMsgIdRef, 'clarification', variables),
    retry: 2,
    retryDelay,
  });

  const deepResearchMutation = useMutation({
    mutationFn: async (input: DeepResearchInput) => {
      setInteractionStage('PROCESSING_DEEP_RESEARCH');
      logMetric('Deep research mutation start');
      const model = localStorage.getItem('cq_model') || undefined;
      const provider = localStorage.getItem('cq_provider') || undefined;
      const modelUrl = localStorage.getItem('cq_model_url') || undefined;
      if (provider === 'transformersjs') {
        const query = `${input.originalQuestion}\nClarification:${input.userClarification || 'No further clarification provided.'}`;
        const summary = await queryBrowserLLM(query);
        return { summary, nodes: [], edges: [], mockEvidenceSegments: [], queued: false, correlationId: uuidv4(), usingMock: false } as DeepResearchOutput;
      }
      return deepResearchAction(
        input,
        model,
        provider,
        currentCorrelationId ?? undefined,
        modelUrl || undefined
      );
    },
    onSuccess: (data: DeepResearchOutput, variables) => {
      logMetric('Deep research mutation success');
      if (data.correlationId) {
        setCurrentCorrelationId(data.correlationId);
      }
      if (data.queued) {
        const t: AppTranslations = getTranslations(getSavedLanguage());
        toast({
          title: t.tooManyRequestsTitle,
          description: t.tooManyRequestsDescription,
        });
      }
      if (
        data.mockEvidenceSegments &&
        data.mockEvidenceSegments.length > 0 &&
        data.mockEvidenceSegments[data.mockEvidenceSegments.length - 1].status !== 'SUCCESS'
      ) {
        if (deepResearchMsgIdRef.current) {
          updateMessageInList(deepResearchMsgIdRef.current, {
            content:
              data.mockEvidenceSegments[data.mockEvidenceSegments.length - 1].summary ||
              t.deepResearchStepIssue,
            isLoading: false,
            messageType: undefined,
            mockEvidenceSegments: data.mockEvidenceSegments,
          });
        }
        appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
        setLastFailedStepInfo({
          stage: 'deepResearch',
          input: variables,
          messageIdToUpdate: deepResearchMsgIdRef.current,
        });
        return;
      }

      if (deepResearchMsgIdRef.current) {
        updateMessageInList(deepResearchMsgIdRef.current, {
          content: data.summary,
          messageType: 'deep_research_summary',
          isLoading: false,
          mockEvidenceSegments: data.mockEvidenceSegments,
        });
      }
      appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
      setDeepResearchNodes(data.nodes);
      setDeepResearchEdges(data.edges);
      setInteractionStage('IDLE_AFTER_DEEP_RESEARCH');
    },
    onError: (error: Error, variables) => handleMutationError(error, "Deep Research", deepResearchMsgIdRef, 'deepResearch', variables),
    retry: 2,
    retryDelay,
  });

  const simpleChatMutation = useMutation({
    mutationFn: async (input: AnswerQuestionInput) => {
      setInteractionStage('INITIAL_QUERY');
      logMetric('Simple chat mutation start');
      const model = localStorage.getItem('cq_model') || undefined;
      const provider = localStorage.getItem('cq_provider') || undefined;
        const modelUrl = localStorage.getItem('cq_model_url') || undefined;
      if (provider === 'transformersjs') {
        const answer = await queryBrowserLLM(input.question);
        return { answer, mockEvidenceSegments: [], queued: false, correlationId: uuidv4(), usingMock: false } as AnswerQuestionOutput;
      }
      return simpleChatAction(
        input,
        model,
        provider,
        currentCorrelationId ?? undefined,
        modelUrl || undefined
      );
    },
    onSuccess: (data: AnswerQuestionOutput) => {
      logMetric('Simple chat mutation success');
      if (data.correlationId) {
        setCurrentCorrelationId(data.correlationId);
      }
      if (simpleChatMsgIdRef.current) {
        updateMessageInList(simpleChatMsgIdRef.current, {
          content: data.answer,
          isLoading: false,
          messageType: undefined,
        });
      }
      appendEvidenceAndUpdateDuration(data.mockEvidenceSegments);
      setInteractionStage('IDLE_AFTER_DEEP_RESEARCH');
    },
    onError: (error: Error, variables) => handleMutationError(error, 'Simple Chat', simpleChatMsgIdRef, 'simpleChat', variables),
    retry: 2,
    retryDelay,
  });

  const handleTryAgain = useCallback(() => {
    if (!lastFailedStepInfo) return;

    logMetric('Retrying failed step', { stage: lastFailedStepInfo.stage });

    const { stage, input, messageIdToUpdate } = lastFailedStepInfo;
    setLastFailedStepInfo(null); // Clear failure state before retrying

    if (messageIdToUpdate) {
        // Reset message to loading state
        if (stage === 'cognitive') {
            updateMessageInList(messageIdToUpdate, { content: '', isLoading: true, messageType: 'cognitive_analysis_loading', cognitiveAnalysisData: null });
        } else if (stage === 'clarification') {
            updateMessageInList(messageIdToUpdate, { content: '', isLoading: true, messageType: 'clarification_loading' });
        } else if (stage === 'deepResearch') {
            updateMessageInList(messageIdToUpdate, { content: '', isLoading: true, messageType: 'deep_research_summary' });
        } else if (stage === 'simpleChat') {
            updateMessageInList(messageIdToUpdate, { content: '', isLoading: true });
        }
    }

    // Re-trigger mutation
    if (stage === 'cognitive') cognitiveAnalysisMutation.mutate(input as AnswerQuestionInput);
    else if (stage === 'clarification') clarificationMutation.mutate(input as GenerateClarificationInput);
    else if (stage === 'deepResearch') deepResearchMutation.mutate(input as DeepResearchInput);
    else if (stage === 'simpleChat') simpleChatMutation.mutate(input as AnswerQuestionInput);

  }, [
    lastFailedStepInfo,
    updateMessageInList,
    cognitiveAnalysisMutation,
    clarificationMutation,
    deepResearchMutation,
    simpleChatMutation,
  ]);

  const clearLastFailedStep = useCallback(() => {
      setLastFailedStepInfo(null);
      logMetric('Cleared last failed step');
  }, []);

  const submitQuery = async (
    query: string,
    attachmentInput?: { name: string; type: string; dataUri?: string } | null,
    skillName?: string | null
  ) => {
    logMetric('Submit query', { query, skillName });
    const tokenBudget = Number(localStorage.getItem('tokenBudget') || '16000');
    const timeBudgetSeconds = Number(localStorage.getItem('timeBudget') || '300');
    const userMessageId = addMessageToList(
        'user',
        query,
        false,
        undefined,
        undefined,
        attachmentInput?.name,
        attachmentInput?.dataUri // This passes preview URL for user messages
    );

    // Ensure any pending "try again" state is cleared if user submits a new query
    if (lastFailedStepInfo) {
        setLastFailedStepInfo(null);
    }

    if (interactionStage === 'AWAITING_USER_CLARIFICATION') {
      if (originalUserQueryRef.current && storedCognitiveAnalysis) {
        deepResearchMsgIdRef.current = addMessageToList(
          'assistant',
          '',
          true,
          'deep_research_summary',
        );
        setCurrentEvidenceSegments([]); // Clear evidence from previous steps
        setLastStepDurationMs(null);
        deepResearchMutation.mutate({
          userClarification: query,
          originalQuestion: originalUserQueryRef.current,
          cognitiveAnalysis: storedCognitiveAnalysis,
          tokenBudget: tokenBudget,
          timeBudgetSeconds: timeBudgetSeconds,
        });
      } else {
        const t: AppTranslations = getTranslations(getSavedLanguage());
        toast({ title: t.missingContextTitle, description: t.missingContextDescription, variant: "destructive" });
      }
    } else {
      if (interactionStage !== 'INITIAL_QUERY') {
        resetForNewQueryCycle(); 
      }
      originalUserQueryRef.current = query;
      if (attachmentInput) {
        setOriginalUserAttachment(attachmentInput);
        try {
          await ingestDocument({
            attachment_name: attachmentInput.name,
            attachment_type: attachmentInput.type,
            attachment_data_uri: attachmentInput.dataUri,
          }, currentCorrelationId ?? undefined);
        } catch {
          // ignore ingestion errors; toast already shown when selecting file
        }
      } else {
        setOriginalUserAttachment(null);
      }

      if (USE_TOOL_API && skillName) {
        try {
          const res = await fetch('/api/tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: skillName, query })
          });
          const data = await res.json();
          toast({ title: data.message });
        } catch (err) {
          const t: AppTranslations = getTranslations(getSavedLanguage());
          toast({ title: t.toolFailedTitle, variant: "destructive" });
        }
      }

      setCurrentEvidenceSegments([]); // Clear previous evidence
      setLastStepDurationMs(null);
      const tokenBudget = Number(localStorage.getItem('tokenBudget') || '16000');
      const timeBudgetSeconds = Number(localStorage.getItem('timeBudget') || '300');

      if (!simpleMode) {
        cognitiveAnalysisMsgIdRef.current = addMessageToList('assistant', '', true, 'cognitive_analysis_loading');
        cognitiveAnalysisMutation.mutate({ question: query, attachment: attachmentInput ?? undefined, tool: skillName ?? undefined, tokenBudget, timeBudgetSeconds });
      } else {
        simpleChatMsgIdRef.current = addMessageToList('assistant', '', true);
        simpleChatMutation.mutate({ question: query, attachment: attachmentInput ?? undefined, tool: skillName ?? undefined, tokenBudget, timeBudgetSeconds });
      }
    }
  };
  
  const isProcessingCognitiveAnalysis = cognitiveAnalysisMutation.isPending;
  const isProcessingClarification = clarificationMutation.isPending;
  const isProcessingDeepResearch = deepResearchMutation.isPending;
  const isProcessingSimpleChat = simpleChatMutation.isPending;

  const isProcessingInitialChain = isProcessingCognitiveAnalysis || isProcessingClarification;
  // isLoading should reflect any ongoing AI processing OR if a retryable error state exists
  const isLoading = isProcessingInitialChain || isProcessingDeepResearch || isProcessingSimpleChat || !!lastFailedStepInfo;

  // Consolidate errors - though React Query typically manages this well per mutation
  const error = (
    cognitiveAnalysisMutation.error ||
    clarificationMutation.error ||
    deepResearchMutation.error
  ) as Error | null;

  return {
    messages,
    submitQuery,
    isLoading,
    error,
    currentEvidenceSegments,
    showEvidenceForStatement,
    currentUserMessagesTokenCount,
    interactionStage,
    deepResearchNodes,
    deepResearchEdges,
    isProcessingInitialChain,
    isProcessingClarification, // Kept for potential specific UI if needed
    isProcessingDeepResearch,  // Kept for potential specific UI if needed
    isProcessingSimpleChat,
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
  };
}

