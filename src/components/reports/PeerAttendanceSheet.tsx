import React from 'react'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExportButton from '@/components/ui/ExportButton'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { SheetHeaderInfo } from './PeerTopicSheet'

interface PeerAttendanceSheetProps {
  peertutorId: string
  headerInfo?: SheetHeaderInfo
}

export default function PeerAttendanceSheet({ peertutorId, headerInfo }: PeerAttendanceSheetProps) {
  const { data: attendanceData, isLoading } = useCachedData({
    queryKey: ['peer-attendance-sheet', peertutorId],
    queryFn: async () => {
      return await ReportService.getAttendanceSheetData(peertutorId)
    },
    enabled: !!peertutorId
  })

  // Build subtitle lines for the sheet header
  const buildHeaderLines = () => {
    const lines: string[] = []
    if (headerInfo?.collegeName) lines.push(headerInfo.collegeName)
    if (headerInfo?.dept) lines.push(`DEPT OF ${headerInfo.dept}`)
    lines.push('PEER TUTORING ATTENDANCE SHEET')
    if (headerInfo?.academicYear || headerInfo?.semesterType) {
      const semLabel = headerInfo.semesterType
        ? `${headerInfo.semesterType.charAt(0).toUpperCase() + headerInfo.semesterType.toUpperCase().slice(1)} SEMESTER`
        : ''
      lines.push([headerInfo.academicYear, semLabel].filter(Boolean).join(' - '))
    }
    return lines
  }

  const handleExport = () => {
    if (!attendanceData || attendanceData.length === 0) {
      toast.error('No data available to export')
      return
    }

    try {
      const doc = new jsPDF('l', 'mm', 'a4') // Landscape mode for wider tables
      const pageHeight = doc.internal.pageSize.height
      const pageWidth = doc.internal.pageSize.width
      let finalY = 10

      // ── HEADER ──────────────────────────────────────────────────
      const headerLines = buildHeaderLines()
      // College name (largest)
      if (headerLines[0]) {
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(headerLines[0], pageWidth / 2, finalY + 10, { align: 'center' })
        finalY += 10
      }
      // Dept
      if (headerLines[1]) {
        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        doc.text(headerLines[1], pageWidth / 2, finalY + 7, { align: 'center' })
        finalY += 7
      }
      // Sheet name
      if (headerLines[2]) {
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(headerLines[2], pageWidth / 2, finalY + 7, { align: 'center' })
        finalY += 7
      }
      // Academic year
      if (headerLines[3]) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        doc.text(headerLines[3], pageWidth / 2, finalY + 6, { align: 'center' })
        finalY += 6
      }

      // Peer tutor info (left side)
      const tutorLines: string[] = []
      if (headerInfo?.tutorName) tutorLines.push(`PEER TUTOR: ${headerInfo.tutorName}`)
      if (headerInfo?.tutorYear) tutorLines.push(`YEAR: ${headerInfo.tutorYear}`)
      if (headerInfo?.tutorSection) tutorLines.push(`SECTION: ${headerInfo.tutorSection}`)

      if (tutorLines.length > 0) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        let tutY = 12
        tutorLines.forEach(line => {
          doc.text(line, 14, tutY)
          tutY += 5
        })
      }

      // Divider line
      finalY += 4
      doc.setDrawColor(0)
      doc.setLineWidth(0.3)
      doc.line(14, finalY, pageWidth - 14, finalY)
      finalY += 5
      // ────────────────────────────────────────────────────────────

      attendanceData.forEach((subject, index) => {
        // Check space
        if (finalY + 30 > pageHeight) {
          doc.addPage()
          finalY = 20
        } else if (index > 0) {
          finalY += 5
        }

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(`SUBJECT NAME ${index + 1}: ${subject.subject_name}`, 14, finalY)

        // Prepare headers
        const headers = ['S.No', 'Name']
        subject.columns.forEach(col => {
          const date = new Date(col.date)
          const formattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`
          headers.push(`${formattedDate}${col.is_additional ? ' (A)' : ''}`)
        })
        headers.push('No of Hours Present', '%')

        // Prepare rows
        const tableBody = subject.rows.map((student, idx) => {
          const row: (string | number)[] = [
            idx + 1,
            student.student_name
          ]

          subject.columns.forEach(col => {
            const status = student.attendance[col.id];
            row.push(status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'on_duty' ? 'OD' : status === 'upcoming' ? 'U' : '-')
          })

          row.push(student.stats.present, `${student.stats.percentage}%`)
          return row
        })

        // Generate table
        autoTable(doc, {
          startY: finalY + 5,
          head: [headers],
          body: tableBody,
          theme: 'grid',
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 8
          },
          bodyStyles: {
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontSize: 8,
            halign: 'center'
          },
          columnStyles: {
            1: { halign: 'left' }
          },
          styles: {
            font: 'helvetica',
            cellPadding: 2
          },
          margin: { top: 20, bottom: 20, left: 14, right: 14 }
        })

        finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2

        if (finalY + 15 > pageHeight) {
          doc.addPage()
          finalY = 20
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('SIGNATURE OF FACULTY:', 14, finalY + 6)

        finalY += 10
      })

      // Add Borders
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setDrawColor(0)
        doc.setLineWidth(0.5)
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10)
      }

      const fileName = `Attendance_Sheet_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      toast.success('Attendance Sheet exported successfully!')
    } catch (error) {
      logger.error('Error exporting attendance sheet:', error)
      toast.error('Failed to export attendance sheet')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!attendanceData || attendanceData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
        <p>No class data available for attendance sheet.</p>
      </div>
    )
  }

  const headerLines = buildHeaderLines()

  return (
    <div className="bg-white p-8 shadow-sm border border-gray-200 rounded-none print:shadow-none print:border-none relative">
      <div className="absolute top-6 right-6 print:hidden">
        <ExportButton onClick={handleExport} />
      </div>

      {/* Sheet Header */}
      <div className="mb-8 border-b-2 border-gray-800 pb-4">
        {/* Top row: tutor info (left) + sheet title (center) */}
        <div className="flex items-start justify-between">
          {/* Left: Peer Tutor Info */}
          <div className="text-left space-y-0.5">
            {headerInfo?.tutorName && (
              <p className="text-sm font-bold text-gray-900 uppercase">
                Peer Tutor: <span className="font-normal">{headerInfo.tutorName}</span>
              </p>
            )}
            {headerInfo?.tutorYear && (
              <p className="text-sm font-bold text-gray-900 uppercase">
                Year: <span className="font-normal">{headerInfo.tutorYear}</span>
              </p>
            )}
            {headerInfo?.tutorSection && (
              <p className="text-sm font-bold text-gray-900 uppercase">
                Section: <span className="font-normal">{headerInfo.tutorSection}</span>
              </p>
            )}
          </div>

          {/* Center: Sheet Header */}
          <div className="flex-1 text-center px-4">
            {headerLines[0] && (
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-wide leading-tight">
                {headerLines[0]}
              </h2>
            )}
            {headerLines[1] && (
              <p className="text-sm font-semibold text-gray-700 mt-0.5">{headerLines[1]}</p>
            )}
            {headerLines[2] && (
              <p className="text-base font-bold text-gray-900 mt-1 uppercase">{headerLines[2]}</p>
            )}
            {headerLines[3] && (
              <p className="text-xs text-gray-600 mt-0.5">{headerLines[3]}</p>
            )}
          </div>

          {/* Right: empty spacer to balance layout */}
          <div className="w-32" />
        </div>
      </div>

      {attendanceData.map((subject, index) => (
        <div key={index} className={index > 0 ? "mt-16" : "mt-8"}>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-2 uppercase">
              SUBJECT NAME {index + 1}: <span className="text-gray-700 ml-2 font-normal">{subject.subject_name}</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="border-collapse border border-gray-800 text-sm min-w-full">
                <thead>
                  {/* Header Row with Date displayed horizontally */}
                  <tr>
                    <th className="border border-gray-800 p-2 text-center font-bold text-xs">S.No</th>
                    <th className="border border-gray-800 p-2 text-center font-bold text-xs w-[1%] whitespace-nowrap">Name</th>
                    {subject.columns.map(col => {
                      const date = new Date(col.date)
                      const formattedDate = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`
                      return (
                        <th key={col.id} className="border border-gray-800 p-2 text-center font-bold text-[10px] whitespace-nowrap">
                          {formattedDate}
                          {col.is_additional && <span className="text-gray-500 ml-1 font-normal">(A)</span>}
                        </th>
                      )
                    })}
                    <th className="border border-gray-800 p-2 text-center font-bold text-[10px] leading-3 align-middle whitespace-nowrap">No of Hours Present</th>
                    <th className="border border-gray-800 p-2 text-center font-bold text-[10px] align-middle">%</th>
                  </tr>
                </thead>
                <tbody>
                  {subject.rows.map((student, idx) => (
                    <tr key={student.student_id}>
                      <td className="border border-gray-800 p-2 text-center text-xs">{idx + 1}</td>
                      <td className="border border-gray-800 p-2 text-left text-xs font-medium whitespace-nowrap w-[1%]">{student.student_name}</td>

                      {subject.columns.map(col => {
                        const status = student.attendance[col.id];
                        return (
                          <td key={`${student.student_id}-${col.id}`} className="border border-gray-800 p-2 text-center text-xs">
                            {status === 'present' ? 'P' : status === 'absent' ? 'A' : status === 'on_duty' ? 'OD' : status === 'upcoming' ? 'U' : ''}
                          </td>
                        )
                      })}

                      <td className="border border-gray-800 p-2 text-center text-xs font-bold">{student.stats.present}</td>
                      <td className="border border-gray-800 p-2 text-center text-xs font-bold">{student.stats.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {subject.rows.map((student, idx) => (
                <div key={student.student_id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {idx + 1}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900">{student.student_name}</h4>
                        <p className="text-xs text-gray-500">Student</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-900`}>
                      {student.stats.percentage}%
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4 text-xs">
                    <div className="bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg flex-1 text-center">
                      <span className="block text-gray-400 font-bold uppercase text-[10px] mb-0.5">Present</span>
                      <span className="text-lg font-black text-gray-900">{student.stats.present}</span>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg flex-1 text-center">
                      <span className="block text-gray-400 font-bold uppercase text-[10px] mb-0.5">Total</span>
                      <span className="text-lg font-black text-gray-900">{subject.columns.length}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Attendance Log</p>
                    <div className="grid grid-cols-4 gap-2">
                      {subject.columns.map(col => {
                        const date = new Date(col.date)
                        const formattedDate = `${date.getDate()}/${date.getMonth() + 1}`
                        const status = student.attendance[col.id]

                        return (
                          <div key={col.id} className="flex flex-col items-center p-2 rounded-lg border bg-gray-50 border-gray-200">
                            <span className="text-[10px] text-gray-500 font-bold mb-1">
                              {formattedDate} <span className="text-gray-400 font-medium">({col.is_additional ? 'A' : 'R'})</span>
                            </span>
                            <span className="text-xs font-black text-gray-900">
                              {status === 'present' ? 'P' : status === 'absent' ? 'Ab' : status === 'on_duty' ? 'OD' : status === 'upcoming' ? 'U' : '-'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 pt-4">
              <p className="text-sm font-bold uppercase text-gray-900">Signature of Faculty:</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
