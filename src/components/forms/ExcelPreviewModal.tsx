'use client'


interface ExcelPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  numHeaders: number
  extraHeaders: string[]
}

export default function ExcelPreviewModal({ isOpen, onClose, numHeaders, extraHeaders }: ExcelPreviewModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Excel Export Preview</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-auto max-h-[60vh]">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Sample Excel Structure Preview:</h4>
            
            {/* Excel-like table preview */}
            <div className="bg-white border border-gray-300 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Subject</th>
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Topic</th>
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Date</th>
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Present Students</th>
                    <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Header rows */}
                  {Array.from({ length: Math.min(5, numHeaders) }, (_, i) => (
                    <tr key={`header-${i}`} className="bg-blue-50">
                      <td className="border border-gray-300 px-3 py-2 text-center font-semibold" colSpan={5}>
                        {i === 0 ? 'SONA COLLEGE OF TECHNOLOGY (AUTONOMOUS), SALEM -5' :
                         i === 1 ? 'DEPARTMENT OF INFORMATION TECHNOLOGY' :
                         i === 2 ? 'B.Tech - AI&DS' :
                         i === 3 ? 'PEER TEACHING ATTENDANCE SHEET' :
                         i === 4 ? '2025-2026 (ODD Semester)' : ''}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Extra headers */}
                  {extraHeaders.filter(h => h.trim()).map((header, i) => (
                    <tr key={`extra-${i}`} className="bg-blue-50">
                      <td className="border border-gray-300 px-3 py-2 text-center font-semibold" colSpan={5}>
                        {header}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Empty row */}
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  {/* Peer Tutor Info Row */}
                  <tr className="bg-gray-50">
                    <td className="border border-gray-300 px-3 py-2 font-semibold text-left">
                      Peer Tutor Name: John Doe
                    </td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold text-right">
                      Dept/Year: IT/2024
                    </td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  {/* Another empty row */}
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  {/* Subject 1 */}
                  <tr className="bg-green-50">
                    <td className="border border-gray-300 px-3 py-2 font-semibold">SUBJECT: AIDS</td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2">1. Introduction to AIDS</td>
                    <td className="border border-gray-300 px-3 py-2">15/01/2024</td>
                    <td className="border border-gray-300 px-3 py-2">John Doe, Jane Smith, Mike Johnson</td>
                    <td className="border border-gray-300 px-3 py-2">Present: 3</td>
                  </tr>
                  
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2">2. AIDS Prevention</td>
                    <td className="border border-gray-300 px-3 py-2">20/01/2024</td>
                    <td className="border border-gray-300 px-3 py-2">John Doe, Jane Smith</td>
                    <td className="border border-gray-300 px-3 py-2">Present: 2</td>
                  </tr>
                  
                  <tr className="bg-yellow-50">
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold">TOTAL FOR AIDS</td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold">Total Present: 5 | Percentage: 83%</td>
                  </tr>
                  
                  {/* Empty row between subjects */}
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  {/* Subject 2 */}
                  <tr className="bg-green-50">
                    <td className="border border-gray-300 px-3 py-2 font-semibold">SUBJECT: DWDM</td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                  </tr>
                  
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2">1. Data Warehousing Basics</td>
                    <td className="border border-gray-300 px-3 py-2">18/01/2024</td>
                    <td className="border border-gray-300 px-3 py-2">Alice Brown, Bob Wilson</td>
                    <td className="border border-gray-300 px-3 py-2">Present: 2</td>
                  </tr>
                  
                  <tr>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2">2. Data Mining Concepts</td>
                    <td className="border border-gray-300 px-3 py-2">25/01/2024</td>
                    <td className="border border-gray-300 px-3 py-2">Alice Brown, Bob Wilson, Carol Davis</td>
                    <td className="border border-gray-300 px-3 py-2">Present: 3</td>
                  </tr>
                  
                  <tr className="bg-yellow-50">
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold">TOTAL FOR DWDM</td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2"></td>
                    <td className="border border-gray-300 px-3 py-2 font-semibold">Total Present: 5 | Percentage: 100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              <p><strong>Features:</strong></p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li>Times New Roman font throughout the document</li>
                <li>Centered headers with bold formatting</li>
                <li>Each subject appears as a main header</li>
                <li>Topics, dates, and present students listed under each subject</li>
                <li>Single Excel file with all data organized by subject</li>
                <li>Automatic sorting by date within each subject</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  )
}
