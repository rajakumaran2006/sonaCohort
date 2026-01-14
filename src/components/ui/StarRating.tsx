'use client'

import { useState } from 'react'

interface StarRatingProps {
  value: number
  onChange: (rating: number) => void
  disabled?: boolean
  readonly?: boolean
}

export default function StarRating({ value, onChange, disabled = false, readonly = false }: StarRatingProps) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          className={`p-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          onClick={() => onChange(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          onMouseLeave={() => !disabled && setHover(0)}
        >
          <svg
            className={`w-8 h-8 ${
              star <= (hover || value)
                ? 'text-yellow-400'
                : 'text-gray-300'
            } ${disabled ? 'opacity-50' : ''}`}
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
            />
          </svg>
        </button>
      ))}
    </div>
  )
}