'use client'

import { useState } from 'react'
import { X, Mail, Download, CheckCircle2 } from 'lucide-react'
import { EmailService, ExportOption, AVAILABLE_EXPORTS } from '@/lib/services/emailService'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface EmailExportModalProps {
  isOpen: boolean
  onClose: () => void
  facultyEmail: string
  onExportsGenerated?: (exports: ExportOption[]) => void
}

export default function EmailExportModal({
  isOpen,
  onClose,
  facultyEmail,
  onExportsGenerated
}: EmailExportModalProps) {
  const [selectedExports, setSelectedExports] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'select' | 'generating' | 'ready'>('select')

  if (!isOpen) return null

  const handleToggleExport = (exportId: string) => {
    setSelectedExports(prev => {
      const newSet = new Set(prev)
      if (newSet.has(exportId)) {
        newSet.delete(exportId)
      } else {
        newSet.add(exportId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (selectedExports.size === AVAILABLE_EXPORTS.length) {
      setSelectedExports(new Set())
    } else {
      setSelectedExports(new Set(AVAILABLE_EXPORTS.map(exp => exp.id)))
    }
  }

  const handleGenerateAndSend = async () => {
    if (selectedExports.size === 0) {
      toast.warning('Please select at least one export')
      return
    }

    // Show generating state
    setStep('generating')
    
    try {
      // Get selected export objects
      const selected = AVAILABLE_EXPORTS.filter(exp => selectedExports.has(exp.id))
      
      // Call API to send email with attachments
      const result = await EmailService.sendEmailWithAttachments(
        facultyEmail,
        selected
      )
      
      if (result.success) {
        // Show success state
        setStep('ready')
        
        // Notify parent component
        if (onExportsGenerated) {
          onExportsGenerated(selected)
        }
        
        // Show success message with admin email
        setTimeout(() => {
          toast.success(`Email sent successfully to ${result.adminEmail}!`)
          setStep('select')
          setSelectedExports(new Set())
          onClose()
        }, 2000)
      } else {
        // Show error
        toast.error(`Failed to send email: ${result.error}`)
        setStep('select')
      }
    } catch (error) {
      logger.error('Error sending email:', error)
      toast.error('An error occurred while sending the email. Please try again.')
      setStep('select')
    }
  }

  const categories = EmailService.getCategories()

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Send Data to Admin</h2>
              <p className="text-xs text-gray-500 mt-0.5">Select exports to send via email</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'select' && (
            <>
              {/* Info Banner */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-blue-100 rounded-lg mt-0.5">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-blue-900 mb-1">How it works</h3>
                    <p className="text-xs text-blue-700 leading-relaxed">
                      Select the data exports you want to send. We&apos;ll generate the Excel files and send them directly 
                      to your super admin&apos;s email address with the files attached. No manual downloading or attaching required!
                    </p>
                  </div>
                </div>
              </div>

              {/* Select All */}
              <div className="mb-4 flex items-center justify-between pb-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Available Exports ({selectedExports.size} selected)
                </h3>
                <button
                  onClick={handleSelectAll}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {selectedExports.size === AVAILABLE_EXPORTS.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Export Options by Category */}
              <div className="space-y-6">
                {categories.map(category => {
                  const categoryExports = EmailService.getExportsByCategory(category.id)
                  if (categoryExports.length === 0) return null

                  return (
                    <div key={category.id}>
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                        {category.label}
                      </h4>
                      <div className="space-y-2">
                        {categoryExports.map(exportOption => (
                          <label
                            key={exportOption.id}
                            className={`
                              flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                              ${selectedExports.has(exportOption.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                              }
                            `}
                          >
                            <input
                              type="checkbox"
                              checked={selectedExports.has(exportOption.id)}
                              onChange={() => handleToggleExport(exportOption.id)}
                              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h5 className="text-sm font-bold text-gray-900">{exportOption.label}</h5>
                                {selectedExports.has(exportOption.id) && (
                                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                )}
                              </div>
                              <p className="text-xs text-gray-600 mt-1">{exportOption.description}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Generating Exports</h3>
              <p className="text-sm text-gray-600">Please wait while we prepare your data...</p>
            </div>
          )}

          {step === 'ready' && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Email Sent Successfully!</h3>
              <p className="text-sm text-gray-600 text-center max-w-md">
                Your data exports have been sent to the super admin with all files attached.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'select' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateAndSend}
              disabled={selectedExports.size === 0}
              className={`
                flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all
                ${selectedExports.size === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md'
                }
              `}
            >
              <Download className="w-4 h-4" />
              Generate & Send ({selectedExports.size})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
