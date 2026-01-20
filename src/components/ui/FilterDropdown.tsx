import React from 'react'
import { ChevronDown } from 'lucide-react'

interface FilterDropdownProps {
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string }[]
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

export default function FilterDropdown({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className = '',
  id,
}: FilterDropdownProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`
          appearance-none w-full
          px-4 py-2.5 pr-10
          bg-white border border-gray-300 
          rounded-xl 
          text-sm font-medium text-gray-700
          shadow-sm
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none
          hover:border-gray-400
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50
          cursor-pointer
        `}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
        <ChevronDown className="w-4 h-4" />
      </div>
    </div>
  )
}
