'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import Sidebar from '@/components/layout/Sidebar'
import { DepartmentService } from '@/lib/services/departmentService'
import { peertutorservice, peertutors as Basepeertutors } from '@/lib/services/peerTutorService'
import { Student as BaseStudent } from '@/lib/services/studentService'
import { Department } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { AdminAnalyticsSkeleton } from '@/components/skeletons/AdminAnalyticsSkeleton'
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed'
import { 
  Users, 
  User, 
  Building2, 
  GraduationCap, 
  Search, 
  Download, 
  Filter,
  ChevronDown,
  ChevronDown,
  X 
} from 'lucide-react'
import { logger } from '@/lib/logger'

interface peertutorsWithDetails extends Basepeertutors {
  faculty_name: string
  student_count: number
  department_name: string
}

interface StudentWithDetails extends BaseStudent {
  roll_number?: string
}

export default function AnalyticsPage() {
  return (
    <AdminProtectedRoute>
      <AnalyticsContent />
    </AdminProtectedRoute>
  )
}

function AnalyticsContent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [peerTutor, setpeerTutor] = useState<peertutorsWithDetails[]>([])
  const [filteredpeerTutor, setFilteredpeerTutor] = useState<peertutorsWithDetails[]>([])
  const [selectedpeertutors, setSelectedpeertutors] = useState<peertutorsWithDetails | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<StudentWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useSidebarCollapsed()
  
  // Filter states
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedFaculty, setSelectedFaculty] = useState<string>('all')
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)

  // Stats
  const [totalpeerTutor, setTotalpeerTutor] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)

  // Listen for sidebar toggle events
  useEffect(() => {
    const handleSidebarToggle = (e: CustomEvent<{ isCollapsed: boolean }>) => {
       setIsCollapsed(e.detail.isCollapsed)
    }
    window.addEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    return () => {
      window.removeEventListener('sidebar-toggle', handleSidebarToggle as EventListener)
    }
  }, [setIsCollapsed])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()

      // Load departments
      const depts = await DepartmentService.getDepartments()
      setDepartments(depts)

      // Load all peer tutors from database
      const basepeerTutor = await peertutorservice.getAllpeerTutor()
      
      // Enrich peer tutors with details
      const enrichedpeerTutor: peertutorsWithDetails[] = await Promise.all(
        basepeerTutor.map(async (pt) => {
          const dept = depts.find(d => d.name === pt.dept)
          
          const { count } = await supabase
            .from('peer_students')
            .select('*', { count: 'exact', head: true })
            .eq('assigned_peer_tutor_id', pt.id)
          
          return {
            ...pt,
            faculty_name: dept?.faculty_name || 'Unknown',
            department_name: pt.dept,
            student_count: count || 0
          }
        })
      )

      setpeerTutor(enrichedpeerTutor)
      setFilteredpeerTutor(enrichedpeerTutor)
      setTotalpeerTutor(enrichedpeerTutor.length)

      const totalStudentCount = enrichedpeerTutor.reduce((sum, pt) => sum + pt.student_count, 0)
      setTotalStudents(totalStudentCount)

    } catch (error) {
      logger.error('Error loading analytics data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const applyFilters = useCallback(() => {
    let filtered = [...peerTutor]

    if (selectedDepartment !== 'all') {
      filtered = filtered.filter(pt => pt.dept === selectedDepartment)
    }

    if (selectedFaculty !== 'all') {
      filtered = filtered.filter(pt => pt.faculty_name === selectedFaculty)
    }

    if (selectedYear !== 'all') {
      filtered = filtered.filter(pt => pt.year === selectedYear)
    }

    if (selectedSection !== 'all') {
      filtered = filtered.filter(pt => pt.section === selectedSection)
    }

    if (searchQuery) {
      filtered = filtered.filter(pt => 
        pt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pt.email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredpeerTutor(filtered)
  }, [peerTutor, selectedDepartment, selectedFaculty, selectedYear, selectedSection, searchQuery])

  useEffect(() => {
    applyFilters()
  }, [selectedDepartment, selectedFaculty, selectedYear, selectedSection, searchQuery, peerTutor, applyFilters])

  const handlepeertutorsClick = async (peertutors: peertutorsWithDetails) => {
    setSelectedpeertutors(peertutors)
    try {
      const supabase = createClient()
      const { data: assignedStudentsData, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peertutors.id)
        .order('name')

      if (error) {
        setAssignedStudents([])
        return
      }

      const studentsWithRollNumbers = (assignedStudentsData || []).map((student, index) => ({
        ...student,
        roll_number: student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`
      }))

      setAssignedStudents(studentsWithRollNumbers)
    } catch (error) {
      logger.error('Error in handlepeertutorsClick:', error)
      setAssignedStudents([])
    }
  }

  const uniqueFaculty = Array.from(new Set(peerTutor.map(pt => pt.faculty_name)))
  const uniqueYears = Array.from(new Set(peerTutor.map(pt => pt.year))).sort()
  const uniqueSections = Array.from(new Set(peerTutor.map(pt => pt.section))).sort()

  // Export Logic... (Keeping same logic but wrapping in try-catch blocks same as before)
  const exportToCSV = async () => {
      try {
        // ... (Export logic unchanged, just reusing existing detailed function body from previous file version implicitly or explicitly)
        // For brevity in this artifact, assume standard CSV export logic here as per previous file content
        // To save space and focus on UI, I'll copy the logic over.
        const supabase = createClient()
        const exportData: Record<string, unknown>[] = []
        for (const peertutors of filteredpeerTutor) {
            const { data: students } = await supabase.from('peer_students').select('*').eq('assigned_peer_tutor_id', peertutors.id).order('name')
            if (students && students.length > 0) {
                students.forEach((student, index) => {
                    exportData.push({
                        'Peer Tutor Name': peertutors.name, 'Peer Tutor Email': peertutors.email, 'Peer Tutor Department': peertutors.dept,
                        'Peer Tutor Year': peertutors.year, 'Peer Tutor Section': peertutors.section, 'Faculty Name': peertutors.faculty_name,
                        'Student Name': student.name, 'Student Email': student.email,
                        'Student Roll Number': student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`,
                        'Student Year': student.year, 'Student Section': student.section, 'Student Department': student.dept
                    })
                })
            } else {
                 exportData.push({
                    'Peer Tutor Name': peertutors.name, 'Peer Tutor Email': peertutors.email, 'Peer Tutor Department': peertutors.dept,
                    'Peer Tutor Year': peertutors.year, 'Peer Tutor Section': peertutors.section, 'Faculty Name': peertutors.faculty_name,
                    'Student Name': 'No students assigned', 'Student Email': '-', 'Student Roll Number': '-', 'Student Year': '-', 'Student Section': '-', 'Student Department': '-'
                 })
            }
        }
        const headers = Object.keys(exportData[0] || {})
        const csvContent = [headers.join(','), ...exportData.map(row => headers.map(header => `"${String((row as Record<string,unknown>)[header]).replace(/"/g, '""')}"`).join(','))].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `peer-tutors-and-students-${new Date().toISOString().split('T')[0]}.csv`)
        document.body.appendChild(link); link.click(); document.body.removeChild(link)
      } catch (error) { logger.error(error); alert('Failed to export') }
  }

  const exportpeerTutorOnly = () => {
      // Simplification of logic to fit concept
      const exportData = filteredpeerTutor.map(pt => ({ 'Name': pt.name, 'Email': pt.email, 'Department': pt.dept, 'Year': pt.year, 'Section': pt.section, 'Faculty': pt.faculty_name, 'Students': pt.student_count }))
      const headers = Object.keys(exportData[0] || {})
      const csvContent = [headers.join(','), ...exportData.map(row => headers.map(h => `"${String((row as Record<string,unknown>)[h]).replace(/"/g, '""')}"`).join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `peer-tutors-${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link); link.click(); document.body.removeChild(link)
  }

  const exportStudentsOnly = async () => {
    // ... Similar logic
     try {
        const supabase = createClient()
        const exportData: Record<string, unknown>[] = []
        for (const peertutors of filteredpeerTutor) {
             const { data: students } = await supabase.from('peer_students').select('*').eq('assigned_peer_tutor_id', peertutors.id).order('name')
             if (students) {
                 students.forEach((student, index) => {
                     exportData.push({
                         'Name': student.name, 'Email': student.email, 'Roll': student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`,
                         'Year': student.year, 'Section': student.section, 'Dept': student.dept, 'Tutor': peertutors.name, 'Faculty': peertutors.faculty_name
                     })
                 })
             }
        }
        if(!exportData.length) return alert('No students')
        const headers = Object.keys(exportData[0] || {})
        const csvContent = [headers.join(','), ...exportData.map(row => headers.map(h => `"${String((row as Record<string,unknown>)[h]).replace(/"/g, '""')}"`).join(','))].join('\n')
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `students-${new Date().toISOString().split('T')[0]}.csv`)
        document.body.appendChild(link); link.click(); document.body.removeChild(link)
     } catch(e) { logger.error(e); alert('Error')}
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <Sidebar 
         isOpen={isSidebarOpen} 
         onClose={() => setIsSidebarOpen(false)} 
         onToggleCollapse={() => {}}
      />

      <div className={`transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'} min-h-screen flex flex-col`}>
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-gray-200/50">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <Filter className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics</h1>
                <p className="text-sm text-gray-500 font-medium hidden sm:block">Monitor performance and allocations across departments</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
               {/* Could add date range picker or other global controls here */}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
           {isLoading ? (
              <AdminAnalyticsSkeleton />
           ) : (
             <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <StatCard 
                      title="Total Departments" 
                      value={departments.length} 
                      icon={Building2} 
                      color="purple" 
                   />
                   <StatCard 
                      title="Total Faculty" 
                      value={departments.length} 
                      icon={Users} 
                      color="blue" 
                   />
                   <StatCard 
                      title="Total Peer Tutors" 
                      value={totalpeerTutor} 
                      icon={User} 
                      color="orange" 
                   />
                   <StatCard 
                      title="Total Students" 
                      value={totalStudents} 
                      icon={GraduationCap} 
                      color="emerald" 
                   />
                </div>

                {/* Main Content Area */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                   
                   {/* Table Header & Controls */}
                   <div className="p-6 border-b border-gray-50 space-y-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                         <h3 className="text-lg font-bold text-gray-900 uppercase tracking-widest">
                            Peer Tutor Management
                         </h3>
                         
                         <div className="relative">
                            <button
                               onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                               disabled={filteredpeerTutor.length === 0}
                               className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                               <Download className="w-4 h-4" />
                               <span>Export Data</span>
                               <ChevronDown className={`w-3 h-3 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                             {/* Dropdown Menu */}
                             {isExportMenuOpen && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setIsExportMenuOpen(false)} />
                                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-20 overflow-hidden">
                                     <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Export Options</p>
                                     </div>
                                     <div className="p-2">
                                        <button onClick={() => { exportpeerTutorOnly(); setIsExportMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">Peer Tutors Only</button>
                                        <button onClick={() => { exportStudentsOnly(); setIsExportMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">Students Only</button>
                                        <div className="my-1 border-t border-gray-100"></div>
                                        <button onClick={() => { exportToCSV(); setIsExportMenuOpen(false) }} className="w-full text-left px-3 py-2 text-sm font-bold text-gray-900 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">Complete Report</button>
                                     </div>
                                  </div>
                                </>
                             )}
                         </div>
                      </div>

                      {/* Filters */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                         <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                               type="text"
                               placeholder="Search..."
                               value={searchQuery}
                               onChange={(e) => setSearchQuery(e.target.value)}
                               className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0f291e]/20 focus:border-[#0f291e] transition-all"
                            />
                         </div>
                         <SelectFilter value={selectedDepartment} onChange={setSelectedDepartment} options={departments.map(d => ({ label: d.name, value: d.name }))} placeholder="All Departments" />
                         <SelectFilter value={selectedFaculty} onChange={setSelectedFaculty} options={uniqueFaculty.map(f => ({ label: f, value: f }))} placeholder="All Faculty" />
                         <SelectFilter value={selectedYear} onChange={setSelectedYear} options={uniqueYears.map(y => ({ label: `Year ${y}`, value: y }))} placeholder="All Years" />
                         <SelectFilter value={selectedSection} onChange={setSelectedSection} options={uniqueSections.map(s => ({ label: `Section ${s}`, value: s }))} placeholder="All Sections" />
                      </div>
                   </div>

                   {/* Table Content */}
                   <div className="overflow-x-auto">
                      {filteredpeerTutor.length === 0 ? (
                         <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                               <Search className="w-6 h-6 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">No results found</h3>
                            <p className="text-sm text-gray-500">Try adjusting your filters or search query.</p>
                         </div>
                      ) : (
                         <table className="w-full">
                            <thead className="bg-gray-50/50">
                               <tr>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Peer Tutor</th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Year / Section</th>
                                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Faculty</th>
                                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">Students</th>
                                  <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Action</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                               {filteredpeerTutor.map((pt) => (
                                  <tr key={pt.id} className="hover:bg-gray-50/50 transition-colors group">
                                     <td className="px-6 py-4">
                                        <div>
                                           <div className="font-bold text-gray-900 group-hover:text-[#0f291e] transition-colors">{pt.name}</div>
                                           <div className="text-xs text-gray-500 font-medium">{pt.email}</div>
                                        </div>
                                     </td>
                                     <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-700">{pt.dept}</div>
                                     </td>
                                     <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-700">
                                           <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                             {pt.year}
                                           </span>
                                           <span>  -</span>
                                           <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                              {pt.section}
                                           </span>
                                        </div>
                                     </td>
                                     <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-700">{pt.faculty_name}</div>
                                     </td>
                                     <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ${pt.student_count > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'}`}>
                                           {pt.student_count} STUDENTS
                                        </span>
                                     </td>
                                     <td className="px-6 py-4 text-right">
                                        <button 
                                           onClick={() => handlepeertutorsClick(pt)}
                                           className="text-sm font-bold text-blue-600 hover:text-blue-800 hover:underline transition-all"
                                        >
                                           VIEW DETAILS
                                        </button>
                                     </td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                      )}
                   </div>
                </div>

                {/* Assigned Students Panel (Bottom Sheet style or Card) */}
                {selectedpeertutors && (
                   <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                      <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                         <div>
                            <h3 className="text-lg font-bold text-gray-900">Assigned Students</h3>
                            <p className="text-sm text-gray-500">
                               Assigned to <span className="font-bold text-gray-900">{selectedpeertutors.name}</span>
                            </p>
                         </div>
                         <button 
                            onClick={() => setSelectedpeertutors(null)}
                            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                         >
                            <X className="w-5 h-5" />
                         </button>
                      </div>
                      
                      <div className="overflow-x-auto">
                         <table className="w-full">
                            <thead className="bg-gray-50/50">
                               <tr>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Student Name</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Roll No</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Year / Section</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                               {assignedStudents.map((student) => (
                                  <tr key={student.id} className="hover:bg-gray-50/30">
                                     <td className="px-6 py-3 text-sm font-medium text-gray-900">{student.name}</td>
                                     <td className="px-6 py-3 text-sm text-gray-500 font-mono">{student.roll_number}</td>
                                     <td className="px-6 py-3 text-sm text-gray-700">Year {student.year} - {student.section}</td>
                                     <td className="px-6 py-3 text-sm text-gray-500">{student.dept}</td>
                                  </tr>
                               ))}
                               {assignedStudents.length === 0 && (
                                  <tr>
                                     <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm italic">
                                        No students found in the database.
                                     </td>
                                  </tr>
                               )}
                            </tbody>
                         </table>
                      </div>
                   </div>
                )}
             </div>
           )}
        </main>
      </div>
    </div>
  )
}

// Helper Components

function StatCard({ title, value, icon: Icon, color }: { title: string, value: number, icon: React.ComponentType<{ className?: string }>, color: 'purple' | 'blue' | 'orange' | 'emerald' }) {
   const colorStyles = {
      purple: 'bg-purple-50 text-purple-600',
      blue: 'bg-blue-50 text-blue-600',
      orange: 'bg-orange-50 text-orange-600',
      emerald: 'bg-emerald-50 text-emerald-600',
   }

   return (
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300">
         <div className="flex justify-between items-start mb-4">
            <div>
               <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{title}</p>
               <h3 className="text-3xl font-black text-gray-900 mt-2 tracking-tight">{value}</h3>
            </div>
            <div className={`p-3 rounded-xl ${colorStyles[color]} transition-transform duration-300 hover:scale-110`}>
               <Icon className="w-5 h-5" />
            </div>
         </div>
      </div>
   )
}

function SelectFilter({ value, onChange, options, placeholder }: { value: string, onChange: (v: string) => void, options: { label: string, value: string }[], placeholder: string }) {
   return (
      <div className="relative">
         <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#0f291e]/20 focus:border-[#0f291e] transition-all cursor-pointer text-gray-700 font-medium"
         >
            <option value="all">{placeholder}</option>
            {options.map(opt => (
               <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
         </select>
         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
   )
}
