import { CloudDownload } from 'lucide-react'

interface ExportButtonProps {
  onClick: () => void
  disabled?: boolean
  isLoading?: boolean
  text?: string
  className?: string
}

export default function ExportButton({ 
  onClick, 
  disabled = false, 
  isLoading = false,
  text = 'EXPORT',
  className = ''
}: ExportButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        flex items-center gap-2 
        px-4 py-2.5 
        bg-white border border-gray-300 
        rounded-lg 
        text-sm font-medium text-gray-700 
        hover:bg-gray-50 hover:border-gray-400
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        uppercase tracking-wide
        shadow-sm
        ${className}
      `}
    >
      <CloudDownload className="w-4 h-4 text-gray-500" />
      <span>{isLoading ? 'Exporting...' : text}</span>
    </button>
  )
}
