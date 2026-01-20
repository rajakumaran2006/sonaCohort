'use client'

import { useState, useEffect, useCallback } from 'react'
import { Class } from '@/lib/services/classService'
import { AttendanceService, AttendanceRecord } from '@/lib/services/attendanceService'
import { peertutorsAuthService } from '@/lib/auth/peerTutorAuthService'
import { ScheduledClassService } from '@/lib/services/scheduledClassService'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { 
  X, 
  ArrowRight, 
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { isValidUrl } from '@/lib/utils/validators'
import ClassDetailsSkeleton from '@/components/skeletons/ClassDetailsSkeleton'

interface ClassDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  classItem: Class | null
  userEmail: string
}

const getInitials = (name: string): string => name.split(' ').map(word => word.charAt(0)).join('').toUpperCase().slice(0, 2)


export default function ClassDetailsModal({ isOpen, onClose, classItem, userEmail }: ClassDetailsModalProps) {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [topics, setTopics] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('')
  const [endTime, setEndTime] = useState<string>('')
  const [meetingLink, setMeetingLink] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentStep, setCurrentStep] = useState<'topics' | 'attendance' | 'completed'>('topics')
  const [peertutorsId, setpeertutorsId] = useState<string>('')
  const [scheduledClassId, setScheduledClassId] = useState<string>('')
  const [isCompletedClass, setIsCompletedClass] = useState(false)



  
  // Track original values to detect changes
  const [originalTopics, setOriginalTopics] = useState<string>('')
  const [originalStartTime, setOriginalStartTime] = useState<string>('')
  const [originalEndTime, setOriginalEndTime] = useState<string>('')
  const [originalMeetingLink, setOriginalMeetingLink] = useState<string>('')
  const [originalAttendance, setOriginalAttendance] = useState<AttendanceRecord[]>([])
  
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
      let existingAttendance: AttendanceRecord[] = []

      // If we don't have a direct scheduled_class_id prop, try to find one for TODAY or specific date
      if (!currentScheduledClassId) {
         // Look for an existing scheduled class for this tutor, this class, and today's date (or Class Date if provided)
         const targetDate = classItem.class_date || new Date().toISOString().split('T')[0]
         
         const { data: foundScheduledClass } = await supabase
            .from('scheduled_classes')
            .select('id, topics, start_time, end_time, link, image_link, completion_status')
            .eq('class_id', classItem.id)
            .eq('peer_tutor_id', tutorInfo.id)
            .eq('scheduled_date', targetDate)
            .maybeSingle()

         if (foundScheduledClass) {
             currentScheduledClassId = foundScheduledClass.id
             setTopics(foundScheduledClass.topics || '')
             setStartTime(foundScheduledClass.start_time || '')
             setEndTime(foundScheduledClass.end_time || '')
             setMeetingLink(foundScheduledClass.link || '')
             
             // Store original values for change detection
             setOriginalTopics(foundScheduledClass.topics || '')
             setOriginalStartTime(foundScheduledClass.start_time || '')
             setOriginalEndTime(foundScheduledClass.end_time || '')
             setOriginalMeetingLink(foundScheduledClass.link || '')
             
             if (foundScheduledClass.completion_status === 'completed') {
                 setIsCompletedClass(true)
             } else {
                 setIsCompletedClass(false)
             }
         }
      } else {
           // We have an ID passed in (e.g. from a list where it was known)
           const scheduledClass = await ScheduledClassService.getScheduledClassById(currentScheduledClassId)
           if (scheduledClass) {
                setTopics(scheduledClass.topics || '')
                setStartTime(scheduledClass.start_time || '')
                setEndTime(scheduledClass.end_time || '')
                setMeetingLink(scheduledClass.link || '')
                // Image link not used currently
                
                // Store original values for change detection
                setOriginalTopics(scheduledClass.topics || '')
                setOriginalStartTime(scheduledClass.start_time || '')
                setOriginalEndTime(scheduledClass.end_time || '')
                setOriginalMeetingLink(scheduledClass.link || '')
                
                if (scheduledClass.completion_status === 'completed') {
                    setIsCompletedClass(true)
                } else {
                    setIsCompletedClass(false)
                }
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
      const mergedAttendance = students.map(student => {
        const record = existingAttendance.find(att => att.student_id === student.id)
        return {
            student_id: student.id,
            student_name: student.name,
            student_email: student.email,
            status: record?.status || 'present' // Default to present
        }
      })
      setAttendanceRecords(mergedAttendance)
      setOriginalAttendance(JSON.parse(JSON.stringify(mergedAttendance))) // Deep copy

    } catch (error) {
      logger.error('Error loading class details:', error)
      toast.error('Failed to load class details')
    } finally {
      setLoading(false)
    }
  }, [classItem, userEmail, supabase])

  // Load Initial Data
  useEffect(() => {
    if (isOpen && classItem && userEmail) {
      // Reset states when opening
      setIsCompletedClass(false)
      setCurrentStep('topics')
      loadClassDetails()
    }
  }, [isOpen, classItem, userEmail, loadClassDetails])


  // Steps Logic
  const handleUpdateRecord = async () => {
    if (!peertutorsId || !classItem) {
        toast.error('Missing session information. Please try again.', { position: 'top-right' })
        return
    }

    // Validate required fields
    if (!topics.trim()) {
        toast.warning('Please enter what you taught today.', { position: 'top-right' })
        return
    }
    if (!startTime || !endTime) {
        toast.warning('Start time and end time are mandatory.', { position: 'top-right' })
        return
    }
    if (!meetingLink) {
        toast.warning('Class link is mandatory to verify the session.', { position: 'top-right' })
        return
    }
    if (meetingLink && !isValidUrl(meetingLink)) {
        toast.warning('Please enter a valid link', { position: 'top-right' })
        return
    }

    if (endTime <= startTime) {
        toast.error('End time must be after start time', { position: 'top-right' })
        return
    }

    // Validate at least one student is present
    const hasPresentStudent = attendanceRecords.some(record => record.status === 'present')
    if (!hasPresentStudent) {
        toast.warning('At least one student must be marked as present', { position: 'top-right' })
        return
    }
    
    setSaving(true)
    try {
        if (scheduledClassId && peertutorsId) {
             logger.info('Updating record for scheduled class:', scheduledClassId)
             
             // 1. Update class details (topics, time, link)
             const detailsSuccess = await ScheduledClassService.updateScheduledClassDetails(scheduledClassId, {
              topics: topics,
              start_time: startTime,
              end_time: endTime,
              link: meetingLink
            })
            
            if (!detailsSuccess) {
                toast.error('Failed to update class details', { position: 'top-right' })
                logger.error('Update details returned false')
                return
            }
            
            // 2. Update attendance records
            const attendanceSuccess = await AttendanceService.markAttendanceForScheduledClass(
              scheduledClassId, 
              peertutorsId, 
              attendanceRecords
            )
            
            if (!attendanceSuccess) {
                toast.error('Failed to update attendance', { position: 'top-right' })
                logger.error('Update attendance returned false')
                return
            }
            
            // Update original values to reflect the new saved state
            setOriginalTopics(topics)
            setOriginalStartTime(startTime)
            setOriginalEndTime(endTime)
            setOriginalMeetingLink(meetingLink)
            setOriginalAttendance(JSON.parse(JSON.stringify(attendanceRecords))) // Deep copy
            
            toast.success('Class updated successfully!', { position: 'top-right' })
            logger.info('Successfully updated class records and attendance')
            
            // Reload to get fresh data
            await loadClassDetails()
            
            // Transition to completion step
            setCurrentStep('completed')
            
            // Auto-close after 2 seconds
            setTimeout(() => {
                onClose()
            }, 2000)
        } else {
            toast.error('No class session found to update', { position: 'top-right' })
            logger.error('No scheduledClassId or peertutorsId available')
        }
    } catch (err) {
        logger.error("Error updating record:", err)
        toast.error('Failed to update class', { position: 'top-right' })
    } finally {
        setSaving(false)
    }
  }

  const handleNextStep = () => {
    if (currentStep === 'topics') {
      // Only validate fields, do NOT save to database
      if (!topics.trim()) {
        toast.warning('Please enter what you taught today.')
        return
      }
      if (topics.length > 50) {
        toast.error('Topic must be 50 characters or less')
        return
      }
      if (!startTime) {
        toast.warning('Start time is mandatory.')
        return
      }
      if (!endTime) {
        toast.warning('End time is mandatory.')
        return
      }
      if (!meetingLink) {
        toast.warning('Class link is mandatory.')
        return
      }
      if (meetingLink && !isValidUrl(meetingLink)) {
        toast.warning('Please enter a valid link')
        return
      }

      if (endTime <= startTime) {
        toast.warning('End time must be after start time.')
        return
      }
      
      // Just move to next step without saving
      setCurrentStep('attendance')
    }
  }

  const handleCompleteClass = async () => {
    if (!peertutorsId || !classItem) {
        toast.error('Missing session information. Please try again.', { position: 'top-right' })
        return
    }

    // Validate required fields
    if (!topics.trim()) {
        toast.warning('Please enter what you taught today.', { position: 'top-right' })
        return
    }
    if (!startTime || !endTime) {
        toast.warning('Start time and end time are mandatory.', { position: 'top-right' })
        return
    }

    if (endTime <= startTime) {
        toast.error('End time must be after start time', { position: 'top-right' })
        return
    }
    
    // Validate at least one student is present
    const hasPresentStudent = attendanceRecords.some(record => record.status === 'present')
    if (!hasPresentStudent) {
        toast.warning('At least one student must be marked as present', { position: 'top-right' })
        return
    }

    setSaving(true)
    try {
        let targetId = scheduledClassId
        const targetDate = classItem.class_date || new Date().toISOString().split('T')[0]

        // Step 1: Create or Update scheduled class with details
        if (!targetId) {
            // Create new scheduled class
            logger.info('Creating new scheduled class...')
            const success = await ScheduledClassService.createScheduledClass({
                class_id: classItem.id,
                scheduled_date: targetDate,
                dept: classItem.dept,
                year: classItem.year,
                section: classItem.section,
                faculty_id: classItem.faculty_id,
                topics: topics,
                start_time: startTime,
                end_time: endTime,
                link: meetingLink
            })
            
            if (!success) {
                toast.error('Failed to create class session', { position: 'top-right' })
                return
            }

            // Fetch the newly created ID
            const { data: newSc, error: fetchError } = await supabase
                .from('scheduled_classes')
                .select('id')
                .eq('class_id', classItem.id)
                .eq('peer_tutor_id', peertutorsId)
                .eq('scheduled_date', targetDate)
                .maybeSingle()
            
            if (fetchError || !newSc) {
                logger.error('Error fetching newly created scheduled class:', fetchError)
                toast.error('Failed to retrieve class session', { position: 'top-right' })
                return
            }

            targetId = newSc.id
            setScheduledClassId(newSc.id)
        } else {
            // Update existing scheduled class details
            logger.info('Updating existing scheduled class:', targetId)
            const updateSuccess = await ScheduledClassService.updateScheduledClassDetails(targetId, {
                topics: topics,
                start_time: startTime,
                end_time: endTime,
                link: meetingLink
            })

            if (!updateSuccess) {
                toast.error('Failed to update class details', { position: 'top-right' })
                return
            }
        }

        // Step 2: Save Attendance
        const attendanceSuccess = await AttendanceService.markAttendanceForScheduledClass(
            targetId, 
            peertutorsId, 
            attendanceRecords
        )
        if (!attendanceSuccess) {
            toast.error('Failed to save attendance records', { position: 'top-right' })
            return
        }
        
        // Step 3: Mark Complete
        const completionSuccess = await ScheduledClassService.updateScheduledClassCompletion(
            targetId, 
            true, 
            true
        )
        if (!completionSuccess) {
            toast.error('Failed to complete class', { position: 'top-right' })
            return
        }
        
        // Step 4: Show success and reload
        toast.success('Class submitted successfully!', { position: 'top-right' })
        await loadClassDetails()
        
        setCurrentStep('completed')
        
        // Auto-close after 2 seconds
        setTimeout(() => {
            onClose()
        }, 2000)

    } catch (error) {
        logger.error('Submit class error:', error)
        toast.error('Failed to submit class', { position: 'top-right' })
    } finally {
        setSaving(false)
    }
  }

  // Animation Variants
  const containerVariants: Variants = {
    hidden: { 
        scale: 0.95, 
        opacity: 0, 
        y: 20 
    },
    visible: { 
        scale: 1, 
        opacity: 1, 
        y: 0,
        transition: { 
            type: "spring", 
            duration: 0.5, 
            bounce: 0.2,
            damping: 25,
            stiffness: 300
        }
    },
    exit: { 
        scale: 0.95, 
        opacity: 0, 
        y: 20,
        transition: { duration: 0.2 } 
    }
  }

  const stepVariants: Variants = {
    enter: { x: 20, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 }
  }

  return (
    <AnimatePresence>
      {isOpen && classItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            layout
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative w-full sm:max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] sm:max-h-[90vh] flex flex-col font-sans"
          >

            {/* Header */}
            <div className="bg-white px-4 sm:px-8 pt-6 sm:pt-8 pb-3 sm:pb-4 relative z-10 border-b border-gray-100/50">
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                        <motion.h2 layoutId="title" className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
                            {classItem.subject_name}
                        </motion.h2>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-gray-500 text-xs sm:text-sm font-medium">
                            <span className="flex items-center gap-1 sm:gap-1.5 bg-gray-100 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-gray-600 text-[10px] sm:text-xs">
                                <span className="hidden uppercase sm:inline">{new Date(classItem.class_date || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                <span className="sm:hidden">{new Date(classItem.class_date || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            </span>
                            <span className="text-gray-300 hidden sm:inline">•</span>
                            <span className={`uppercase tracking-wider text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:py-1 rounded-md whitespace-nowrap ${currentStep === 'completed' ? 'bg-gray-100 text-black' : 'bg-gray-100 text-black'}`}>
                                {currentStep === 'completed' ? 'Completed' : `STEP ${currentStep === 'topics' ? '1' : '2'} OF 2`}
                            </span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-1.5 sm:p-2 -mr-1 sm:-mr-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all flex-shrink-0"
                    >
                        <X size={18} className="sm:w-5 sm:h-5" />
                    </button>
                </div>

                {/* Progress Bar */}
                {currentStep !== 'completed' && (
                    <div className="h-1 sm:h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-3 sm:mt-4">
                        <motion.div 
                            className="h-full bg-gray-900 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ 
                                width: currentStep === 'topics' ? '0%' : 
                                       currentStep === 'attendance' ? '50%' : '100%' 
                            }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-white">
             {loading ? (
                 <ClassDetailsSkeleton />
             ) : (
                <AnimatePresence mode="wait">
                    
                    {/* Step 1: Topics */}
                    {currentStep === 'topics' && (
                        <motion.div key="topics" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                            <div className="space-y-4 sm:space-y-6">
                                <div>
                                    <div className="flex justify-between items-end mb-2">
                                        <label className="block text-base sm:text-lg font-bold text-gray-900">What did you teach today?</label>
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${topics.length >= 50 ? 'text-red-500' : 'text-gray-400'}`}>
                                            {topics.length}/50 Chars
                                        </span>
                                    </div>
                                    <textarea
                                        value={topics}
                                        maxLength={50}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val.length <= 50) {
                                                setTopics(val);
                                            }
                                        }}
                                        placeholder="e.g. Introduction to React state management..."
                                        className={`w-full h-32 sm:h-40 p-3 sm:p-5 bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all resize-none text-gray-800 placeholder-gray-400 text-sm sm:text-base shadow-inner ${topics.length > 50 ? 'border-red-300' : ''}`}
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                   <div>
                                      <label className="block text-xs sm:text-sm font-bold text-gray-900 mb-1.5 sm:mb-2">Start Time</label>
                                      <input 
                                        type="time" 
                                        value={startTime}
                                        onChange={(e) => setStartTime(e.target.value)}
                                        className="w-full p-2.5 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all text-gray-800 text-sm sm:text-base shadow-inner"
                                      />
                                   </div>
                                   <div>
                                      <label className="block text-xs sm:text-sm font-bold text-gray-900 mb-1.5 sm:mb-2">End Time</label>
                                      <input 
                                        type="time" 
                                        value={endTime}
                                        min={startTime}
                                        onChange={(e) => setEndTime(e.target.value)}
                                        className="w-full p-2.5 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all text-gray-800 text-sm sm:text-base shadow-inner"
                                      />
                                   </div>
                                </div>

                                <div>
                                    <label className="block text-xs sm:text-sm font-bold text-gray-900 mb-1.5 sm:mb-2">Class Link</label>
                                    <input 
                                      type="url" 
                                      value={meetingLink}
                                      onChange={(e) => setMeetingLink(e.target.value)}
                                      placeholder="https://meet.google.com/..."
                                      className="w-full p-2.5 sm:p-4 bg-gray-50 rounded-xl sm:rounded-2xl border border-gray-100 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:bg-white focus:outline-none transition-all text-gray-800 text-sm sm:text-base shadow-inner"
                                    />
                                </div>
                                <div className="flex justify-end pt-3 sm:pt-4">
                                    <button 
                                        onClick={handleNextStep}
                                        disabled={!topics.trim() || !startTime || !endTime || !meetingLink || saving}
                                        className="flex items-center justify-center gap-2 bg-gray-900 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={18} /> : 'Next'} <ArrowRight size={18} />
                                    </button>
                                </div>
                                </div>
                        </motion.div>
                    )}



                    {/* Step 2: Attendance */}
                    {currentStep === 'attendance' && (
                        <motion.div key="attendance" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
                             {/* Breadcrumb Navigation */}
                             <div className="mb-6 pb-4 border-b border-gray-100">
                                 <button
                                     onClick={() => setCurrentStep('topics')}
                                     className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
                                 >
                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                     </svg>
                                     <span className="uppercase tracking-wide text-xs">Topics & Details</span>
                                 </button>
                             </div>

                             <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold uppercase text-gray-900 flex items-center gap-2">
                            Student List
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
                                            <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                                {getInitials(record.student_name)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-900 text-sm">{record.student_name}</span>
                                            </div>
                                        </div>
                                        <div className="flex bg-gray-50 p-1 rounded-xl gap-1">
                                            <button 
                                                onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'present'} : p))}
                                                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${record.status === 'present' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/50'}`}
                                                title="Mark Present"
                                            >
                                                <CheckCircle size={20} className={record.status === 'present' ? "fill-green-600/20" : ""} />
                                            </button>
                                            <button 
                                                onClick={() => setAttendanceRecords(prev => prev.map(p => p.student_id === record.student_id ? {...p, status: 'absent'} : p))}
                                                className={`p-2 rounded-lg transition-all duration-200 flex items-center justify-center ${record.status === 'absent' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200/50'}`}
                                                title="Mark Absent"
                                            >
                                                <XCircle size={20} className={record.status === 'absent' ? "fill-red-600/20" : ""} />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                             </div>

                             {/* Conditional Finish/Update Button */}
                             {topics.trim() && startTime && endTime ? (
                                 (() => {
                                     // Check if user made any changes to class details or attendance
                                     const detailsChanged = 
                                         topics !== originalTopics ||
                                         startTime !== originalStartTime ||
                                         endTime !== originalEndTime ||
                                         meetingLink !== originalMeetingLink;
                                     
                                     // Check if attendance changed
                                     const attendanceChanged = JSON.stringify(attendanceRecords) !== JSON.stringify(originalAttendance);
                                     
                                     const anyChanges = detailsChanged || attendanceChanged;
                                     
                                     // For completed classes, show Update button if changes were made
                                     if (isCompletedClass) {
                                         if (!anyChanges) {
                                             // No changes - just allow closing
                                             return (
                                                 <div className="pt-4 border-t border-gray-50">
                                                     <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 text-center">
                                                         <p className="text-sm font-medium uppercase text-black">
                                                             No changes detected.
                                                         </p>
                                                     </div>
                                                 </div>
                                             );
                                         }
                                         
                                         // Changes detected - show Update button
                                         return (
                                             <div className="flex justify-end pt-4 border-t border-gray-50">
                                                <button 
                                                    onClick={async () => {
                                                        await handleUpdateRecord();
                                                    }}
                                                    disabled={saving}
                                                    className="flex items-center gap-2 bg-gray-900 text-white uppercase px-10 py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 min-w-[200px] justify-center"
                                                >
                                                    {saving ? <Loader2 className="animate-spin" size={20} /> : 'Update'}
                                                </button>
                                             </div>
                                         );
                                     }
                                     
                                     // New class - show Submit button
                                     return (
                                         <div className="flex justify-end pt-4 border-t border-gray-50">
                                            <button 
                                                onClick={handleCompleteClass}
                                                disabled={saving}
                                                className="flex items-center gap-2 bg-gray-900 text-white px-10 py-4 rounded-2xl font-bold shadow-xl shadow-gray-200 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 min-w-[200px] justify-center"
                                            >
                                                {saving ? <Loader2 className="animate-spin" size={20} /> : 'Submit Class'}
                                            </button>
                                         </div>
                                     );
                                 })()
                             ) : (
                                 <div className="pt-4 border-t border-gray-50">
                                     <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                                         <p className="text-sm font-medium text-amber-800">
                                             Please complete all mandatory fields in Topics & Details to finish this class
                                         </p>
                                     </div>
                                 </div>
                             )}
                        </motion.div>
                    )}

                    {/* Step 4: Completed */}
                    {currentStep === 'completed' && (
                        <motion.div key="completed" variants={stepVariants} initial="enter" animate="center" exit="exit" className="text-center py-12 flex flex-col items-center justify-center h-full">
                            <motion.div 
                                initial={{ scale: 0, rotate: -20 }} 
                                animate={{ scale: 1, rotate: 0 }} 
                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                className="w-28 h-28 bg-gray-50 border-gray-100 rounded-full flex items-center justify-center mb-8 text-black shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-12 h-12 fill-current">
                                    <path d="M 32 6 C 25 6 18 7 18 7 L 18 16 C 18 21.794989 21.688253 28.583102 24.794922 33.279297 C 18.80885 30.186096 11 23.39998 11 17 L 11 14 L 14.939453 14 L 13.830078 10 L 7 10 L 7 17 C 7 27.948915 21.900402 37.918809 28.927734 38.912109 C 28.935563 38.921431 29 39 29 39 L 29 44.619141 C 29.83 44.419141 30.740703 44.259922 31.720703 44.169922 C 32.910703 44.059922 34 44.050859 35 44.130859 L 35 39 C 35 39 35.064437 38.921431 35.072266 38.912109 C 42.099598 37.918809 57 27.948915 57 17 L 57 10 L 50.169922 10 L 49.060547 14 L 53 14 L 53 17 C 53 23.39998 45.19115 30.186096 39.205078 33.279297 C 42.311747 28.583102 46 21.794989 46 16 L 46 7 C 46 7 39 6 32 6 z M 32 47 C 27 47 24 49 24 49 L 22 55 L 21.658203 55.171875 C 20.642203 55.679875 20 56.717516 20 57.853516 L 20 59 L 44 59 L 44 57.853516 C 44 56.717516 43.357797 55.679875 42.341797 55.171875 L 42 55 L 40 49 C 40 49 37 47 32 47 z"></path>
                                </svg>
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
