'use client'

import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { StudentService, Student } from '@/lib/services/studentService'
import { X, Upload, AlertCircle, CheckCircle, Download } from 'lucide-react'
import { MicrosoftGraphService } from '@/lib/auth/microsoftGraph'
import { useAuth } from '@/lib/auth/AuthContext'
import { createClient } from '@/utils/supabase/client'

interface StudentImportModalProps {
  dept: string
  year: string
  section: string
  onClose: () => void
  onSuccess: () => void
}



interface ProcessedStudent {
  student: Student | null
  name: string
  email?: string
  foundIn: 'local' | 'microsoft' | 'not_found' | 'allocated'
  status: 'valid' | 'missing' | 'allocated'
}

export default function StudentImportModal({
  dept,
  year,
  section,
  onClose,
  onSuccess
}: StudentImportModalProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedData, setProcessedData] = useState<ProcessedStudent[]>([])
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
      
      const students = await StudentService.getStudentsBySection(dept, year, section)
      
      const exportData = [
        ['Student Name', 'Student Email']
      ]
      
      students.forEach(s => {
        exportData.push([s.name, s.email])
      })
      
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(exportData)
      
      ws['!cols'] = [
        { wch: 30 },
        { wch: 35 }
      ]
      
      XLSX.utils.book_append_sheet(wb, ws, 'Students')
      XLSX.writeFile(wb, `students_${dept}_${year}_${section}.xlsx`)
      
    } catch (error) {
      console.error('Error exporting students:', error)
      alert('Error exporting data. Please try again.')
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
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][]
      
      const rows = jsonData.slice(1)
      
      const existingStudents = await StudentService.getStudentsBySection(dept, year, section)
      
      const processed: ProcessedStudent[] = []
      
      for (const row of rows) {
        if (row.length === 0 || row.every(cell => !cell)) continue
        
        const name = row[0]?.toString().trim() || ''
        const email = row[1]?.toString().trim() || ''
        
        if (!name && !email) continue
        
        const result = await findStudent(existingStudents, name, email)
        
        processed.push({
          student: result.student,
          name: result.student?.name || name || 'Unknown',
          email: result.student?.email || email,
          foundIn: result.foundIn,
          status: result.foundIn === 'allocated' ? 'allocated' : (result.student ? 'valid' : 'missing')
        })
      }
      
      setProcessedData(processed)
      setShowPreview(true)
      
    } catch (error) {
      console.error('Error processing file:', error)
      alert('Error processing file. Please check the format and try again.')
    } finally {
      setIsProcessing(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const findStudent = async (
    students: Student[],
    name?: string,
    email?: string
  ): Promise<{ student: Student | null, foundIn: 'local' | 'microsoft' | 'not_found' | 'allocated' }> => {
    if (!name && !email) {
      return { student: null, foundIn: 'not_found' }
    }

    // Check if email already exists in other roles (peer tutors, faculty/admin)
    if (email) {
      const supabase = createClient()
      
      // Check peer_tutors table
      const { data: tutorExists } = await supabase
        .from('peer_tutors')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single()
      
      if (tutorExists) {
        console.log(`❌ Email "${email}" already allocated as PEER TUTOR`)
        return { student: null, foundIn: 'allocated' }
      }
      
      // Check faculty table (admins)
      const { data: facultyExists } = await supabase
        .from('faculty')
        .select('id')
        .eq('email', email.toLowerCase().trim())
        .single()
      
      if (facultyExists) {
        console.log(`❌ Email "${email}" already allocated as FACULTY/ADMIN`)
        return { student: null, foundIn: 'allocated' }
      }
    }

    // Search local database for students
    if (name) {
      const match = students.find(s => s.name.toLowerCase().trim() === name.toLowerCase().trim())
      if (match) return { student: match, foundIn: 'local' }
    }
    
    if (email) {
      const match = students.find(s => s.email.toLowerCase().trim() === email.toLowerCase().trim())
      if (match) return { student: match, foundIn: 'local' }
    }
    
    // Search Microsoft Graph by Email
    if (email && user?.id) {
      const microsoftUser = await MicrosoftGraphService.getUserByEmail(email)
      
      if (microsoftUser) {
        const newStudent = await StudentService.createFromMicrosoftUser(
          microsoftUser,
          user.id,
          dept,
          year,
          section
        )
        
        if (newStudent) {
          return { student: newStudent, foundIn: 'microsoft' }
        }
      }
    }

    // Search Microsoft Graph by Name (Exact Match)
    if (name && user?.id) {
      // Search for users with this name (Graph API searches are "startsWith")
      const microsoftUsers = await MicrosoftGraphService.searchUsers(name)
      
      // Find exact match
      const exactMatch = microsoftUsers.find(u => u.displayName.toLowerCase().trim() === name.toLowerCase().trim())
      
      if (exactMatch) {
         // Check if this user is already allocated
         if (exactMatch.mail) {
            const supabase = createClient()
            
            const { data: tutorExists } = await supabase
              .from('peer_tutors')
              .select('id')
              .eq('email', exactMatch.mail.toLowerCase().trim())
              .single()
              
            if (tutorExists) {
               console.log(`❌ Name "${name}" (Email: ${exactMatch.mail}) already allocated as PEER TUTOR`)
               return { student: null, foundIn: 'allocated' }
            }
         }

        const newStudent = await StudentService.createFromMicrosoftUser(
          exactMatch,
          user.id,
          dept,
          year,
          section
        )
        
        if (newStudent) {
          return { student: newStudent, foundIn: 'microsoft' }
        }
      }
    }
    
    return { student: null, foundIn: 'not_found' }
  }

  const handleImport = async () => {
    if (!user?.id) return
    
    try {
      setIsProcessing(true)
      
      const validStudents = processedData.filter(p => p.status === 'valid')
      
      if (validStudents.length === 0) {
        alert('No valid students to import.')
        return
      }
      
      alert(`Successfully imported ${validStudents.length} student(s)!`)
      
      onSuccess()
      onClose()
      
    } catch (error) {
      console.error('Error importing students:', error)
      alert('Error importing students. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const totalCount = processedData.length
  const foundCount = processedData.filter(p => p.status === 'valid').length
  const microsoftCount = processedData.filter(p => p.foundIn === 'microsoft').length
  const hasMissing = processedData.some(p => p.status === 'missing')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">STUDENT IMPORT/EXPORT</h2>
            <p className="text-sm text-gray-600 mt-1">
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
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {!showPreview ? (
            <div className="space-y-6">
              {/* Excel Format Preview */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-200 border-2 border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-lg font-bold text-green-900">EXCEL FORMAT PREVIEW</h4>
                </div>
              
                <div className="bg-white rounded-lg border-2 border-gray-300 overflow-hidden shadow-md">
                  <div className="grid grid-cols-2 bg-gray-600 text-white">
                    <div className="px-4 py-3 border-r border-gray-300 font-bold uppercase text-xs text-white">
                      Student Name
                    </div>
                    <div className="px-4 py-3 font-bold text-xs uppercase text-white">
                      Student Email
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">RAGUL K</div>
                    <div className="px-4 py-2.5 text-sm text-gray-600">ragul.23ads@sonatech.ac.in</div>
                  </div>
                  
                  <div className="grid grid-cols-2 bg-white hover:bg-gray-50 transition-colors">
                    <div className="px-4 py-2.5 border-r border-gray-200 text-sm text-gray-700">KISHORE R</div>
                    <div className="px-4 py-2.5 text-sm text-gray-600">kishore.23ads@sonatech.ac.in</div>
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
                    {isProcessing ? 'EXPORTING...' : 'EXPORT TEMPLATE'}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Total</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{totalCount}</div>
                    <div className="text-xs text-orange-500 uppercase">students</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-600 font-medium mb-2 uppercase tracking-wide">Found</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{foundCount}</div>
                    <div className="text-xs text-green-600 uppercase">valid</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">Microsoft</div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{microsoftCount}</div>
                    <div className="text-xs text-purple-600 uppercase">added</div>
                  </div>
                </div>
                
                {hasMissing && (
                  <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-red-800">
                      <strong>{processedData.filter(p => p.status === 'missing').length} STUDENT(S) NOT FOUND</strong>
                      {' '}IN THE SYSTEM OR MICROSOFT.
                    </div>
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {processedData.map((s, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{s.name}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">{s.email || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {s.status === 'allocated' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                ALLOCATED
                              </span>
                            ) : s.status === 'missing' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                NOT FOUND IN MICROSOFT
                              </span>
                            ) : s.foundIn === 'microsoft' ? (
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
              {isProcessing ? 'IMPORTING...' : `IMPORT ${foundCount} STUDENT(S)`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
