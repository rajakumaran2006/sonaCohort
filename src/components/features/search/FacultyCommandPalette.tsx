'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { 
  Search, 
  Command, 
  Users, 
  GraduationCap, 
  FileText, 
  BarChart3, 
  User, 
  LayoutGrid, 
  ArrowRight,
  ClipboardList,
  CreditCard,
  MessageSquare
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { StudentService } from '@/lib/services/studentService'
import { peertutorservice } from '@/lib/services/peerTutorService'
import { ExamService } from '@/lib/services/examService'
import { FacultyService } from '@/lib/services/facultyService'
import { ClassService } from '@/lib/services/classService'
import { useAuth } from '@/lib/auth/AuthContext'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  type: 'page' | 'student' | 'peer-tutor' | 'exam' | 'class' | 'action'
  href: string
  icon: React.ElementType
  category: string
}

export default function FacultyCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const router = useRouter()
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Toggle with Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Verify faculty access to get department
  const { data: department } = useQuery({
    queryKey: ['faculty-department', user?.email],
    queryFn: async () => {
      if (!user?.email) return null
      return await FacultyService.verifyFacultyAccess(user.email)
    },
    enabled: !!user?.email && isOpen,
    staleTime: 10 * 60 * 1000,
  })

  // Fetch Data
  const { data: students } = useQuery({
    queryKey: ['all-students', department?.name],
    queryFn: async () => department?.name ? await StudentService.getStudentsWithpeerTutorByDepartment(department.name) : [],
    enabled: !!department?.name && isOpen,
    staleTime: 5 * 60 * 1000
  })

  const { data: peerTutor } = useQuery({
    queryKey: ['all-peer-tutors', department?.name],
    queryFn: async () => department?.name ? await peertutorservice.getpeerTutorByDepartment(department.name) : [],
    enabled: !!department?.name && isOpen,
    staleTime: 5 * 60 * 1000
  })

  const { data: exams } = useQuery({
    queryKey: ['faculty-exams'],
    queryFn: async () => await ExamService.getAllExams(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000
  })

  const { data: classes } = useQuery({
    queryKey: ['all-classes'],
    queryFn: async () => await ClassService.getAllClasses(),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000
  })

  // Define Static Navigation Pages
  const staticPages: SearchResult[] = [
    { id: 'nav-dashboard', title: 'Dashboard', type: 'page', href: '/faculty/dashboard', icon: LayoutGrid, category: 'Navigation' },
    { id: 'nav-students', title: 'Students', subtitle: 'Manage Students', type: 'page', href: '/faculty/peer-tutor?tab=students', icon: Users, category: 'Navigation' },
    { id: 'nav-peer-tutors', title: 'Peer Tutors', subtitle: 'Manage Peer Tutors', type: 'page', href: '/faculty/peer-tutor?tab=tutors', icon: Users, category: 'Navigation' },
    { id: 'nav-classes', title: 'Classes', subtitle: 'Class Schedules', type: 'page', href: '/faculty/classes', icon: GraduationCap, category: 'Navigation' },
    { id: 'nav-attendance', title: 'Attendance', type: 'page', href: '/faculty/attendance', icon: ClipboardList, category: 'Navigation' },
    { id: 'nav-exams', title: 'Exams', subtitle: 'Manage Exams', type: 'page', href: '/faculty/exams', icon: FileText, category: 'Navigation' },
    { id: 'nav-analytics', title: 'Analytics', type: 'page', href: '/faculty/analytics', icon: BarChart3, category: 'Navigation' },
    { id: 'nav-feedback', title: 'Feedback', type: 'page', href: '/faculty/peer-tutor?tab=feedback', icon: MessageSquare, category: 'Navigation' },
    { id: 'nav-renumeration', title: 'Remuneration', type: 'page', href: '/faculty/peer-tutor?tab=renumeration', icon: CreditCard, category: 'Navigation' },
    { id: 'nav-leaderboard', title: 'Leaderboard', type: 'page', href: '/faculty/peer-tutor?tab=leaderboard', icon: BarChart3, category: 'Navigation' },
  ]

  // Filter and Compute Results
  const filteredResults = useMemo(() => {
    if (!query.trim()) return staticPages

    const lowerQuery = query.toLowerCase()
    const results: SearchResult[] = []

    // 1. Pages
    const matchedPages = staticPages.filter(p => 
      p.title.toLowerCase().includes(lowerQuery) || 
      p.subtitle?.toLowerCase().includes(lowerQuery)
    )
    results.push(...matchedPages)

    // 2. Classes (Sections)
    if (classes) {
      classes.forEach(cls => {
        // Construct searchable string
        const searchStr = `${cls.subject_name} ${cls.dept} ${cls.year} ${cls.section}`.toLowerCase()
        if (searchStr.includes(lowerQuery)) {
          // Map year/section for URL
          const yearMap: Record<string, string> = { '2nd Year': '2', '3rd Year': '3', '4th Year': '4' }
          const sectionMap: Record<string, string> = { 'Section A': 'A', 'Section B': 'B', 'Section C': 'C' }
          const yearId = yearMap[cls.year] || cls.year
          const sectionId = sectionMap[cls.section] || cls.section
          
          results.push({
            id: `cls-${cls.id}`,
            title: cls.subject_name,
            subtitle: `Class • ${cls.dept} • ${cls.year} - ${cls.section}`,
            type: 'class',
            href: `/faculty/department/${cls.dept}/year/${yearId}/section/${sectionId}?tab=classes`,
            icon: GraduationCap,
            category: 'Classes'
          })
        }
      })
    }

    // 3. Peer Tutors
    if (peerTutor) {
      peerTutor.forEach(pt => {
        if (pt.name.toLowerCase().includes(lowerQuery) || pt.email.toLowerCase().includes(lowerQuery)) {
          results.push({
            id: `pt-${pt.id}`,
            title: pt.name,
            subtitle: `Peer Tutor • ${pt.year} - ${pt.section}`,
            type: 'peer-tutor',
            href: `/faculty/peer-tutor/${pt.id}`,
            icon: Users,
            category: 'Peer Tutors'
          })
        }
      })
    }

    // 3. Students
    if (students) {
      students.forEach(s => {
        if (s.name.toLowerCase().includes(lowerQuery) || s.email.toLowerCase().includes(lowerQuery)) {
           // Direct to main page since we don't have separate student details page yet
           // But user asked for "studentts page it should have peer tutor...".
           // Assuming filtering on main page is best we can do for now
           results.push({
             id: `st-${s.id}`,
             title: s.name,
             subtitle: `Student • ${s.year} - ${s.section}`,
             type: 'student',
             href: `/faculty/peer-tutor?tab=students`, // In future: &search=${s.email}
             icon: User,
             category: 'Students'
           })
        }
      })
    }

    // 4. Exams
    if (exams) {
      exams.forEach(ex => {
        if (ex.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            id: `ex-${ex.id}`,
            title: ex.name,
            subtitle: 'Exam',
            type: 'exam',
            href: `/faculty/exams/${ex.id}`,
            icon: FileText,
            category: 'Exams'
          })
        }
      })
    }

    return results.slice(0, 50) // Limit results
  }, [query, staticPages, students, peerTutor, exams, classes])

  // Grouping
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {}
    filteredResults.forEach(r => {
      if (!groups[r.category]) groups[r.category] = []
      groups[r.category].push(r)
    })
    return groups
  }, [filteredResults])

  const handleSelect = (result: SearchResult) => {
    router.push(result.href)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % filteredResults.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex])
      }
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="lg" className="p-0 overflow-hidden">
      <div className="flex flex-col h-[500px]">
        <div className="flex items-center border-b px-4 py-3">
          <Search className="mr-2 h-5 w-5 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {filteredResults.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-500">No results found.</div>
          ) : (
            Object.entries(groupedResults).map(([category, items]) => (
              <div key={category} className="mb-4 last:mb-0">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/50 mb-1 rounded">
                  {category}
                </div>
                {items.map((result, index) => {
                  // Calculate absolute index for selection
                  const absoluteIndex = filteredResults.findIndex(r => r.id === result.id)
                  const isSelected = absoluteIndex === selectedIndex

                  return (
                    <div
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none",
                        isSelected ? "bg-accent bg-gray-100 text-accent-foreground" : "hover:bg-gray-50"
                      )}
                      onMouseEnter={() => setSelectedIndex(absoluteIndex)}
                    >
                      <result.icon className="mr-2 h-4 w-4 text-gray-500" />
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{result.title}</span>
                        {result.subtitle && (
                          <span className="text-xs text-gray-500">{result.subtitle}</span>
                        )}
                      </div>
                      {isSelected && (
                         <ArrowRight className="ml-auto h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
        
        <div className="border-t bg-gray-50 px-4 py-2 text-xs text-gray-500 flex justify-between">
           <span>Use arrows to navigate, Enter to select</span>
           <span><span className="font-bold">ProTip:</span> Search for students, exams or pages</span>
        </div>
      </div>
    </Modal>
  )
}
