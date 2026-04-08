import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'
import { Button } from './ui/button'
import { Wifi, Radio, ScanLine, Workflow, FolderOpen, ChevronRight, ChevronLeft } from 'lucide-react'

const STEPS = [
  {
    icon: Wifi,
    title: 'Connect',
    description: 'Use the connection control (top) to reach your Edge server on port 12352.',
  },
  {
    icon: Radio,
    title: 'Fixed & handheld',
    description: 'Fixed tab sends reader tags; Handheld runs local ports for VSBL Debug clients.',
  },
  {
    icon: ScanLine,
    title: 'OCR, custom, API',
    description: 'OCR and Custom tabs send TCP payloads; API tab posts to Inditex-style endpoints.',
  },
  {
    icon: Workflow,
    title: 'Automation & tools',
    description: 'Automation chains steps on a canvas. Decoder, generator, DB, SFTP, and LAN scan live in the other tabs.',
  },
  {
    icon: FolderOpen,
    title: 'Profiles',
    description: 'Save and load setups from the ⋮ menu. For a guided walkthrough of the UI, use Settings → Interactive tour (desktop).',
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
