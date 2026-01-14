'use client'

import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { peertutorservice, peertutors } from '@/lib/services/peerTutorService'
import { X, Upload, AlertCircle, CheckCircle, Download } from 'lucide-react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { useAuth } from '@/lib/auth/AuthContext'

import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface peertutorsImportModalProps {
  dept: string
  year: string
  section: string
  onClose: () => void
  onSuccess: () => void
}



interface Processedpeertutors {
  peertutors: peertutors | null
  microsoftUser?: { displayName: string; mail: string; userPrincipalName: string } | null
  name: string
  email?: string
  foundIn: 'local' | 'microsoft' | 'not_found' | 'allocated'
  status: 'valid' | 'missing' | 'allocated'
  year?: string
  section?: string
}

export default function PeerTutorImportModal({
  dept,
  year,
  section,
  onClose,
  onSuccess
}: peertutorsImportModalProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedData, setProcessedData] = useState<Processedpeertutors[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const handleExport = async () => {
    try {
      setIsProcessing(true)
      
      let peerTutor: peertutors[] = []
      if (dept && year && section) {
        peerTutor = await peertutorservice.getpeerTutorBySection(dept, year, section)
      } else {
        peerTutor = await peertutorservice.getAllpeerTutor()
        if (dept) {
          peerTutor = peerTutor.filter(pt => pt.dept === dept)
        }
      }
      
      const exportData = [
        ['Peer Tutor Name', 'Peer Tutor Email', 'Year', 'Section']
      ]
      
      peerTutor.forEach(pt => {
        exportData.push([pt.name, pt.email, pt.year, pt.section])
      })
      
      // If we are exporting a blank template because no data exists, add an example row
      if (peerTutor.length === 0) {
        exportData.push(['Example Name', 'example@sonatech.ac.in', '2', 'A'])
      }
      
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      ws['!cols'] = [
        { wch: 30 },
        { wch: 35 },
        { wch: 10 },
        { wch: 10 }
      ]
      
      XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutors')
      const fileName = year && section 
        ? `peer_tutors_${dept}_${year}_${section}.xlsx`
        : `peer_tutors_${dept}_template.xlsx`
      XLSX.writeFile(wb, fileName)
      
    } catch (error) {
      console.error('Error exporting peer tutors:', error)
      toast.error('Error exporting data. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsProcessing(true)
      
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data)
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[]
      
      const existingpeerTutor = await peertutorservice.getAllpeerTutor()
      
      const processed: Processedpeertutors[] = []

      // Helper for case-insensitive column lookup
      const getValue = (row: Record<string, unknown>, targetKey: string) => {
        const key = Object.keys(row).find(k => k.toLowerCase().trim() === targetKey.toLowerCase().trim())
        return key ? row[key] : undefined
      }
      
      for (const row of jsonData) {
        // Try multiple variations for column names
        const name = (getValue(row, 'Peer Tutor Name') || getValue(row, 'Name') || getValue(row, 'Peer Tutor') || '') as string
        const email = (getValue(row, 'Peer Tutor Email') || getValue(row, 'Email') || getValue(row, 'Mail') || '') as string
        const rowYear = (getValue(row, 'Year') || year || '') as string
        const rowSection = (getValue(row, 'Section') || section || '') as string

        const cleanName = name?.toString().trim() || ''
        const cleanEmail = email?.toString().trim() || ''
        const cleanYear = rowYear?.toString().trim() || ''
        const cleanSection = rowSection?.toString().trim() || ''
        
        if (!cleanName && !cleanEmail) continue
        
        // Use the year and section from the row, or fallback to props
        const targetYear = cleanYear
        const targetSection = cleanSection
        
        if (!targetYear || !targetSection) {
          console.warn(`Missing year or section for ${cleanName || cleanEmail}`)
        }
        
        const result = await findpeertutors(existingpeerTutor, cleanName, cleanEmail, targetYear, targetSection)
        
        processed.push({
          peertutors: result.tutor,
          microsoftUser: result.microsoftUser,
          name: result.tutor?.name || result.microsoftUser?.displayName || cleanName || 'Unknown',
          email: result.tutor?.email || result.microsoftUser?.mail || cleanEmail,
          foundIn: result.foundIn,
          status: result.foundIn === 'allocated' ? 'allocated' : (result.tutor || result.microsoftUser ? 'valid' : 'missing'),
          year: targetYear,
          section: targetSection
        })
      }
      
      setProcessedData(processed)
      setShowPreview(true)
      
    } catch (error) {
      console.error('Error processing file:', error)
      toast.error('Error processing file. Please check the format and try again.')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Check if a peer tutor exists - does NOT create anything, just checks
  const findpeertutors = async (
    tutors: peertutors[],
    name?: string,
    email?: string,
    targetYear?: string,
    targetSection?: string
  ): Promise<{ 
    tutor: peertutors | null, 
    microsoftUser: { displayName: string; mail: string; userPrincipalName: string } | null,
    foundIn: 'local' | 'microsoft' | 'not_found' | 'allocated' 
  }> => {
    if (!name && !email) {
      return { tutor: null, microsoftUser: null, foundIn: 'not_found' }
    }

    // Check if email already exists in other roles (students, faculty/admin)
    if (email) {
      const supabase = createClient()
      
      // Check students table
      const { data: studentExists } = await supabase
        .from('students')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single()
      
      if (studentExists) {
        console.log(`❌ Email "${email}" already allocated as STUDENT`)
        return { tutor: null, microsoftUser: null, foundIn: 'allocated' }
      }
      
      // Check faculty table (admins)
      const { data: facultyExists } = await supabase
        .from('faculty')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single()
      
      if (facultyExists) {
        console.log(`❌ Email "${email}" already allocated as FACULTY/ADMIN`)
        return { tutor: null, microsoftUser: null, foundIn: 'allocated' }
      }
    }

    // Search local database for peer tutors - Filter by year and section if provided
    if (name) {
      const match = tutors.find(pt => 
        pt.name.toLowerCase().trim() === name.toLowerCase().trim() &&
        (!targetYear || pt.year === targetYear) &&
        (!targetSection || pt.section === targetSection)
      )
      if (match) return { tutor: match, microsoftUser: null, foundIn: 'local' }
    }
    
    if (email) {
      const match = tutors.find(pt => 
        pt.email.toLowerCase().trim() === email.toLowerCase().trim() &&
        (!targetYear || pt.year === targetYear) &&
        (!targetSection || pt.section === targetSection)
      )
      if (match) return { tutor: match, microsoftUser: null, foundIn: 'local' }
    }
    
    // Search Microsoft Graph by Email - DON'T CREATE, just find
    if (email) {
      const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)
      
      if (microsoftUser) {
        // Return the Microsoft user data for later creation
        return { 
          tutor: null, 
          microsoftUser: {
            displayName: microsoftUser.displayName,
            mail: microsoftUser.mail || microsoftUser.userPrincipalName,
            userPrincipalName: microsoftUser.userPrincipalName
          }, 
          foundIn: 'microsoft' 
        }
      }
    }

    // Search Microsoft Graph by Name (Exact Match) - DON'T CREATE, just find
    if (name) {
      // Search for users with this name (Graph API searches are "startsWith")
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)
      
      // Find exact match
      const exactMatch = microsoftUsers.find(u => u.displayName.toLowerCase().trim() === name.toLowerCase().trim())
      
      if (exactMatch) {
         // Check if this user is already allocated (by email check since we now have their email)
         if (exactMatch.mail) {
            const supabase = createClient()
            
            const { data: studentExists } = await supabase
              .from('students')
              .select('id')
              .eq('email', exactMatch.mail.toLowerCase().trim())
              .single()
              
            if (studentExists) {
               console.log(`❌ Name "${name}" (Email: ${exactMatch.mail}) already allocated as STUDENT`)
               return { tutor: null, microsoftUser: null, foundIn: 'allocated' }
            }
         }

        // Return the Microsoft user data for later creation
        return { 
          tutor: null, 
          microsoftUser: {
            displayName: exactMatch.displayName,
            mail: exactMatch.mail || exactMatch.userPrincipalName,
            userPrincipalName: exactMatch.userPrincipalName
          }, 
          foundIn: 'microsoft' 
        }
      }
    }
    
    return { tutor: null, microsoftUser: null, foundIn: 'not_found' }
  }

  const handleImport = async () => {
    if (!user?.id) return
    
    try {
      setIsProcessing(true)
      
      const validTutors = processedData.filter(p => p.status === 'valid')
      
      if (validTutors.length === 0) {
        toast.warning('No valid peer tutors to import.')
        return
      }
      
      let createdCount = 0
      let existingCount = 0
      
      // Now actually create the peer tutors from Microsoft users
      for (const item of validTutors) {
        if (item.peertutors) {
          // Already exists in local database
          existingCount++
        } else if (item.microsoftUser) {
          // Create from Microsoft user
          const newTutor = await peertutorservice.createFromMicrosoftUser(
            {
              displayName: item.microsoftUser.displayName,
              mail: item.microsoftUser.mail,
              userPrincipalName: item.microsoftUser.userPrincipalName,
              id: ''
            },
            user.id,
            dept,
            item.year || year || '',
            item.section || section || ''
          )
          
          if (newTutor) {
            createdCount++
          }
        }
      }
      
      if (createdCount > 0) {
        toast.success(`Successfully imported ${createdCount} new peer tutor(s)!${existingCount > 0 ? ` (${existingCount} already existed)` : ''}`)
      } else if (existingCount > 0) {
        toast.info(`All ${existingCount} peer tutor(s) already exist in the system.`)
      }
      
      onSuccess()
      onClose()
      
    } catch (error) {
      console.error('Error importing peer tutors:', error)
      toast.error('Error importing peer tutors. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportMissing = () => {
    const missingTutors = processedData.filter(p => p.status === 'missing')
    if (missingTutors.length === 0) return

    const exportData = [
      ['Peer Tutor Name', 'Peer Tutor Email', 'Status']
    ]

    missingTutors.forEach(pt => {
      exportData.push([pt.name, pt.email || '-', 'Not Found'])
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(exportData)

    ws['!cols'] = [
      { wch: 30 },
      { wch: 35 },
      { wch: 15 }
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Missing Peer Tutors')
    XLSX.writeFile(wb, `missing_peer_tutors_${dept}_${year}_${section}.xlsx`)
  }

  const totalCount = processedData.length
  const foundCount = processedData.filter(p => p.status === 'valid').length
  const microsoftCount = processedData.filter(p => p.foundIn === 'microsoft').length
  const hasMissing = processedData.some(p => p.status === 'missing')

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">PEER TUTOR IMPORT/EXPORT</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              {dept} • {year} • {section}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 [&::-webkit-scrollbar]:hidden scrollbar-none">
          {!showPreview ? (
            <div className="space-y-6">
              {/* Excel Format Preview */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-200 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-lg font-bold text-green-900 uppercase">Excel Template Preview</h4>
                </div>
              
                <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-md">
                  <div className="grid grid-cols-4 bg-gray-600 text-white">
                    <div className="px-4 py-3 border-r uppercase border-gray-300 font-bold text-[10px] text-white">
                      Peer Tutor Name
                    </div>
                    <div className="px-4 py-3 border-r font-bold uppercase text-[10px] text-white">
                      Peer Tutor Email
                    </div>
                    <div className="px-4 py-3 border-r font-bold uppercase text-[10px] text-white">
                      Year
                    </div>
                    <div className="px-4 py-3 font-bold uppercase text-[10px] text-white">
                      Section
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-700">RAM A</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-600">ram@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-600 text-center">2</div>
                    <div className="px-4 py-2.5 text-xs text-gray-600 text-center">A</div>
                  </div>
                  
                  <div className="grid grid-cols-4 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-700">PRIYA M</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-600">priya@sonatech.ac.in</div>
                    <div className="px-4 py-2.5 border-r border-gray-200 text-xs text-gray-600 text-center">3</div>
                    <div className="px-4 py-2.5 text-xs text-gray-600 text-center">B</div>
                  </div>
                </div>
              </div>

              {/* Upload Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">UPLOAD EXCEL FILE</h4>
                <p className="text-sm text-gray-600 mb-4">Click to select or drag and drop</p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleExport}
                    disabled={isProcessing}
                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {isProcessing ? 'EXPORT TEMPLATE' : 'EXPORT TEMPLATE'}
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'PROCESSING...' : 'SELECT FILE'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Stats */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                    <div className="text-xs sm:text-sm text-gray-500 font-medium mb-1 sm:mb-2 uppercase tracking-wide">Total</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1">{totalCount}</div>
                    <div className="text-[10px] sm:text-xs text-orange-500 uppercase">peer tutors</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                    <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1 sm:mb-2 uppercase tracking-wide">Found</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1">{foundCount}</div>
                    <div className="text-[10px] sm:text-xs text-green-600 uppercase">valid</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                    <div className="text-xs sm:text-sm text-gray-500 font-medium mb-1 sm:mb-2 uppercase tracking-wide">Microsoft</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1">{microsoftCount}</div>
                    <div className="text-[10px] sm:text-xs text-purple-600 uppercase">added</div>
                  </div>

                  <div className="bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                    <div className="text-xs sm:text-sm text-gray-500 font-medium mb-1 sm:mb-2 uppercase tracking-wide">Not Found</div>
                    <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-0.5 sm:mb-1">{processedData.filter(p => p.status === 'missing').length}</div>
                    <div className="text-[10px] sm:text-xs text-red-600 uppercase">missing</div>
                  </div>
                </div>
                
                {hasMissing && (
                  <div className="mt-3 flex items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-red-800">
                        <strong>{processedData.filter(p => p.status === 'missing').length} PEER TUTOR(S) NOT FOUND</strong>
                        {' '}IN THE SYSTEM OR MICROSOFT.
                      </div>
                    </div>
                    <button
                      onClick={handleExportMissing}
                      className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded border border-red-200 transition-colors uppercase"
                    >
                      Export
                    </button>
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {processedData.map((pt: Processedpeertutors, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{pt.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">{pt.email || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm text-gray-600 font-bold">{pt.year || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <div className="text-sm text-gray-600 font-bold">{pt.section || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {pt.status === 'allocated' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                ALLOCATED
                              </span>
                            ) : pt.status === 'missing' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-red-800 border border-red-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                NOT FOUND IN MICROSOFT
                              </span>
                            ) : pt.foundIn === 'microsoft' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-purple-800 border border-purple-200">
                                FROM MICROSOFT
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                FOUND LOCALLY
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {showPreview && (
          <div className="px-8 py-6 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={() => setShowPreview(false)}
              disabled={isProcessing}
              className="h-12 px-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl text-sm font-medium transition-all"
            >
              BACK
            </button>
            <button
              onClick={handleImport}
              disabled={isProcessing || foundCount === 0}
              className="h-12 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {isProcessing ? 'IMPORTING...' : `IMPORT ${foundCount} PEER TUTOR(S)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
