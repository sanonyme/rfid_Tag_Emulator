import { useCallback, useState } from 'react'
import { Package, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '@/lib/utils'
import { loadDbCredentials } from '@/lib/db-credentials'
import { fetchCartonUpcLines } from '@/lib/carton-upc'

interface CartonUpcFillProps {
  host: string
  onApply: (content: string) => void
  className?: string
  inputClassName?: string
  buttonClassName?: string
}

export function CartonUpcFill({ host, onApply, className, inputClassName, buttonClassName }: CartonUpcFillProps) {
  const [carton, setCarton] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const value = carton.trim()
    if (!value) {
      toast.error('Enter a carton number')
      return
    }
    if (!host.trim()) {
      toast.error('Enter the host IP first')
      return
    }

    setLoading(true)
    try {
      const creds = await loadDbCredentials()
      if (!creds) {
        toast.error('Save MySQL credentials in the Database tab first (with “Remember credentials”).')
        return
      }

      const result = await fetchCartonUpcLines(host, creds.user, creds.pass, value)
      onApply(result.text)
      const skipped = result.skipped > 0 ? ` · skipped ${result.skipped} without a numeric UPC` : ''
      const order = result.orderNumber ? ` · order ${result.orderNumber}` : ''
      toast.success(
        `Loaded ${result.itemCount} UPC line${result.itemCount === 1 ? '' : 's'} (${result.tagCount} tags) from carton ${result.sscc}${order}${skipped}`,
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load carton items')
    } finally {
      setLoading(false)
    }
  }, [carton, host, onApply])

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor="fixed-carton-sscc" className="text-sm font-medium">
        Carton number
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="fixed-carton-sscc"
          value={carton}
          onChange={(e) => setCarton(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.repeat) return
            e.preventDefault()
            void load()
          }}
          placeholder="SSCC"
          disabled={loading}
          className={cn('h-10 min-w-0 flex-1 rounded-lg border-border/50 font-mono text-sm shadow-none', inputClassName)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
          className={cn('h-10 shrink-0 rounded-lg px-3', buttonClassName)}
        >
          {loading ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Package className="h-4 w-4" />
          )}
          Load
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        If the carton has expected items, fills UPC,QTY from the packing list
      </p>
    </div>
  )
}
