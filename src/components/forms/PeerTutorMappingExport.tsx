'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { AssignmentService } from '@/lib/services/assignmentService'
import { PeerTutorService, PeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student } from '@/lib/services/studentService'

interface PeerTutorMappingExportProps {
  dept: string
  year: string
  section: string
  onClose: () => void
}

interface ExportHeader {
  collegeName: string
  department: string
  documentTitle: string
  academicYear: string
  semester: string
  year: string
  date: string
}

interface PeerTutorWithStudents {
  peerTutor: PeerTutor
  students: Student[]
}

export default function PeerTutorMappingExport({ 
  dept, 
  year, 
  section, 
  onClose 
}: PeerTutorMappingExportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [header, setHeader] = useState<ExportHeader>({
    collegeName: 'SONA COLLEGE OF TECHNOLOGY (Autonomous)',
    department: 'DEPARTMENT OF INFORMATION TECHNOLOGY',
    documentTitle: 'PEER TUTORS - SLOW LEARNERS MAPPING LIST',
    academicYear: 'ACADEMIC YEAR 2025-2026 ODD SEMESTER',
    semester: 'III',
    year: 'II ADS',
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.')
  })

  const handleExport = async () => {
    try {
      setIsExporting(true)

      // Get peer tutors with their assigned students
      const peerTutorsWithStudents = await getPeerTutorsWithStudents()
      
      if (peerTutorsWithStudents.length === 0) {
        alert('No peer tutor assignments found for this section.')
        return
      }

      // Create workbook
      const wb = XLSX.utils.book_new()
      
      // Create worksheet data
      const worksheetData = createWorksheetData(peerTutorsWithStudents)
      
      // Create worksheet
      const ws = XLSX.utils.aoa_to_sheet(worksheetData)
      
      // Apply styling and formatting
      applyWorksheetFormatting(ws, worksheetData.length)
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Peer Tutor Mapping')
      
      // Generate filename
      const filename = `Peer_Tutor_Mapping_${dept}_${year}_${section}_${new Date().toISOString().split('T')[0]}.xlsx`
      
      // Export file
      XLSX.writeFile(wb, filename)
      
      onClose()
    } catch (error) {
      console.error('Error exporting peer tutor mapping:', error)
      alert('Error exporting data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const getPeerTutorsWithStudents = async (): Promise<PeerTutorWithStudents[]> => {
    try {
      // Get all peer tutors for this section
      const peerTutors = await PeerTutorService.getPeerTutorsBySection(dept, year, section)
      
      // Get all students for this section
      const students = await StudentService.getStudentsBySection(dept, year, section)
      
      // Get assignments
      const assignments = await AssignmentService.getAssignmentsBySection(dept, year, section)
      
      // Create mapping of peer tutors to their assigned students
      const peerTutorsWithStudents: PeerTutorWithStudents[] = []
      
      for (const peerTutor of peerTutors) {
        const assignedStudentIds = assignments
          .filter(assignment => assignment.peer_tutor_id === peerTutor.id)
          .map(assignment => assignment.student_id)
        
        const assignedStudents = students.filter(student => 
          assignedStudentIds.includes(student.id)
        )
        
        peerTutorsWithStudents.push({
          peerTutor,
          students: assignedStudents
        })
      }
      
      return peerTutorsWithStudents
    } catch (error) {
      console.error('Error getting peer tutors with students:', error)
      return []
    }
  }

  const createWorksheetData = (peerTutorsWithStudents: PeerTutorWithStudents[]): any[][] => {
    const data: any[][] = []
    
    // Add header rows (rows 1-8)
    data.push([header.collegeName]) // Row 1
    data.push([header.department]) // Row 2
    data.push([header.documentTitle]) // Row 3
    data.push([header.academicYear]) // Row 4
    data.push([]) // Row 5 - empty
    data.push([`Year: ${header.year}`, '', '', '', `SEMESTER: ${header.semester}`]) // Row 6
    data.push(['', '', '', '', `Date: ${header.date}`]) // Row 7
    data.push([]) // Row 8 - empty
    
    // Add table headers (row 9)
    data.push(['S NO', 'Name of the tutor', 'Year/Sec', 'Count', 'Name of Slow Learners'])
    
    // Add data rows
    let serialNumber = 1
    
    peerTutorsWithStudents.forEach(({ peerTutor, students }) => {
      if (students.length === 0) {
        // If no students assigned, still show the peer tutor
        data.push([
          serialNumber,
          peerTutor.name,
          `${peerTutor.year}/${peerTutor.section}`,
          0,
          'No students assigned'
        ])
        serialNumber++
      } else {
        // Show peer tutor as parent row
        data.push([
          serialNumber,
          peerTutor.name,
          `${peerTutor.year}/${peerTutor.section}`,
          students.length,
          students[0].name // First student in the same row
        ])
        
        // Add remaining students as child rows
        for (let i = 1; i < students.length; i++) {
          data.push([
            '', // Empty serial number for child rows
            '', // Empty tutor name for child rows
            '', // Empty year/section for child rows
            '', // Empty count for child rows
            students[i].name // Student name
          ])
        }
        
        serialNumber++
      }
    })
    
    return data
  }

  const applyWorksheetFormatting = (ws: XLSX.WorkSheet, totalRows: number) => {
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // S NO
      { wch: 25 }, // Name of the tutor
      { wch: 12 }, // Year/Sec
      { wch: 8 },  // Count
      { wch: 30 }  // Name of Slow Learners
    ]
    
    // Merge cells for header
    const merges = [
      // College name (row 1, columns A-E)
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      // Department (row 2, columns A-E)
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      // Document title (row 3, columns A-E)
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
      // Academic year (row 4, columns A-E)
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } }
    ]
    
    ws['!merges'] = merges
    
    // Apply styling to header rows (rows 1-4)
    for (let row = 0; row < 4; row++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 })
      if (!ws[cellRef]) ws[cellRef] = { v: '' }
      ws[cellRef].s = {
        font: { bold: true, size: 12 },
        alignment: { horizontal: 'center', vertical: 'center' }
      }
    }
    
    // Apply styling to table headers (row 9)
    for (let col = 0; col < 5; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 8, c: col })
      if (!ws[cellRef]) ws[cellRef] = { v: '' }
      ws[cellRef].s = {
        font: { bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: 'F0F0F0' } }
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Export Peer Tutor Mapping</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                College Name
              </label>
              <input
                type="text"
                value={header.collegeName}
                onChange={(e) => setHeader(prev => ({ ...prev, collegeName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Department
              </label>
              <input
                type="text"
                value={header.department}
                onChange={(e) => setHeader(prev => ({ ...prev, department: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Document Title
              </label>
              <input
                type="text"
                value={header.documentTitle}
                onChange={(e) => setHeader(prev => ({ ...prev, documentTitle: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={header.academicYear}
                  onChange={(e) => setHeader(prev => ({ ...prev, academicYear: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Semester
                </label>
                <input
                  type="text"
                  value={header.semester}
                  onChange={(e) => setHeader(prev => ({ ...prev, semester: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year
                </label>
                <input
                  type="text"
                  value={header.year}
                  onChange={(e) => setHeader(prev => ({ ...prev, year: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="text"
                  value={header.date}
                  onChange={(e) => setHeader(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isExporting ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Exporting...
                </div>
              ) : (
                'Export to Excel'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
