import { Download } from 'lucide-react'

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
        flex items-center justify-center gap-2 
        px-5 py-2.5 
        bg-white border border-gray-200 
        rounded-full 
        text-[10px] font-black text-gray-600 
        uppercase tracking-widest
        hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-sm
        ${className}
      `}
    >
      <Download className={`w-3.5 h-3.5 ${isLoading ? 'animate-bounce' : ''}`} />
      <span>{isLoading ? 'EXPORTING...' : text}</span>
    </button>
  )
}
