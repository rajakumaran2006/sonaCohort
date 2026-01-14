'use client'

import { useState, useEffect, useCallback } from 'react'
import { Class } from '@/lib/services/classService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { createClient } from '@/utils/supabase/client'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { 
  X, 
  Check, 
  ArrowRight, 
  Link as LinkIcon, 
  Camera, 
  Users, 
  Trophy,
  Loader2,
  Calendar
} from 'lucide-react'
import { toast } from 'sonner'

interface ClassDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  classItem: Class | null
  userEmail: string
}

const getInitials = (name: string): string => name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2)

const getAvatarColor = (name: string): string => {
  const colors = ['bg-blue-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-rose-500', 'bg-indigo-500', 'bg-amber-500', 'bg-emerald-500', 'bg-cyan-500']
  return colors[name.length % colors.length]
}

export default function ClassDetailsModal({ isOpen, onClose, classItem, userEmail }: ClassDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [topics, setTopics] = useState<string>('')
  const [imageLink, setImageLink] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState<'topics' | 'proof' | 'attendance' | 'completed'>('topics')
  const [peertutorsId, setpeertutorsId] = useState<string>('')
  const [scheduledClassId, setScheduledClassId] = useState<string>('')
  
  const supabase = createClient()

  const loadClassDetails = useCallback(async () => {
    if (!classItem) return
    setLoading(true)

    try {
      const tutorInfo = await peertutorsAuthService.getpeertutorsByEmail(userEmail)
      if (!tutorInfo) return
      setpeertutorsId(tutorInfo.id)

      // Fetch Students
      const students = await AttendanceService.getStudentsForAttendance(tutorInfo.id)
      
      let currentScheduledClassId = classItem.scheduled_class_id
      let existingAttendance: any[] = []

      // If we don't have a direct scheduled_class_id prop, try to find one for TODAY or specific date
      if (!currentScheduledClassId) {
         // Look for an existing scheduled class for this tutor, this class, and today's date (or Class Date if provided)
         const targetDate = classItem.class_date || new Date().toISOString().split('T')[0]
         
         const { data: foundScheduledClass } = await supabase
            .from('scheduled_classes')
            .select('id, topics, image_link, completion_status')
            .eq('class_id', classItem.id)
            .eq('peer_tutor_id', tutorInfo.id)
            .eq('scheduled_date', targetDate)
            .maybeSingle()

         if (foundScheduledClass) {
             currentScheduledClassId = foundScheduledClass.id
             setTopics(foundScheduledClass.topics || '')
             setImageLink(foundScheduledClass.image_link || '')
             if (foundScheduledClass.completion_status === 'completed') {
                 // Optionally setup completed state if needed, but for "Edit" we might want to let them change it
             }
         }
      } else {
           // We have an ID passed in (e.g. from a list where it was known)
           const scheduledClass = await ScheduledClassService.getScheduledClassById(currentScheduledClassId)
           if (scheduledClass) {
                setTopics(scheduledClass.topics || '')
                setImageLink(scheduledClass.image_link || '')
           }
      }
      
      if (currentScheduledClassId) {
          setScheduledClassId(currentScheduledClassId)
          existingAttendance = await AttendanceService.getAttendanceByScheduledClass(currentScheduledClassId)
      } else {
          setScheduledClassId('')
          // If no scheduled class yet, check if there was any legacy attendance by class ID (unlikely for new system but good fallback)
          existingAttendance = await AttendanceService.getAttendanceByClass(classItem.id)
      }

      // Merge Attendance
      setAttendanceRecords(students.map(student => {
        const record = existingAttendance.find(att => att.student_id === student.id)
        return {
            student_id: student.id,
            student_name: student.name,
            student_email: student.email,
            status: record?.status || 'present' // Default to present
        }
      }))

    } catch (error) {
      console.error('Error loading class details:', error)
      toast.error('Failed to load class details')
    } finally {
      setLoading(false)
    }
  }, [classItem, userEmail, supabase])

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
      if (!topics.trim()) {
        toast.warning('Please enter what you taught today.')
        return
      }
      
      setSaving(true)
      try {
          let targetId = scheduledClassId
          const targetDate = classItem?.class_date || new Date().toISOString().split('T')[0]

          // If no scheduled class exists yet, CREATE it now to save the topic
          if (!targetId && classItem && peertutorsId) {
              const success = await ScheduledClassService.createScheduledClass({
                  class_id: classItem.id,
                  scheduled_date: targetDate,
                  dept: classItem.dept,
                  year: classItem.year,
                  section: classItem.section,
                  faculty_id: classItem.faculty_id,
                  topics: topics
              })
              
              if (success) {
                  // Fetch the newly created ID for THIS peer tutor
                  const { data: newSc } = await supabase
                    .from('scheduled_classes')
                    .select('id')
                    .eq('class_id', classItem.id)
                    .eq('peer_tutor_id', peertutorsId)
                    .eq('scheduled_date', targetDate)
                    .maybeSingle()
                  
                  if (newSc) {
                      targetId = newSc.id
                      setScheduledClassId(newSc.id)
                  }
              }
          } else if (targetId) {
              // Just update
              await ScheduledClassService.updateScheduledClassTopics(targetId, topics)
          }

          if (targetId) {
             setCurrentStep('proof')
          } else {
              toast.error("Failed to initialize class session.")
          }
      } catch (err) {
          console.error("Error saving topics:", err)
      } finally {
          setSaving(false)
      }

    } else if (currentStep === 'proof') {
      setSaving(true)
      try {
        if (scheduledClassId && imageLink.trim()) {
            await ScheduledClassService.updateScheduledClassImageLink(scheduledClassId, imageLink)
        }
        setCurrentStep('attendance')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleCompleteClass = async () => {
    if (!scheduledClassId || !peertutorsId) {
        toast.error('Missing session information. Please try again.')
        return
    }

    setSaving(true)
    try {
        // 1. Save Attendance
        const attendanceSuccess = await AttendanceService.markAttendanceForScheduledClass(scheduledClassId, peertutorsId, attendanceRecords)
        if (!attendanceSuccess) throw new Error('Failed to save attendance records')
        
        // 2. Mark Complete
        const completionSuccess = await ScheduledClassService.updateScheduledClassCompletion(scheduledClassId, true, true)
        if (!completionSuccess) throw new Error('Failed to update class completion status')
        
        setCurrentStep('completed')
        
        // Auto-close after 2 seconds
        setTimeout(() => {
            onClose()
        }, 2000)

    } catch (error) {
        console.error('Complete class error:', error)
        toast.error('Failed to complete class. Please try again.')
    } finally {
        setSaving(false)
    }
  }

  if (!isOpen || !classItem) return null

  // Animation Variants
  const containerVariants: Variants = {
    hidden: { scale: 0.9, opacity: 0, y: 20 },
    visible: { 
        scale: 1, 
        opacity: 1, 
        y: 0,
        transition: { type: "spring", duration: 0.5, bounce: 0.3 }
    },
    exit: { scale: 0.9, opacity: 0, y: 20 }
  }

  const stepVariants: Variants = {
    enter: { x: 20, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col font-sans"
          >
            {/* Header */}
            <div className="bg-white px-8 pt-8 pb-4 relative z-10 border-b border-gray-100/50">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <motion.h2 layoutId="title" className="text-2xl font-bold text-gray-900 tracking-tight">
                            {classItem.subject_name}
                        </motion.h2>
                        <div className="flex items-center gap-3 mt-2 text-gray-500 text-sm font-medium">
                            <span className="flex items-center gap-1.5 bg-gray-100 px-3 py-1 rounded-full text-gray-600">
                                <Calendar size={14} />
                                {new Date(classItem.class_date || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className={`uppercase tracking-wider text-xs font-bold px-2 py-1 rounded-md ${currentStep === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                                {currentStep === 'completed' ? 'Completed' : `STEP ${currentStep === 'topics' ? '1' : currentStep === 'proof' ? '2' : '3'} OF 3`}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 -mr-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Progress Bar */}
                {currentStep !== 'completed' && (
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-4">
                        <motion.div 
                            className="h-full bg-gray-900 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: currentStep === 'topics' ? '33%' : currentStep === 'proof' ? '66%' : '100%' }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="p-8 overflow-y-auto flex-1 bg-white">
             {loading ? (
                 <div className="flex flex-col justify-center items-center h-48 gap-4 text-gray-400">
                     <Loader2 className="animate-spin text-gray-900" size={32}/>
                     <p className="text-sm font-medium">Loading session details...</p>
                 </div>
             ) : (
                <AnimatePresence mode="wait">
                    
                    {/* Step 1: Topics */}
                    {currentStep === 'topics' && (
                        <motion.div key="topics" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-lg font-bold text-gray-900 mb-2">What did you teach today?</label>
                                    <p className="text-gray-500 text-sm mb-4">Briefly describe the topics covered in this session.</p>
                                    <textarea
                                        value={topics}
                                        onChange={(e) => setTopics(e.target.value)}
                                        placeholder="e.g. Introduction to React state management, Hooks, and Effects..."
                                        className="w-full h-40 p-5 bg-gray-50 rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all resize-none text-gray-800 placeholder-gray-400 text-base shadow-inner"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex justify-end pt-4">
                                    <button 
                                        onClick={handleNextStep}
                                        disabled={!topics.trim() || saving}
                                        className="flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={20} /> : 'Next Step'} <ArrowRight size={20} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Proof (Link) */}
                    {currentStep === 'proof' && (
                        <motion.div key="proof" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                             <div className="text-center max-w-sm mx-auto space-y-8 py-4">
                                <div className="space-y-2">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-900 shadow-sm border border-gray-100">
                                        <Camera size={32} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">Upload Evidence</h3>
                                    <p className="text-gray-500 text-sm">Optional: Provide a link to your class screenshot or photo.</p>
                                </div>
                                
                                <div className="relative">
                                    <LinkIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input 
                                        type="url"
                                        value={imageLink}
                                        onChange={(e) => setImageLink(e.target.value)}
                                        placeholder="https://..."
                                        className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all shadow-sm font-medium"
                                        autoFocus
                                    />
                                </div>

                                <button 
                                    onClick={handleNextStep}
                                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={20} /> : 'Proceed to Attendance'} <ArrowRight size={20} />
                                </button>
                                
                                <button 
                                    onClick={handleNextStep}
                                    className="text-gray-400 text-sm hover:text-gray-600 font-medium transition-colors"
                                >
                                    Skip this step
                                </button>
                             </div>
                        </motion.div>
                    )}

                    {/* Step 3: Attendance */}
                    {currentStep === 'attendance' && (
                        <motion.div key="attendance" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <Users className="text-gray-900" size={20} /> Student List
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-500">Total:</span>
                                    <span className="bg-gray-100 text-gray-900 text-sm font-bold px-3 py-1 rounded-full">{attendanceRecords.length}</span>
                                </div>
                             </div>

                             <div className="space-y-3 mb-8 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                {attendanceRecords.map((record) => (
                                    <motion.div 
                                        layout
                                        key={record.student_id} 
                                        className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 ${getAvatarColor(record.student_name)} rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white`}>
                                                {getInitials(record.student_name)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 text-sm">{record.student_name}</span>
                                                <span className="text-xs text-gray-400 font-medium">{record.student_id}</span>
                                            </div>
                                        </div>
                                        <div className="flex bg-gray-50 p-1 rounded-xl">
                                            <button 
                                                onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'present'} : p))}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${record.status === 'present' ? 'bg-white text-green-600 shadow-sm scale-100' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                Present
                                            </button>
                                            <button 
                                                onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'absent'} : p))}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${record.status === 'absent' ? 'bg-white text-red-600 shadow-sm scale-100' : 'text-gray-400 hover:text-gray-600'}`}
                                            >
                                                Absent
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                             </div>

                             <div className="flex justify-end pt-4 border-t border-gray-50">
                                <button 
                                    onClick={handleCompleteClass}
                                    disabled={saving}
                                    className="flex items-center gap-2 bg-gray-900 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 min-w-[200px] justify-center"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={20} /> : 'Finish Class'}
                                </button>
                             </div>
                        </motion.div>
                    )}

                    {/* Step 4: Completed */}
                    {currentStep === 'completed' && (
                        <motion.div key="completed" variants={stepVariants} initial="enter" animate="center" exit="exit" className="text-center py-12 flex flex-col items-center justify-center h-full">
                            <motion.div 
                                initial={{ scale: 0, rotate: -20 }} 
                                animate={{ scale: 1, rotate: 0 }} 
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="w-28 h-28 bg-green-50 rounded-full flex items-center justify-center mb-8 text-green-500 shadow-sm"
                            >
                                <Trophy size={48} strokeWidth={2.5} />
                            </motion.div>
                            <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">Class Completed!</h2>
                            <p className="text-gray-500 font-medium">Session recorded successfully.</p>
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
