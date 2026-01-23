import React from 'react'
import { ReportService } from '@/lib/services/reportService'
import { useCachedData } from '@/lib/hooks/useCachedData'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExportButton from '@/components/ui/ExportButton'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'

interface PeerTopicSheetProps {
  peertutorId: string
}

export default function PeerTopicSheet({ peertutorId }: PeerTopicSheetProps) {
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
    // Handle ranges like "09:30 - 10:30"
    if (timeStr.includes(' - ')) {
      const [start, end] = timeStr.split(' - ')
      return `${formatTime(start)} - ${formatTime(end)}`
    }

    // Check if valid time format HH:MM
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

  const handleExport = () => {
    if (!topicData || topicData.length === 0) {
      toast.error('No data available to export')
      return
    }

    try {
      const doc = new jsPDF()
      const pageHeight = doc.internal.pageSize.height
      const pageWidth = doc.internal.pageSize.width
      let finalY = 20

      topicData.forEach((subject, index) => {
        // Calculate estimated height needed for header and at least one row
        // Header (10) + Table Header (10) + Row (10) + Spacing (5) approx 35
        if (finalY + 35 > pageHeight) {
          doc.addPage()
          finalY = 20
        } else if (index > 0) {
          finalY += 5 // Reduced spacing between subjects (was 10)
        }

        // Title
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(`SUBJECT NAME ${index + 1}: ${subject.subject_name}`, 14, finalY)

        // Prepare table data
        const tableBody = subject.classes.map((cls, idx) => [
          idx + 1,
          `${formatDate(cls.date)}${cls.is_additional ? ' (A)' : ''}`,
          formatTime(cls.hour),
          cls.topic
        ])

        // Generate table
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

        // Update finalY to the end of the table
        // We need to cast doc to any to access lastAutoTable
        finalY = (doc as any).lastAutoTable.finalY + 2 // Minimized spacing (was 5)

        // Add Signature space
        // Check if there is space for signature (approx 15 units)
        if (finalY + 15 > pageHeight) {
          doc.addPage()
          finalY = 20
        }

        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        // Draw signature much closer to table
        doc.text('SIGNATURE OF FACULTY:', 14, finalY + 6)

        finalY += 10 // Reduced buffer after signature for next subject (was 15)
      })

      // Add Borders to all pages
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setDrawColor(0) // Black
        doc.setLineWidth(0.5)
        // Draw rect with 5mm margin
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

  return (
    <div className="bg-white p-8 shadow-sm border border-gray-200 rounded-none print:shadow-none print:border-none relative">
      <div className="absolute top-6 right-6 print:hidden">
        <ExportButton onClick={handleExport} />
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
                    <p className="text-sm text-gray-500 font-medium uppercase text-xs tracking-wider">Topic Covered</p>
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
