import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { Wifi, Radio, Smartphone, ScanLine, Workflow, FolderOpen, ChevronRight, ChevronLeft, X } from 'lucide-react'

const STEPS = [
  {
    icon: Wifi,
    title: 'Connect to your Edge server',
    description: 'Enter the IP address of your RFID Edge server and connect. The app uses TCP port 12352 by default. Use the connection button in the title bar or status area.',
  },
  {
    icon: Radio,
    title: 'Fixed Reader',
    description: 'Simulate RFID tags from a fixed reader. Enter UPC codes with counts (e.g. 038257246520,12) or paste EPCs directly. Choose driver (LLRP, ARP, etc.), antenna, and RSSI. Click Send to emulate tag reads.',
  },
  {
    icon: Smartphone,
    title: 'Handheld',
    description: 'Act as a handheld server so clients can subscribe to tag events. Configure UPC/EPC lists per port. Clients connect to the handheld port (default 10472) to receive simulated tag reads.',
  },
  {
    icon: ScanLine,
    title: 'OCR & Custom',
    description: 'Send OCR messages to Inditex/Tempe systems (port 10482) or custom TCP messages to any host/port. Useful for testing barcode workflows.',
  },
  {
    icon: Workflow,
    title: 'Automation',
    description: 'Build sequences of actions: delays, OCR messages, fixed tag reads, handheld tags. Add steps, configure them, and run the full sequence to automate testing scenarios.',
  },
  {
    icon: FolderOpen,
    title: 'Profiles & Settings',
    description: 'Save your connection, tags, and automation configs as profiles. Switch between them quickly. Customize appearance, themes, and behavior in Settings.',
  },
]

interface OnboardingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OnboardingDialog({ open, onOpenChange }: OnboardingDialogProps) {
  const [step, setStep] = useState(0)
  const Icon = STEPS[step].icon

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      onOpenChange(false)
    }
  }

  const handleBack = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl shadow-xl">
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              {STEPS[step].title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed pt-1">
              {STEPS[step].description}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8 rounded-full"
            onClick={handleSkip}
            aria-label="Skip tutorial"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 pt-4">
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-primary' : i < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={step === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button size="sm" onClick={handleNext}>
              {step < STEPS.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              ) : (
                'Finish'
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            Skip tutorial
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
