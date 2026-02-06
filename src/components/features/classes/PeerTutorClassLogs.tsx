'use client'

import React, { useMemo, useState } from 'react'
import { ScheduledClassWithDetails } from '@/lib/services/scheduledClassService'
import { AdditionalClassWithAttendance } from '@/lib/services/additionalClassService'
import { 
  Calendar, 
  CheckCircle, 
  Clock, 
  Users, 
  ExternalLink,
  ChevronDown
} from 'lucide-react'
import { Card } from '@/components/ui'

// Inline helper if utility doesn't exist to be safe
const parseDateSafe = (dateStr: string) => {
  if (!dateStr) return new Date()
  const cleanDate = dateStr.split('T')[0]
  const [y, m, d] = cleanDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}


const formatTime = (timeStr: string | null | undefined) => {
  if (!timeStr) return '??:??'
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

interface PeerTutorClassLogsProps {
  scheduledClasses: ScheduledClassWithDetails[]
  additionalClasses: AdditionalClassWithAttendance[]
  loading?: boolean
}

type ClassLogItem = {
  id: string
  type: 'scheduled' | 'additional'
  date: Date
  dateStr: string
  subject: string
  topic: string
  status: 'completed' | 'pending' | 'missed' | 'upcoming'
  details: ScheduledClassWithDetails | AdditionalClassWithAttendance
  metrics?: {
    present: number
    total: number
  }
}

export default function PeerTutorClassLogs({ 
  scheduledClasses, 
  additionalClasses,
  loading = false
}: PeerTutorClassLogsProps) {
  
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'additional'>('all')

  const mergedLogs: ClassLogItem[] = useMemo(() => {
    const logs: ClassLogItem[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Process Scheduled Classes
    scheduledClasses.forEach(sc => {
      if (!sc.scheduled_date) return
      
      const date = parseDateSafe(sc.scheduled_date)
      let status: ClassLogItem['status'] = 'pending'
      
      const isCompleted = sc.completion_status === 'completed' || (sc.attendance_completed && sc.topics_completed)
      
      if (isCompleted) {
        status = 'completed'
      } else if (date < today) {
        status = 'missed'
      } else {
        status = 'upcoming' // Future relative to "today"
      }

      logs.push({
        id: sc.id,
        type: 'scheduled',
        date: date,
        dateStr: sc.scheduled_date,
        subject: sc.class.subject_name,
        topic: sc.topics || 'No topic entered',
        status: status,
        details: sc
      })
    })

    // Process Additional Classes
    additionalClasses.forEach(ac => {
      const date = parseDateSafe(ac.class_date)
      const presentCount = ac.attendance_records.filter(r => r.status === 'present').length
      const totalCount = ac.attendance_records.length
      
      logs.push({
        id: ac.id,
        type: 'additional',
        date: date,
        dateStr: ac.class_date,
        subject: ac.subject_name,
        topic: ac.topic,
        status: 'completed', // Additional classes are by definition "logged" so completed
        details: ac,
        metrics: {
          present: presentCount,
          total: totalCount
        }
      })
    })

    // Sort by Date Descending
    return logs.sort((a, b) => b.date.getTime() - a.date.getTime())
  }, [scheduledClasses, additionalClasses])

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return mergedLogs
    return mergedLogs.filter(log => log.type === filter)
  }, [mergedLogs, filter])

  // Stats for the header
  const stats = useMemo(() => {
    const scheduledTotal = scheduledClasses.length
    const additionalTotal = additionalClasses.length
    const scheduledCompleted = mergedLogs.filter(l => l.type === 'scheduled' && l.status === 'completed').length
    const scheduledMissed = mergedLogs.filter(l => l.type === 'scheduled' && l.status === 'missed').length
    
    return { scheduledTotal, additionalTotal, scheduledCompleted, scheduledMissed }
  }, [scheduledClasses, additionalClasses, mergedLogs])

  if (loading) {
    return (
       <Card className="p-6 rounded-[2rem] border-none shadow-sm bg-white min-h-[400px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
             <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading Class Logs...</p>
          </div>
       </Card>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center text-center">
           <span className="text-2xl font-black text-gray-900">{stats.scheduledTotal}</span>
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scheduled Classes</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center text-center">
           <span className="text-2xl font-black text-purple-600">{stats.additionalTotal}</span>
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Additional Classes</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center text-center">
           <span className="text-2xl font-black text-green-600">{stats.scheduledCompleted}</span>
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed On-Time</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center text-center">
           <span className="text-2xl font-black text-red-500">{stats.scheduledMissed}</span>
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Missed / Pending</span>
        </div>
      </div>

      {/* Main Timeline Card */}
      <Card className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Class Logs Timeline</h3>
            <p className="text-xs font-medium text-gray-500 mt-1">Comprehensive view of all teaching activities sorted by date</p>
          </div>
          
          <div className="flex bg-gray-100 p-1 rounded-xl self-start sm:self-center">
             <button 
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
                All
             </button>
             <button 
                onClick={() => setFilter('scheduled')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === 'scheduled' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
                Scheduled
             </button>
             <button 
                onClick={() => setFilter('additional')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${filter === 'additional' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
                Additional
             </button>
          </div>
        </div>

        <div className="p-0">
          {filteredLogs.length > 0 ? (
            <div className="divide-y divide-gray-50">
               {filteredLogs.map((log) => (
                 <ClassLogRow key={`${log.type}-${log.id}`} log={log} />
               ))}
            </div>
          ) : (
             <div className="py-20 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                   <Calendar size={32} />
                </div>
                <h4 className="text-sm font-bold text-gray-900">No Class Logs Found</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">No classes match your current filter criteria.</p>
             </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function ClassLogRow({ log }: { log: ClassLogItem }) {
  const [expanded, setExpanded] = useState(false)
  
  const isTypeScheduled = log.type === 'scheduled'
  
  const statusColors = {
     completed: 'bg-green-100 text-green-700 border-green-200',
     pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
     missed: 'bg-red-100 text-red-700 border-red-200',
     upcoming: 'bg-blue-100 text-blue-700 border-blue-200'
  }

  const typeColor = isTypeScheduled ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'

  return (
    <div className={`transition-colors hover:bg-gray-50 ${expanded ? 'bg-gray-50/50' : ''}`}>
        <div 
          className="p-5 cursor-pointer flex flex-col md:flex-row gap-4 items-start md:items-center"
          onClick={() => setExpanded(!expanded)}
        >
            {/* Date Column */}
           <div className="flex-shrink-0 w-full md:w-32 flex md:flex-col items-center md:items-start gap-2 md:gap-0">
               <span className="text-sm font-bold text-gray-900">{log.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
               <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{log.date.getFullYear()}</span>
           </div>

           {/* Main Content */}
           <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center w-full">
              
              {/* Type Badge */}
              <div className="md:col-span-2">
                 <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${typeColor}`}>
                    {isTypeScheduled ? 'Scheduled' : 'Additional'}
                 </span>
              </div>

               {/* Subject & Topic */}
               <div className="md:col-span-6">
                   <h4 className="text-xs font-bold text-gray-900 uppercase tracking-tight truncate mb-1">{log.subject}</h4>
                   <p className="text-sm text-gray-600 line-clamp-1">{log.topic}</p>
               </div>

               {/* Status */}
               <div className="md:col-span-3 flex md:justify-end">
                   <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider gap-1.5 ${statusColors[log.status]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'completed' ? 'bg-green-600' : log.status === 'missed' ? 'bg-red-600' : log.status === 'upcoming' ? 'bg-blue-600' : 'bg-yellow-600'}`}></span>
                      {log.status === 'missed' ? 'Incomplete' : log.status}
                   </span>
               </div>
               
               {/* Expand Icon */}
               <div className="hidden md:flex md:col-span-1 justify-end">
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
               </div>
           </div>
        </div>

        {/* Expanded Details */}
        {expanded && (
            <div className="px-5 pb-5 md:pl-36">
               <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4 animate-in slide-in-from-top-2 duration-200">
                  
                  {/* Time & Link Row */}
                  <div className="flex flex-wrap gap-4 items-center pb-4 border-b border-gray-50">
                      <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <Clock size={14} className="text-gray-400" />
                          <span className="font-semibold">
                             {formatTime(log.details.start_time)} - {formatTime(log.details.end_time)}
                          </span>
                      </div>
                      {log.details.link && (
                          <a href={log.details.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                             <ExternalLink size={14} />
                             <span>Meeting Link</span>
                          </a>
                      )}
                  </div>

                  {/* Additional Info for Scheduled */}
                  {isTypeScheduled && (
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                           <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Class ID</h5>
                           <p className="text-xs font-mono text-gray-600 bg-gray-50 p-2 rounded-lg truncate">{(log.details as ScheduledClassWithDetails).class_id}</p>
                        </div>
                        <div>
                           <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">System Status</h5>
                           <div className="flex gap-2">
                               <span className={`px-2 py-1 rounded text-[10px] font-medium border ${(log.details as ScheduledClassWithDetails).attendance_completed ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                  Attendance: {(log.details as ScheduledClassWithDetails).attendance_completed ? 'Done' : 'Pending'}
                               </span>
                               <span className={`px-2 py-1 rounded text-[10px] font-medium border ${(log.details as ScheduledClassWithDetails).topics_completed ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                  Topics: {(log.details as ScheduledClassWithDetails).topics_completed ? 'Logged' : 'Pending'}
                               </span>
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Attendance Stats for Additional Classes */}
                  {!isTypeScheduled && log.metrics && (
                      <div>
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                             <Users size={12} /> Attendance Summary
                          </h5>
                          <div className="flex items-center gap-3">
                              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                                  <div 
                                    className="h-full bg-green-500" 
                                    style={{ width: `${(log.metrics.present / log.metrics.total) * 100}%` }}
                                  />
                              </div>
                              <span className="text-xs font-bold text-gray-700 w-16 text-right">
                                  {log.metrics.present} / {log.metrics.total}
                              </span>
                          </div>
                      </div>
                  )}

               </div>
            </div>
        )}
    </div>
  )
}
