'use client'

import { useState, useEffect, useCallback } from 'react'
import { Class } from '@/lib/services/classService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { PeerTutorAuthService } from '@/lib/auth/peerTutorAuthService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, 
  Check, 
  ArrowRight, 
  Link as LinkIcon, 
  Camera, 
  Users, 
  Trophy 
} from 'lucide-react'

interface ClassDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  classItem: Class | null
  userEmail: string
}

const getInitials = (name: string): string => name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2)

const getAvatarColor = (name: string): string => {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-yellow-500', 'bg-red-500', 'bg-teal-500']
  return colors[name.length % colors.length]
}

export default function ClassDetailsModal({ isOpen, onClose, classItem, userEmail }: ClassDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [topics, setTopics] = useState<string>('')
  const [imageLink, setImageLink] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState<'topics' | 'proof' | 'attendance' | 'completed'>('topics')
  const [peerTutorId, setPeerTutorId] = useState<string>('')
  const [scheduledClassId, setScheduledClassId] = useState<string>('')

  const loadClassDetails = useCallback(async () => {
    if (!classItem) return
    setLoading(true)

    try {
      const tutorInfo = await PeerTutorAuthService.getPeerTutorByEmail(userEmail)
      if (!tutorInfo) return
      setPeerTutorId(tutorInfo.id)

      // Fetch Students & Attendance
      const students = await AttendanceService.getStudentsForAttendance(tutorInfo.id)
      const existingAttendance = classItem.scheduled_class_id
        ? await AttendanceService.getAttendanceByScheduledClass(classItem.scheduled_class_id)
        : await AttendanceService.getAttendanceByClass(classItem.id)

      // Fetch Scheduled Class Details
      const scheduledClass = classItem.scheduled_class_id 
        ? await ScheduledClassService.getScheduledClassById(classItem.scheduled_class_id)
        : await ScheduledClassService.getScheduledClassByClassId(classItem.id)

      if (scheduledClass) {
        setScheduledClassId(scheduledClass.id)
        setTopics(scheduledClass.topics || '')
        setImageLink(scheduledClass.image_link || '')
      }

      // Merge Attendance
      setAttendanceRecords(students.map(student => ({
        student_id: student.id,
        student_name: student.name,
        student_email: student.email,
        status: existingAttendance.find(att => att.student_id === student.id)?.status || 'present'
      })))

    } catch (error) {
      console.error('Error loading class details:', error)
    } finally {
      setLoading(false)
    }
  }, [classItem, userEmail])

  // Load Initial Data
  useEffect(() => {
    if (isOpen && classItem && userEmail) {
      loadClassDetails()
      setCurrentStep('topics')
    }
  }, [isOpen, classItem, userEmail, loadClassDetails])

  // Steps Logic
  const handleNextStep = async () => {
    if (currentStep === 'topics') {
      if (!topics.trim()) return alert('Please add topics first.')
       // Save Topics immediately for safety
       if (scheduledClassId) {
           await ScheduledClassService.updateScheduledClassTopics(scheduledClassId, topics)
       }
      setCurrentStep('proof')
    } else if (currentStep === 'proof') {
      // Image link is optional now
      // Save Link if provided
      if (scheduledClassId && imageLink.trim()) {
          await ScheduledClassService.updateScheduledClassImageLink(scheduledClassId, imageLink)
      }
      setCurrentStep('attendance')
    }
  }

  const handleCompleteClass = async () => {


    if (!scheduledClassId || !peerTutorId) {
        console.error('Missing IDs:', { scheduledClassId, peerTutorId })
        alert('Error: Missing class or tutor information. Cannot complete class. Please verify your data.')
        return
    }

    setSaving(true)
    try {
        console.log('Completing class...', { scheduledClassId, peerTutorId })
        
        // 1. Save Attendance
        const attendanceSuccess = await AttendanceService.markAttendanceForScheduledClass(scheduledClassId, peerTutorId, attendanceRecords)
        if (!attendanceSuccess) throw new Error('Failed to save attendance records')
        
        // 2. Mark Complete
        const completionSuccess = await ScheduledClassService.updateScheduledClassCompletion(scheduledClassId, true, true)
        if (!completionSuccess) throw new Error('Failed to update class completion status')
        
        setCurrentStep('completed')
    } catch (error) {
        console.error('Complete class error:', error)
        alert('Failed to complete class. Check console for details.')
    } finally {
        setSaving(false)
    }
  }

  if (!isOpen || !classItem) return null

  // Animation Variants
  const variants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                    <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <div className="relative z-10">
                    <h2 className="text-2xl font-bold mb-1">{classItem.subject_name}</h2>
                    <p className="text-gray-400 text-sm flex items-center gap-2">
                        <span>{new Date(classItem.class_date || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                        <span className="w-1 h-1 bg-gray-500 rounded-full"/>
                        <span className="uppercase tracking-wider text-xs font-bold bg-white/10 px-2 py-0.5 rounded">
                            {currentStep === 'completed' ? 'Completed' : `Step ${currentStep === 'topics' ? '1' : currentStep === 'proof' ? '2' : '3'} of 3`}
                        </span>
                    </p>
                </div>
                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 h-1 bg-white/10 w-full">
                    <motion.div 
                        className="h-full bg-blue-500"
                        initial={{ width: 0 }}
                        animate={{ width: currentStep === 'topics' ? '33%' : currentStep === 'proof' ? '66%' : '100%' }}
                        transition={{ duration: 0.5 }}
                    />
                </div>
            </div>

            {/* Content Area */}
            <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50">
             {loading ? (
                 <div className="flex justify-center items-center h-48">
                     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"/>
                 </div>
             ) : (
                <AnimatePresence mode="wait">
                    
                    {/* Step 1: Topics */}
                    {currentStep === 'topics' && (
                        <motion.div key="topics" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <div className="flex items-center gap-3 mb-4 text-blue-600">
                                    <h3 className="text-lg font-bold text-gray-900">What did you teach?</h3>
                                </div>
                                <textarea
                                    value={topics}
                                    onChange={(e) => setTopics(e.target.value)}
                                    placeholder="e.g. Introduction to React components, props vs state, hooks..."
                                    className="w-full h-40 p-4 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white focus:outline-none transition-all resize-none text-gray-700 placeholder-gray-400"
                                    autoFocus
                                />
                                <div className="mt-4 flex justify-end">
                                    <button 
                                        onClick={handleNextStep}
                                        disabled={!topics.trim()}
                                        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                    >
                                        Next Step <ArrowRight size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Proof (Link) */}
                    {currentStep === 'proof' && (
                        <motion.div key="proof" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                             <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                                    <Camera size={32} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Class Evidence (Optional)</h3>
                                <p className="text-gray-500 mb-8 max-w-sm mx-auto text-sm">You can provide a link to the class screenshot or photo as proof of conduction.</p>
                                
                                <div className="relative max-w-md mx-auto mb-8">
                                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input 
                                        type="url"
                                        value={imageLink}
                                        onChange={(e) => setImageLink(e.target.value)}
                                        placeholder="https://imgur.com/..."
                                        className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white focus:outline-none transition-all"
                                        autoFocus
                                    />
                                </div>

                                <button 
                                    onClick={handleNextStep}
                                    className="w-full max-w-md mx-auto flex items-center justify-center gap-2 bg-black text-white px-6 py-4 rounded-xl font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                >
                                    Proceed to Attendance <ArrowRight size={18} />
                                </button>
                             </div>
                        </motion.div>
                    )}

                    {/* Step 3: Attendance */}
                    {currentStep === 'attendance' && (
                        <motion.div key="attendance" variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Users className="text-blue-500"/> Mark Attendance
                                </h3>
                                <span className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">{attendanceRecords.length} Students</span>
                             </div>

                             <div className="space-y-3 mb-8">
                                {attendanceRecords.map((record) => (
                                    <div key={record.student_id} className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-blue-100 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 ${getAvatarColor(record.student_name)} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md`}>
                                                {getInitials(record.student_name)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{record.student_name}</p>
                                                <p className="text-xs text-gray-400">{record.student_id}</p>
                                            </div>
                                        </div>
                                        <div className="flex bg-gray-100 p-1 rounded-lg">
                                            <button 
                                                onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'present'} : p))}
                                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${record.status === 'present' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                Present
                                            </button>
                                            <button 
                                                 onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'absent'} : p))}
                                                 className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${record.status === 'absent' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                Absent
                                            </button>
                                        </div>
                                    </div>
                                ))}
                             </div>

                             <div className="flex justify-end pt-4 border-t border-gray-100">
                                <button 
                                    onClick={handleCompleteClass}
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {saving ? 'Completing...' : 'Finish Class'} <Check size={18} />
                                </button>
                             </div>
                        </motion.div>
                    )}

                    {/* Step 4: Completed */}
                    {currentStep === 'completed' && (
                        <motion.div key="completed" variants={variants} initial="enter" animate="center" exit="exit" className="text-center py-10">
                            <motion.div 
                                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
                                className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600"
                            >
                                <Trophy size={48} />
                            </motion.div>
                            <h2 className="text-3xl font-black text-gray-900 mb-2">Class Completed!</h2>
                            <p className="text-gray-500 mb-8">Great job! Your teaching records have been updated successfully.</p>
                            <button onClick={onClose} className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors">
                                Close Window
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
             )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
