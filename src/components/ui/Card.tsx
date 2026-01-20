import React from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  padding?: 'sm' | 'md' | 'lg'
  shadow?: 'sm' | 'md' | 'lg'
}

const cardPadding = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

const cardShadow = {
  sm: 'shadow-sm',
  md: 'shadow',
  lg: 'shadow-lg',
}

export default function Card({
  children,
  padding = 'md',
  shadow = 'md',
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200',
        cardPadding[padding],
        cardShadow[shadow],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardHeader({ children, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn('border-b border-gray-200 pb-4 mb-4', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

export function CardTitle({ children, className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn('text-lg font-medium text-gray-900', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode
}

export function CardDescription({ children, className, ...props }: CardDescriptionProps) {
  return (
    <p
      className={cn('text-sm text-gray-500 mt-1', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={cn('', className)} {...props}>
      {children}
    </div>
  )
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function CardFooter({ children, className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn('border-t border-gray-200 pt-4 mt-4', className)}
      {...props}
    >
      {children}
    </div>
  )
}
