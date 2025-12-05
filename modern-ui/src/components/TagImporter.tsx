import { Button } from './ui/button'
import { Upload, Download } from 'lucide-react'
import { useRef } from 'react'

interface TagImporterProps {
  onImport: (content: string) => void
  onExport: () => string
  type: 'upc' | 'epc'
}

export function TagImporter({ onImport, onExport, type }: TagImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        onImport(content)
      }
    }
    reader.readAsText(file)
    // Reset value so same file can be selected again
    e.target.value = ''
  }

  const handleExport = () => {
    const content = onExport()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_export_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        className="hidden"
        accept=".txt,.csv"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        title={`Import ${type.toUpperCase()} List`}
      >
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        title={`Export ${type.toUpperCase()} List`}
      >
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
    </div>
  )
}

