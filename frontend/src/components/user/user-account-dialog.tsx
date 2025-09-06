
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
import { Separator } from "@/components/ui/separator";
import { useToast } from '@/hooks/use-toast';
import { CreditCard, User, Star, Loader2, AlertTriangle, BadgeCheck, ShieldAlert, LogOut, Mail } from 'lucide-react';
import { ContactSupportDialog } from './contact-support-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/utils';
import { createCheckoutSession } from '@/lib/payment';
import type { AppTranslations } from '@/lib/translations';

interface UserAccountDialogProps {
  children: React.ReactNode; // To use as DialogTrigger
  onLogout: () => void;
  t: AppTranslations;
}

type PaymentStep = 'initial' | 'enter_details' | 'confirming_payment_setup' | 'processing_payment' | 'premium' | 'cancelling_confirmation';

export function UserAccountDialog({ children, onLogout, t }: UserAccountDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"Free Tier" | "Premium User">("Free Tier");
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('initial');
  
  const [mockCardNumber, setMockCardNumber] = useState("•••• •••• •••• 4242");
  const [mockExpiry, setMockExpiry] = useState("12/26");
  const [mockCvc, setMockCvc] = useState("•••");
  const [isProcessing, setIsProcessing] = useState(false); // Kept for general processing state if needed outside steps
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const status = localStorage.getItem("subscription_status");
      if (status === "premium") {
        setSubscriptionStatus("Premium User");
        toast({
          title: t.upgradeSuccessTitle,
          description: t.upgradeSuccessDescription,
          variant: "default",
          className: "bg-green-500 text-white",
        });
      }
    }
  }, [toast, t.upgradeSuccessTitle, t.upgradeSuccessDescription]);

  useEffect(() => {
    if (!isOpen && subscriptionStatus !== "Premium User") {
      setPaymentStep('initial');
      setIsProcessing(false);
    }
  }, [isOpen, subscriptionStatus]);

  const handleInitiateUpgrade = () => {
    setPaymentStep('enter_details');
  };

  const handleProceedToPaymentSetup = () => {
    if (mockCardNumber.length < 19 || mockExpiry.length < 5 || mockCvc.length < 3) {
      toast({ title: t.invalidDetailsTitle, description: t.invalidDetailsDescription, variant: "destructive" });
      return;
    }
    setPaymentStep('confirming_payment_setup');
  }

  const handleSetupPaymentMethod = async () => {
    setPaymentStep('processing_payment');
    setIsProcessing(true);
    try {
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (err) {
      setPaymentStep('enter_details');
      toast({
        title: t.paymentSetupFailedTitle,
        description: t.paymentSetupFailedDescription,
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  const handleInitiateCancelSubscription = () => {
    setShowCancelConfirmDialog(true);
  };

  const handleConfirmCancelSubscription = () => {
    setSubscriptionStatus("Free Tier");
    setPaymentStep('initial');
    if (typeof window !== "undefined") {
      localStorage.removeItem("subscription_status");
      fetch("/api/cancel-subscription", { method: "POST" }).catch(() => {
        console.error("Unable to update subscription status on server");
      });
    }
    toast({
      title: t.subscriptionCancelledTitle,
      description: t.subscriptionCancelledDescription,
    });
    setShowCancelConfirmDialog(false);
  };

  const handleLogoutClick = () => {
    onLogout();
    setIsOpen(false); 
    toast({ title: t.loggedOutTitle, description: t.loggedOutDescription });
  };


  const renderContentByStep = () => {
    switch (paymentStep) {
      case 'initial':
        return (
          <>
            <p className="text-sm"><span className="font-semibold">{t.currentPlanLabel}</span> {subscriptionStatus}</p>
            {subscriptionStatus === "Free Tier" && (
              <Button onClick={handleInitiateUpgrade} className="w-full mt-4 bg-green-600 hover:bg-green-700">
                <CreditCard className="mr-2 h-4 w-4" /> {t.upgradeToPremiumButton}
              </Button>
            )}
            {subscriptionStatus === "Premium User" && (
              <>
                <div className="p-3 bg-muted rounded-md text-sm mt-2">
                  <p className="flex items-center text-green-700">
                    <BadgeCheck className="mr-2 h-5 w-5" />
                    {t.premiumSubscriptionActive}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{t.paymentMethodLast4Label.replace('{last4}', '4242')}</p>
                </div>
                <Button onClick={handleInitiateCancelSubscription} variant="outline" className="w-full mt-4 border-red-500 text-red-500 hover:bg-red-50">
                  <ShieldAlert className="mr-2 h-4 w-4" /> {t.cancelSubscriptionButton}
                </Button>
              </>
            )}
          </>
        );
      case 'enter_details':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t.paymentDetailsPrompt}</p>
            <div className="space-y-1">
              <Label htmlFor="cardNumber" className="text-xs">{t.cardNumberLabel}</Label>
              <Input id="cardNumber" placeholder="•••• •••• •••• ••••" value={mockCardNumber} onChange={(e) => setMockCardNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="expiryDate" className="text-xs">{t.expiryDateLabel}</Label>
                <Input id="expiryDate" placeholder="MM/YY" value={mockExpiry} onChange={(e) => setMockExpiry(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cvc" className="text-xs">{t.cvcLabel}</Label>
                <Input id="cvc" placeholder="•••" value={mockCvc} onChange={(e) => setMockCvc(e.target.value)} />
              </div>
            </div>
             <Button onClick={handleProceedToPaymentSetup} className="w-full mt-4">{t.reviewPaymentSetupButton}</Button>
             <Button variant="outline" onClick={() => setPaymentStep('initial')} className="w-full mt-2">{t.backButton}</Button>
          </div>
        );
      case 'confirming_payment_setup':
        return (
            <div className="space-y-4">
                <p className="text-sm font-medium">{t.confirmPaymentMethodPrompt}</p>
                <div className="p-3 border rounded-md bg-muted/50">
                    <p className="text-sm">{t.confirmPaymentPlanLabel}</p>
                    <p className="text-sm">{t.confirmPaymentCardLabel.replace('{last4}', mockCardNumber.slice(-4))}</p>
                    <p className="text-sm font-semibold mt-2">{t.setupPaymentFutureBillingNotice}</p>
                </div>
                <Button onClick={handleSetupPaymentMethod} className="w-full bg-green-600 hover:bg-green-700">
                    {t.setupPaymentMethodButton}
                </Button>
                <Button variant="outline" onClick={() => setPaymentStep('enter_details')} className="w-full mt-2">{t.editDetailsButton}</Button>
            </div>
        );
      case 'processing_payment':
        return (
          <div className="flex flex-col items-center justify-center space-y-3 p-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{t.processingPayment}</p>
          </div>
        );
      case 'premium':
        return (
             <>
                <p className="text-sm"><span className="font-semibold">{t.currentPlanLabel}</span> {subscriptionStatus}</p>
                <div className="p-3 bg-muted rounded-md text-sm mt-2">
                    <p className="flex items-center text-green-700">
                        <BadgeCheck className="mr-2 h-5 w-5" />
                        {t.premiumSubscriptionActive}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t.paymentMethodLast4Label.replace('{last4}', '4242')}</p>
                </div>
                <Button onClick={handleInitiateCancelSubscription} variant="outline" className="w-full mt-4 border-red-500 text-red-500 hover:bg-red-50">
                    <ShieldAlert className="mr-2 h-4 w-4" /> {t.cancelSubscriptionButton}
                </Button>
             </>
        );
      default: // Includes 'cancelling_confirmation' - confirmation handled by AlertDialog
        return <p>{t.unexpectedErrorMessage}</p>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <User className="mr-2 h-5 w-5" /> {t.userAccountTitle}
          </DialogTitle>
          <DialogDescription>
            {t.userAccountDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-2">{t.profileHeading}</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>{t.noProfileInfo}</p>
            </div>
          </div>
          <Separator />
          <div>
            <h3 className="text-lg font-medium mb-2">{t.subscriptionPaymentHeading}</h3>
            {paymentStep === 'processing_payment' ? ( // Use the step for specific loading UI
                 <div className="flex flex-col items-center justify-center space-y-3 p-6">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t.processingPayment}</p>
                 </div>
            ) : renderContentByStep()}
          </div>
          <Separator />
           <Button variant="outline" onClick={handleLogoutClick} className="w-full">
                <LogOut className="mr-2 h-4 w-4" /> {t.logoutButton}
            </Button>
          <ContactSupportDialog t={t}>
            <Button variant="outline" className="w-full mt-2">
              <Mail className="mr-2 h-4 w-4" /> {t.contactSupportButton}
            </Button>
          </ContactSupportDialog>
        </div>

        <DialogFooter className={cn("gap-2 sm:gap-0", paymentStep === 'processing_payment' ? "hidden": "")}>
          {paymentStep !== 'processing_payment' && ( // Hide close if processing
             <DialogClose asChild>
                <Button type="button" variant="outline">
                {t.closeButton}
                </Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
      
      <AlertDialog open={showCancelConfirmDialog} onOpenChange={setShowCancelConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.cancelPremiumTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.cancelPremiumDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCancelConfirmDialog(false)}>{t.keepSubscriptionLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancelSubscription} className="bg-red-600 hover:bg-red-700">
              {t.confirmCancelSubscription}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
    

    