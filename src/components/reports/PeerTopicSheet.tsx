import React from 'react'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExportButton from '@/components/ui/ExportButton'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

export interface SheetHeaderInfo {
  collegeName?: string
  dept?: string
  academicYear?: string
  semesterType?: string
  tutorName?: string
  tutorYear?: string
  tutorSection?: string
}

interface PeerTopicSheetProps {
  peertutorId: string
  headerInfo?: SheetHeaderInfo
}

export default function PeerTopicSheet({ peertutorId, headerInfo }: PeerTopicSheetProps) {
  const { data: topicData, isLoading } = useCachedData({
    queryKey: ['peer-topic-sheet', peertutorId],
    queryFn: async () => {
      return await ReportService.getTopicSheetData(peertutorId)
    },
    enabled: !!peertutorId
  })

  // Format date helper
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const d = new Date(dateString)
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`
  }

  // Format time helper (24h -> 12h AM/PM)
  const formatTime = (timeStr: string): string => {
    if (!timeStr) return ''
    if (timeStr.includes(' - ')) {
      const [start, end] = timeStr.split(' - ')
      return `${formatTime(start)} - ${formatTime(end)}`
    }
    if (!timeStr.match(/^\d{1,2}:\d{2}$/) && !timeStr.match(/^\d{1,2}:\d{2}:\d{2}$/)) {
      return timeStr
    }
    try {
      const [hours, minutes] = timeStr.split(':')
      const h = parseInt(hours, 10)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      return `${h12}:${minutes} ${ampm}`
    } catch {
      return timeStr
    }
  }

  // Build subtitle lines for the sheet header
  const buildHeaderLines = () => {
    const lines: string[] = []
    if (headerInfo?.collegeName) lines.push(headerInfo.collegeName)
    if (headerInfo?.dept) lines.push(`DEPT OF ${headerInfo.dept}`)
    lines.push('PEER TUTORING TOPIC SHEET')
    if (headerInfo?.academicYear || headerInfo?.semesterType) {
      const semLabel = headerInfo.semesterType
        ? `${headerInfo.semesterType.charAt(0).toUpperCase() + headerInfo.semesterType.toUpperCase().slice(1)} SEMESTER`
        : ''
      lines.push([headerInfo.academicYear, semLabel].filter(Boolean).join(' - '))
    }
    return lines
  }

  const handleExport = () => {
    if (!topicData || topicData.length === 0) {
      toast.error('No data available to export')
      return
    }

    try {
      const doc = new jsPDF()
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

      topicData.forEach((subject, index) => {
        if (finalY + 35 > pageHeight) {
          doc.addPage()
          finalY = 20
        } else if (index > 0) {
          finalY += 5
        }

        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text(`SUBJECT NAME ${index + 1}: ${subject.subject_name}`, 14, finalY)

        const tableBody = subject.classes.map((cls, idx) => [
          idx + 1,
          `${formatDate(cls.date)}${cls.is_additional ? ' (A)' : ''}`,
          formatTime(cls.hour),
          cls.topic
        ])

        autoTable(doc, {
          startY: finalY + 5,
          head: [['S.NO', 'DATE', 'HOUR', 'TOPIC DETAILS']],
          body: tableBody,
          theme: 'grid',
          headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
            fontStyle: 'bold',
            halign: 'center'
          },
          bodyStyles: {
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 15 },
            1: { halign: 'center', cellWidth: 30 },
            2: { halign: 'center', cellWidth: 35 },
            3: { halign: 'left' }
          },
          styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 3
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

      // Add Borders to all pages
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setDrawColor(0)
        doc.setLineWidth(0.5)
        doc.rect(5, 5, pageWidth - 10, pageHeight - 10)
      }

      const fileName = `Topic_Sheet_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      toast.success('Topic Sheet exported successfully!')
    } catch (error) {
      logger.error('Error exporting topic sheet:', error)
      toast.error('Failed to export topic sheet')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!topicData || topicData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200 shadow-sm">
        <p>No class data available for topic sheet.</p>
      </div>
    )
  }

  // Build header lines for UI
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

      {topicData.map((subject, index) => (
        <div key={index} className={index > 0 ? "mt-12" : "mt-8"}>
          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-900 border-b-2 border-gray-800 pb-2 uppercase">
              SUBJECT NAME {index + 1}: <span className="text-gray-700 ml-2 font-normal">{subject.subject_name}</span>
            </h3>
          </div>

          <div className="overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse border border-gray-800 min-w-full">
                <thead>
                  <tr>
                    <th className="border border-gray-800 px-4 py-3 w-16 text-center text-sm font-bold text-gray-900 bg-transparent">S.NO</th>
                    <th className="border border-gray-800 px-4 py-3 w-32 text-center text-sm font-bold text-gray-900 bg-transparent">DATE</th>
                    <th className="border border-gray-800 px-4 py-3 w-40 text-center text-sm font-bold text-gray-900 bg-transparent">HOUR</th>
                    <th className="border border-gray-800 px-4 py-3 text-left text-sm font-bold text-gray-900 bg-transparent">TOPIC DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {subject.classes.map((cls, idx) => (
                    <tr key={cls.id}>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12">{idx + 1}</td>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12">
                        {formatDate(cls.date)}
                        {cls.is_additional && <span className="text-gray-500 ml-1 font-normal">(A)</span>}
                      </td>
                      <td className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-900 h-12 font-medium whitespace-nowrap">
                        {formatTime(cls.hour)}
                      </td>
                      <td className="border border-gray-800 px-4 py-3 text-left text-sm text-gray-900 h-12">{cls.topic}</td>
                    </tr>
                  ))}
                  {subject.classes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="border border-gray-800 px-4 py-3 text-center text-sm text-gray-500 h-12 italic">
                        No classes recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {subject.classes.map((cls, idx) => (
                <div key={cls.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-sm font-bold text-gray-700">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-bold text-gray-900">
                        {formatDate(cls.date)}
                      </span>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-bold ${
                      cls.is_additional ? 'bg-purple-700 text-white' : 'bg-blue-700 text-white'
                    }`}>
                      {cls.is_additional ? 'A' : 'R'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-gray-500 font-medium uppercase text-xs tracking-wider">Topic Covered</p>
                    <p className="text-sm text-gray-900 leading-relaxed font-medium">
                      {cls.topic}
                    </p>
                  </div>
                </div>
              ))}
              {subject.classes.length === 0 && (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
                  <p className="text-sm text-gray-500 italic">No classes recorded yet</p>
                </div>
              )}
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
