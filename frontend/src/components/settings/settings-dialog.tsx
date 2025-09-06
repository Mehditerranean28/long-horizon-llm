
"use client";

import { useState, type ReactNode, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from '@/hooks/use-toast';
import { ApiEndpointsDialog } from './api-endpoints-dialog';
import { Separator } from '../ui/separator';
import type { AppTranslations } from '@/lib/translations';

interface SettingsDialogProps {
  children: ReactNode; // To use as DialogTrigger
  t: AppTranslations;
}

export function SettingsDialog({ children, t }: SettingsDialogProps) {
  // Existing states
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  
  // New states for additional LLM parameters
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(40);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.0);
  const [presencePenalty, setPresencePenalty] = useState(0.0);
  const [stopSequences, setStopSequences] = useState(""); // Comma-separated string
  const [tokenBudget, setTokenBudget] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tokenBudget');
      return stored ? parseInt(stored, 10) : 16000;
    }
    return 16000;
  });
  const [timeBudget, setTimeBudget] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('timeBudget');
      return stored ? parseInt(stored, 10) : 300;
    }
    return 300;
  });

  const [isOpen, setIsOpen] = useState(false);
  const [showApiEndpointsDialog, setShowApiEndpointsDialog] = useState(false);
  const { toast } = useToast();

  const handleSaveLlmSettings = () => {
    const settingsToSave = {
      temperature,
      maxTokens,
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      stopSequences: stopSequences.split(',').map(s => s.trim()).filter(s => s.length > 0),
    };
    console.log("Saving LLM settings:", settingsToSave);
    localStorage.setItem('tokenBudget', String(tokenBudget));
    localStorage.setItem('timeBudget', String(timeBudget));
    toast({
      title: t.llmSettingsSavedTitle,
      description: t.llmSettingsSavedDescription,
    });
    // setIsOpen(false); // Keep settings dialog open unless explicitly closed
  };

  // Reset local state if dialog is reopened after being closed completely
  useEffect(() => {
    if (isOpen) {
        // Optionally, fetch these from a global store or persistent storage if they were truly saved
        setTemperature(0.7);
        setMaxTokens(2048);
        setTopP(0.95);
        setTopK(40);
        setFrequencyPenalty(0.0);
        setPresencePenalty(0.0);
        setStopSequences("");
        const tb = localStorage.getItem('tokenBudget');
        setTokenBudget(tb ? parseInt(tb,10) : 16000);
        const timeb = localStorage.getItem('timeBudget');
        setTimeBudget(timeb ? parseInt(timeb,10) : 300);
    }
  }, [isOpen]);


  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t.settingsTitle}</DialogTitle>
            <DialogDescription>{t.settingsDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4 flex-grow overflow-y-auto pr-2">
            <div>
              <h4 className="text-md font-semibold mb-3">{t.llmHyperparameters}</h4>
              {/* Temperature */}
              <div className="grid grid-cols-4 items-center gap-x-4 gap-y-3">
                <Label htmlFor="temperature" className="text-right col-span-1 text-xs">
                  {t.temperature}
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Slider
                    id="temperature"
                    min={0}
                    max={2} // Allow up to 2 as per some models
                    step={0.05}
                    value={[temperature]}
                    onValueChange={(value) => setTemperature(value[0])}
                    className="flex-grow"
                  />
                  <Input
                    type="number"
                    value={temperature.toFixed(2)}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-20 h-8 text-sm shrink-0"
                    min={0} max={2} step={0.05}
                  />
                </div>

                {/* Max Tokens */}
                <Label htmlFor="max-tokens" className="text-right col-span-1 text-xs">
                  {t.maxTokens}
                </Label>
                <Input
                  id="max-tokens"
                  type="number"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 0)}
                  className="col-span-3 h-8 text-sm"
                  step={64}
                  min={1}
                />

                {/* Top P */}
                <Label htmlFor="top-p" className="text-right col-span-1 text-xs">
                  {t.topP}
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Slider
                    id="top-p"
                    min={0}
                    max={1}
                    step={0.01}
                    value={[topP]}
                    onValueChange={(value) => setTopP(value[0])}
                    className="flex-grow"
                  />
                  <Input
                    type="number"
                    value={topP.toFixed(2)}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="w-20 h-8 text-sm shrink-0"
                    min={0} max={1} step={0.01}
                  />
                </div>

                {/* Top K */}
                <Label htmlFor="top-k" className="text-right col-span-1 text-xs">
                  {t.topK}
                </Label>
                <Input
                  id="top-k"
                  type="number"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value, 10) || 0)}
                  className="col-span-3 h-8 text-sm"
                  min={0}
                />

                {/* Frequency Penalty */}
                <Label htmlFor="frequency-penalty" className="text-right col-span-1 text-xs">
                  {t.frequencyPenalty}
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Slider
                    id="frequency-penalty"
                    min={-2.0}
                    max={2.0}
                    step={0.1}
                    value={[frequencyPenalty]}
                    onValueChange={(value) => setFrequencyPenalty(value[0])}
                    className="flex-grow"
                  />
                  <Input
                    type="number"
                    value={frequencyPenalty.toFixed(1)}
                    onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                    className="w-20 h-8 text-sm shrink-0"
                    min={-2.0} max={2.0} step={0.1}
                  />
                </div>

                {/* Presence Penalty */}
                <Label htmlFor="presence-penalty" className="text-right col-span-1 text-xs">
                  {t.presencePenalty}
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Slider
                    id="presence-penalty"
                    min={-2.0}
                    max={2.0}
                    step={0.1}
                    value={[presencePenalty]}
                    onValueChange={(value) => setPresencePenalty(value[0])}
                    className="flex-grow"
                  />
                  <Input
                    type="number"
                    value={presencePenalty.toFixed(1)}
                    onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                    className="w-20 h-8 text-sm shrink-0"
                    min={-2.0} max={2.0} step={0.1}
                  />
                </div>
                
                {/* Stop Sequences */}
                <Label htmlFor="stop-sequences" className="text-right col-span-1 text-xs">
                  {t.stopSequences}
                </Label>
                <Input
                  id="stop-sequences"
                  type="text"
                  value={stopSequences}
                  onChange={(e) => setStopSequences(e.target.value)}
                  className="col-span-3 h-8 text-sm"
                  placeholder="e.g., \n, ###"
                />
              </div>
              <Button type="button" onClick={handleSaveLlmSettings} className="w-full mt-4">{t.saveLlmSettingsButton}</Button>
            </div>

            <div className="mt-6">
              <h4 className="text-md font-semibold mb-3">{t.resourceBudgets}</h4>
              <div className="grid grid-cols-4 items-center gap-x-4 gap-y-3">
                <Label htmlFor="token-budget" className="text-right col-span-1 text-xs">{t.tokenBudget}</Label>
                <Input id="token-budget" type="number" value={tokenBudget} onChange={(e) => setTokenBudget(parseInt(e.target.value,10) || 0)} className="col-span-3 h-8 text-sm" />
                <Label htmlFor="time-budget" className="text-right col-span-1 text-xs">{t.timeBudget}</Label>
                <Input id="time-budget" type="number" value={timeBudget} onChange={(e) => setTimeBudget(parseInt(e.target.value,10) || 0)} className="col-span-3 h-8 text-sm" />
              </div>
            </div>
            
            <Separator />

            <div>
              <h4 className="text-md font-semibold mb-3">{t.applicationInformation}</h4>
              <Button 
                variant="outline" 
                onClick={() => setShowApiEndpointsDialog(true)} 
                className="w-full"
              >
                {t.viewApiEndpointsButton}
              </Button>
            </div>

          </div>
          <DialogFooter className="mt-auto pt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t.closeSettings}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApiEndpointsDialog open={showApiEndpointsDialog} onOpenChange={setShowApiEndpointsDialog} t={t} />
    </>
  );
}
