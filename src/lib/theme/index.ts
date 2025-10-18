// Theme system exports
export { designTokens, componentTokens, statusColors } from './tokens'

// Common class combinations for consistent styling
export const commonClasses = {
  // Page layouts
  pageWrapper: 'min-h-screen bg-gray-50',
  pageContainer: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  pagePadding: 'py-6 sm:py-8',
  
  // Headers
  pageHeader: 'text-2xl font-semibold text-gray-900',
  sectionHeader: 'text-xl font-medium text-gray-900',
  cardHeader: 'text-lg font-medium text-gray-900',
  
  // Text hierarchy
  textPrimary: 'text-gray-900',
  textSecondary: 'text-gray-600',
  textTertiary: 'text-gray-500',
  textMuted: 'text-gray-400',
  
  // Buttons
  buttonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors duration-200',
  buttonSecondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md transition-colors duration-200',
  buttonDanger: 'bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors duration-200',
  buttonOutline: 'border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-md transition-colors duration-200',
  
  // Form elements
  inputBase: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
  labelBase: 'block text-sm font-medium text-gray-700 mb-2',
  
  // Cards
  cardBase: 'bg-white rounded-lg shadow border border-gray-200',
  cardPadding: 'p-6',
  cardPaddingSm: 'p-4',
  
  // Borders and dividers
  borderBase: 'border-gray-200',
  borderLight: 'border-gray-100',
  divider: 'border-t border-gray-200',
  
  // Spacing
  spaceSection: 'space-y-6',
  spaceSectionLg: 'space-y-8',
  spaceCard: 'space-y-4',
  
  // Grid layouts
  gridResponsive: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  gridCards: 'grid grid-cols-1 sm:grid-cols-2 gap-6',
  
  // Loading states
  loadingSpinner: 'animate-spin rounded-full border-b-2 border-blue-600',
  loadingOverlay: 'flex items-center justify-center h-32',
  
  // Empty states
  emptyState: 'text-center py-12',
  emptyStateIcon: 'w-12 h-12 text-gray-400 mx-auto mb-4',
  emptyStateTitle: 'text-lg font-medium text-gray-900 mb-2',
  emptyStateText: 'text-gray-500',
}
