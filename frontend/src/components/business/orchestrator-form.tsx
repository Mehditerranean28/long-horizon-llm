"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useActionState } from "react";
import { submitOrchestratorRequest, type OrchestratorState } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, Loader2, ListTodo, ShieldAlert, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppTranslations } from "@/lib/translations";

function SubmitButton({ pendingLabel }: { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pendingLabel}
    </Button>
  );
}

interface Props {
  t: AppTranslations;
}

export default function OrchestratorForm({ t }: Props) {
  const initialState: OrchestratorState = {};
  const [state, dispatch] = useActionState(submitOrchestratorRequest, initialState);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      if (state.result) {
        toast({
            title: t.savedSuccessTitle,
            description: state.message,
            variant: "default",
        });
      } else if (state.errors) {
        toast({
          title: t.errorArchivingTitle,
          description: state.message,
          variant: "destructive",
        });
      }
    }
  }, [state, toast, t]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">{t.businessOrchestratorInputTitle}</CardTitle>
          <CardDescription>{t.businessOrchestratorInputDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={dispatch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="taskDescription">{t.businessOrchestratorTaskDescriptionLabel}</Label>
              <Textarea
                id="taskDescription"
                name="taskDescription"
                placeholder={t.businessOrchestratorTaskDescriptionPlaceholder}
                rows={4}
                required
              />
              {state.errors?.taskDescription && <p className="text-sm font-medium text-destructive">{state.errors.taskDescription[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="desiredOutcomes">{t.businessOrchestratorDesiredOutcomesLabel}</Label>
              <Textarea
                id="desiredOutcomes"
                name="desiredOutcomes"
                placeholder={t.businessOrchestratorDesiredOutcomesPlaceholder}
                rows={4}
                required
              />
              {state.errors?.desiredOutcomes && <p className="text-sm font-medium text-destructive">{state.errors.desiredOutcomes[0]}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentSystemState">{t.businessOrchestratorCurrentStateLabel}</Label>
              <Textarea
                id="currentSystemState"
                name="currentSystemState"
                placeholder={t.businessOrchestratorCurrentStatePlaceholder}
                rows={4}
                required
              />
               {state.errors?.currentSystemState && <p className="text-sm font-medium text-destructive">{state.errors.currentSystemState[0]}</p>}
            </div>
            <SubmitButton pendingLabel={t.businessOrchestratorGenerateButton} />
          </form>
        </CardContent>
      </Card>
      
      <div className="space-y-8">
        {state.result ? (
            <Card className="bg-card">
                 <CardHeader>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                      <div>
                        <CardTitle className="font-headline text-2xl">{t.businessOrchestratorPlanReadyTitle}</CardTitle>
                        <CardDescription>{t.businessOrchestratorPlanReadyDescription}</CardDescription>
                      </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="font-headline text-lg font-semibold flex items-center gap-2 mb-2"><ListTodo /> {t.businessOrchestratorPlanTitle}</h3>
                        <p className="text-muted-foreground whitespace-pre-line">{state.result.orchestrationPlan}</p>
                    </div>
                    <div className="border-t pt-4">
                        <h3 className="font-headline text-lg font-semibold flex items-center gap-2 mb-2"><ShieldAlert /> {t.businessOrchestratorChallengesTitle}</h3>
                        <p className="text-muted-foreground whitespace-pre-line">{state.result.potentialChallenges}</p>
                    </div>
                    <div className="border-t pt-4">
                        <h3 className="font-headline text-lg font-semibold flex items-center gap-2 mb-2"><Target /> {t.businessOrchestratorMetricsTitle}</h3>
                        <p className="text-muted-foreground whitespace-pre-line">{state.result.deterministicMetrics}</p>
                    </div>
                </CardContent>
            </Card>
        ) : (
            <Card className="flex flex-col items-center justify-center text-center h-full">
                <CardHeader>
                    <CardTitle className="font-headline">{t.businessOrchestratorPlaceholderTitle}</CardTitle>
                    <CardDescription>{t.businessOrchestratorPlaceholderDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    </div>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}
