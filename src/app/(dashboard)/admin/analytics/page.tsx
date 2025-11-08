'use client'

import { useState, useEffect } from 'react'
import AdminProtectedRoute from '@/components/auth/AdminProtectedRoute'
import Sidebar from '@/components/layout/Sidebar'
import { useAuth } from '@/lib/auth/AuthContext'
import { DepartmentService } from '@/lib/services/departmentService'
import { PeerTutorService, PeerTutor as BasePeerTutor } from '@/lib/services/peerTutorService'
import { StudentService, Student as BaseStudent } from '@/lib/services/studentService'
import { Department } from '@/lib/types'
import { createClient } from '@/utils/supabase/client'

interface PeerTutorWithDetails extends BasePeerTutor {
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
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [departments, setDepartments] = useState<Department[]>([])
  const [peerTutors, setPeerTutors] = useState<PeerTutorWithDetails[]>([])
  const [filteredPeerTutors, setFilteredPeerTutors] = useState<PeerTutorWithDetails[]>([])
  const [students, setStudents] = useState<StudentWithDetails[]>([])
  const [selectedPeerTutor, setSelectedPeerTutor] = useState<PeerTutorWithDetails | null>(null)
  const [assignedStudents, setAssignedStudents] = useState<StudentWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Filter states
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all')
  const [selectedFaculty, setSelectedFaculty] = useState<string>('all')
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)

  // Stats
  const [totalPeerTutors, setTotalPeerTutors] = useState(0)
  const [totalStudents, setTotalStudents] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [selectedDepartment, selectedFaculty, selectedYear, selectedSection, searchQuery, peerTutors])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()

      // Load departments
      const depts = await DepartmentService.getDepartments()
      setDepartments(depts)

      // Load all peer tutors from database
      const basePeerTutors = await PeerTutorService.getAllPeerTutors()
      
      // Enrich peer tutors with faculty names and student counts
      const enrichedPeerTutors: PeerTutorWithDetails[] = await Promise.all(
        basePeerTutors.map(async (pt) => {
          // Get faculty name from department
          const dept = depts.find(d => d.name === pt.dept)
          
          // Count students assigned to this peer tutor
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

      setPeerTutors(enrichedPeerTutors)
      setFilteredPeerTutors(enrichedPeerTutors)
      setTotalPeerTutors(enrichedPeerTutors.length)

      // Calculate total students across all peer tutors
      const totalStudentCount = enrichedPeerTutors.reduce((sum, pt) => sum + pt.student_count, 0)
      setTotalStudents(totalStudentCount)

      // Load all students
      const allStudents = await StudentService.getAllStudents()
      setStudents(allStudents)

    } catch (error) {
      console.error('Error loading analytics data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...peerTutors]

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

    setFilteredPeerTutors(filtered)
  }

  const handlePeerTutorClick = async (peerTutor: PeerTutorWithDetails) => {
    setSelectedPeerTutor(peerTutor)
    
    // Fetch actual assigned students from database
    try {
      const supabase = createClient()
      const { data: assignedStudentsData, error } = await supabase
        .from('peer_students')
        .select('*')
        .eq('assigned_peer_tutor_id', peerTutor.id)
        .order('name')

      if (error) {
        console.error('Error fetching assigned students:', error)
        setAssignedStudents([])
        return
      }

      // Add roll_number if not present (generate from year, section, and index)
      const studentsWithRollNumbers = (assignedStudentsData || []).map((student, index) => ({
        ...student,
        roll_number: student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`
      }))

      setAssignedStudents(studentsWithRollNumbers)
    } catch (error) {
      console.error('Error in handlePeerTutorClick:', error)
      setAssignedStudents([])
    }
  }

  const uniqueFaculty = Array.from(new Set(peerTutors.map(pt => pt.faculty_name)))
  const uniqueYears = Array.from(new Set(peerTutors.map(pt => pt.year))).sort()
  const uniqueSections = Array.from(new Set(peerTutors.map(pt => pt.section))).sort()

  // Export functions
  const exportToCSV = async () => {
    try {
      const supabase = createClient()
      
      // Prepare data for export
      const exportData = []
      
      for (const peerTutor of filteredPeerTutors) {
        // Get assigned students for this peer tutor
        const { data: students } = await supabase
          .from('peer_students')
          .select('*')
          .eq('assigned_peer_tutor_id', peerTutor.id)
          .order('name')

        if (students && students.length > 0) {
          // Add each student as a row with peer tutor info
          students.forEach((student, index) => {
            exportData.push({
              'Peer Tutor Name': peerTutor.name,
              'Peer Tutor Email': peerTutor.email,
              'Peer Tutor Department': peerTutor.dept,
              'Peer Tutor Year': peerTutor.year,
              'Peer Tutor Section': peerTutor.section,
              'Faculty Name': peerTutor.faculty_name,
              'Student Name': student.name,
              'Student Email': student.email,
              'Student Roll Number': student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`,
              'Student Year': student.year,
              'Student Section': student.section,
              'Student Department': student.dept
            })
          })
        } else {
          // Add peer tutor row even if no students assigned
          exportData.push({
            'Peer Tutor Name': peerTutor.name,
            'Peer Tutor Email': peerTutor.email,
            'Peer Tutor Department': peerTutor.dept,
            'Peer Tutor Year': peerTutor.year,
            'Peer Tutor Section': peerTutor.section,
            'Faculty Name': peerTutor.faculty_name,
            'Student Name': 'No students assigned',
            'Student Email': '-',
            'Student Roll Number': '-',
            'Student Year': '-',
            'Student Section': '-',
            'Student Department': '-'
          })
        }
      }

      // Convert to CSV
      const headers = Object.keys(exportData[0] || {})
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header]
            // Escape commas and quotes
            return `"${String(value).replace(/"/g, '""')}"`
          }).join(',')
        )
      ].join('\n')

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `peer-tutors-and-students-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting to CSV:', error)
      alert('Failed to export data. Please try again.')
    }
  }

  const exportPeerTutorsOnly = () => {
    try {
      // Export only peer tutors
      const exportData = filteredPeerTutors.map(pt => ({
        'Name': pt.name,
        'Email': pt.email,
        'Department': pt.dept,
        'Year': pt.year,
        'Section': pt.section,
        'Faculty Name': pt.faculty_name,
        'Students Assigned': pt.student_count
      }))

      // Convert to CSV
      const headers = Object.keys(exportData[0] || {})
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header]
            return `"${String(value).replace(/"/g, '""')}"`
          }).join(',')
        )
      ].join('\n')

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `peer-tutors-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting peer tutors:', error)
      alert('Failed to export data. Please try again.')
    }
  }

  const exportStudentsOnly = async () => {
    try {
      const supabase = createClient()
      
      // Prepare data for export
      const exportData = []
      
      for (const peerTutor of filteredPeerTutors) {
        // Get assigned students for this peer tutor
        const { data: students } = await supabase
          .from('peer_students')
          .select('*')
          .eq('assigned_peer_tutor_id', peerTutor.id)
          .order('name')

        if (students && students.length > 0) {
          // Add each student with basic peer tutor reference
          students.forEach((student, index) => {
            exportData.push({
              'Student Name': student.name,
              'Student Email': student.email,
              'Roll Number': student.roll_number || `${student.year}${student.section}${String(index + 1).padStart(3, '0')}`,
              'Year': student.year,
              'Section': student.section,
              'Department': student.dept,
              'Assigned Peer Tutor': peerTutor.name,
              'Peer Tutor Email': peerTutor.email,
              'Faculty Name': peerTutor.faculty_name
            })
          })
        }
      }
      
      if (exportData.length === 0) {
        alert('No students found to export.')
        return
      }

      // Convert to CSV
      const headers = Object.keys(exportData[0] || {})
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header]
            return `"${String(value).replace(/"/g, '""')}"`
          }).join(',')
        )
      ].join('\n')

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `students-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error exporting students:', error)
      alert('Failed to export data. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 lg:ml-64 overflow-y-auto">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-2xl font-semibold text-gray-900 ml-2 lg:ml-0">Analytics</h1>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Overview Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {/* Total Departments */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Departments</p>
                    <p className="text-3xl font-bold mt-2 text-gray-900">{departments.length}</p>
                  </div>
                  <div className="bg-gray-100 rounded-full p-3">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Total Faculty */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Faculty</p>
                    <p className="text-3xl font-bold mt-2 text-gray-900">{departments.length}</p>
                  </div>
                  <div className="bg-gray-100 rounded-full p-3">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Total Peer Tutors */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Peer Tutors</p>
                    <p className="text-3xl font-bold mt-2 text-gray-900">{totalPeerTutors}</p>
                  </div>
                  <div className="bg-gray-100 rounded-full p-3">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Total Students */}
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-xs font-medium uppercase tracking-wide">Total Students</p>
                    <p className="text-3xl font-bold mt-2 text-gray-900">{totalStudents}</p>
                  </div>
                  <div className="bg-gray-100 rounded-full p-3">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Peer Tutors Section */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Peer Tutor Management</h3>
                  
                  {/* Export Dropdown Button */}
                  <div className="relative">
                    <button
                      onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                      disabled={filteredPeerTutors.length === 0}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export Data
                      <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {isExportMenuOpen && (
                      <>
                        {/* Backdrop to close dropdown when clicking outside */}
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsExportMenuOpen(false)}
                        />
                        
                        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                          <div className="py-2">
                            {/* Header */}
                            <div className="px-4 py-2 border-b border-gray-200">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Export Options</p>
                            </div>

                            {/* Export Peer Tutors Only */}
                            <button
                              onClick={() => {
                                exportPeerTutorsOnly()
                                setIsExportMenuOpen(false)
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start"
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-gray-900">Peer Tutors Only</p>
                                <p className="text-xs text-gray-500 mt-0.5">Export peer tutor details with student counts</p>
                              </div>
                            </button>

                            {/* Export Students Only */}
                            <button
                              onClick={() => {
                                exportStudentsOnly()
                                setIsExportMenuOpen(false)
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start"
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-gray-900">Students Only</p>
                                <p className="text-xs text-gray-500 mt-0.5">Export all assigned students with their details</p>
                              </div>
                            </button>

                            {/* Export Both (Comprehensive) */}
                            <button
                              onClick={() => {
                                exportToCSV()
                                setIsExportMenuOpen(false)
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors flex items-start border-t border-gray-200"
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-gray-900">Complete Report</p>
                                <p className="text-xs text-gray-500 mt-0.5">Export peer tutors with all assigned students</p>
                                <span className="inline-block mt-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">Recommended</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Search */}
                  <div>
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Department Filter */}
                  <div>
                    <select
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Departments</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.name}>{dept.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Faculty Filter */}
                  <div>
                    <select
                      value={selectedFaculty}
                      onChange={(e) => setSelectedFaculty(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Faculty</option>
                      {uniqueFaculty.map(faculty => (
                        <option key={faculty} value={faculty}>{faculty}</option>
                      ))}
                    </select>
                  </div>

                  {/* Year Filter */}
                  <div>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Years</option>
                      {uniqueYears.map(year => (
                        <option key={year} value={year}>Year {year}</option>
                      ))}
                    </select>
                  </div>

                  {/* Section Filter */}
                  <div>
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Sections</option>
                      {uniqueSections.map(section => (
                        <option key={section} value={section}>Section {section}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Peer Tutors Table */}
              <div className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : filteredPeerTutors.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No peer tutors found matching your filters.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Peer Tutor
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Department
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Faculty
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Students
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredPeerTutors.map((peerTutor) => (
                          <tr key={peerTutor.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{peerTutor.name}</div>
                                <div className="text-sm text-gray-500">{peerTutor.email}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{peerTutor.dept}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">Year {peerTutor.year}, Section {peerTutor.section}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{peerTutor.faculty_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                {peerTutor.student_count} Students
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <button
                                onClick={() => handlePeerTutorClick(peerTutor)}
                                className="text-blue-600 hover:text-blue-900 transition-colors duration-200"
                              >
                                View Students
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Assigned Students Section */}
            {selectedPeerTutor && (
              <div className="mt-6 bg-white rounded-lg shadow border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Students Assigned to {selectedPeerTutor.name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {selectedPeerTutor.dept} • Year {selectedPeerTutor.year}, Section {selectedPeerTutor.section}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedPeerTutor(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Student Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Roll Number
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Year & Section
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Department
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {assignedStudents.map((student) => (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{student.roll_number}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">Year {student.year}, Section {student.section}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-500">{student.dept}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

