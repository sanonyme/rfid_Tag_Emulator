import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { Wifi, Radio, Smartphone, ScanLine, Workflow, FolderOpen, ChevronRight, ChevronLeft } from 'lucide-react'

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
      <DialogContent className="sm:max-w-[500px] rounded-2xl border-border/50 bg-card/95 backdrop-blur-xl shadow-xl gap-5">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <span>{STEPS[step].title}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed min-h-[3.5rem]">
            {STEPS[step].description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === step ? 'w-8 bg-primary' : i < step ? 'w-2 bg-primary/40 hover:bg-primary/60' : 'w-2 bg-muted hover:bg-muted-foreground/20'
                }`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="text-muted-foreground"
            >
              Skip
            </Button>
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
      </DialogContent>
    </Dialog>
  )
}
