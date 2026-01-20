'use client'



interface RenumerationFieldType {
  id: string
  field_name: string
  field_type: string
  is_mandatory: boolean
  options?: string[]
}

interface RenumerationDetailsModalProps {
  submission: {
    id: string
    template_id: string
    peer_tutor?: {
      name: string
      email: string
    }
    created_at: string
    submitted_at?: string
    status: string
    template?: {
      name: string
      fields: RenumerationFieldType[]
    }
    field_responses: Record<string, string | number | boolean | null>
  } | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (renumerationId: string, status: 'approved' | 'rejected') => void
}

export default function RenumerationDetailsModal({ 
  submission, 
  isOpen, 
  onClose
}: RenumerationDetailsModalProps) {


  if (!isOpen || !submission) return null



  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6 animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                Submission Details
              </h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">
                {submission.template?.name || 'Renumeration Form'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Peer Tutor Information */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Peer Tutor Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100 overflow-hidden">
                  <span className="text-blue-600 font-black text-sm uppercase">
                    {submission.peer_tutor?.name?.split(' ').map(n => n[0]).join('') || 'PT'}
                  </span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Full Name</label>
                  <p className="text-sm font-bold text-gray-900">{submission.peer_tutor?.name || 'Unknown'}</p>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Email Address</label>
                <p className="text-sm font-medium text-gray-600">{submission.peer_tutor?.email || 'No email'}</p>
              </div>
            </div>
          </div>

          {/* Submission Status */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Submission Status</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Created Date</label>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(submission.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Submitted Date</label>
                <p className="text-sm font-medium text-gray-900">
                  {submission.submitted_at 
                    ? new Date(submission.submitted_at).toLocaleDateString()
                    : <span className="text-orange-500 font-bold">NOT SUBMITTED</span>
                  }
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Current Status</label>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                  submission.submitted_at ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {submission.submitted_at ? 'Completed' : 'Pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Form Responses */}
          <div className="bg-white border border-gray-100 rounded-xl p-6 mb-8 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Form Responses</h3>
            </div>
            
            {submission.template?.fields && submission.template.fields.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {submission.template.fields.map((field) => (
                  <div key={field.id} className="relative pl-6 border-l-2 border-gray-50 group hover:border-blue-500 transition-all">
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center group-hover:border-blue-500 transition-all">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-200 group-hover:bg-blue-500 transition-all"></div>
                    </div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      {field.field_name}
                      {field.is_mandatory && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <div className="text-sm font-bold text-gray-900 min-h-[1.25rem]">
                      {submission.field_responses[field.field_name] !== undefined ? (
                        String(submission.field_responses[field.field_name])
                      ) : (
                        <span className="text-gray-300 italic font-medium">No response provided</span>
                      )}
                    </div>
                    <div className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mt-2 flex items-center gap-2">
                      <span className="bg-gray-50 px-1.5 py-0.5 rounded">TYPE: {field.field_type}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">No form fields defined for this template.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-8 border-t border-gray-100">
            <div className="flex items-center gap-3">
              {submission.submitted_at ? (
                <div className="flex items-center gap-2 bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">
                    Submission Received
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-orange-50 px-4 py-2 rounded-lg border border-orange-100">
                  <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                    Awaiting Completion
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-8 py-2.5 bg-gray-800 text-white rounded-lg text-sm font-bold uppercase tracking-widest hover:bg-gray-900 transition-all shadow-sm active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
