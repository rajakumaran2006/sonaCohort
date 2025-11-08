'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

interface UseCachedDataOptions<T> {
  queryKey: (string | number | undefined)[]
  queryFn: () => Promise<T>
  enabled?: boolean
  staleTime?: number
  gcTime?: number
  initialData?: T | (() => T) // Empty/zero state initial data
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

/**
 * Custom hook that provides cached data immediately with background refresh
 * Returns cached data first (or initial empty state), then updates when fresh data arrives
 */
export function useCachedData<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes default
  gcTime = 10 * 60 * 1000, // 10 minutes default
  initialData,
  onSuccess,
  onError,
}: UseCachedDataOptions<T>) {
  const queryClient = useQueryClient()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Check if we have cached data
  const cachedData = queryClient.getQueryData<T>(queryKey)
  const hasCachedData = cachedData !== undefined

  // Use React Query to fetch/refetch data
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime,
    gcTime,
    // Only use initialData if we have cached data, otherwise let it fetch
    // When no cached data exists, don't provide initialData so React Query will fetch
    initialData: hasCachedData ? cachedData : undefined,
    // Always fetch on mount if enabled, even if we have initial data
    refetchOnMount: enabled ? 'always' : false,
    // Keep showing cached data while fetching in background
    placeholderData: (previousData) => previousData,
  })

  // Call success callback when data changes
  useEffect(() => {
    if (data && onSuccess) {
      onSuccess(data)
    }
  }, [data, onSuccess])

  // Call error callback
  useEffect(() => {
    if (error && onError) {
      onError(error as Error)
    }
  }, [error, onError])

  // Manual refresh function
  const refresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      // Small delay to show refresh animation
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  // Determine the actual data to return
  const actualData = data !== undefined 
    ? data 
    : (hasCachedData ? cachedData : (initialData instanceof Function ? initialData() : initialData))

  return {
    data: actualData,
    isLoading: isLoading && !hasCachedData, // Only show loading if no cached data
    isFetching,
    isRefreshing,
    error,
    refresh,
    hasCachedData,
  }
}

