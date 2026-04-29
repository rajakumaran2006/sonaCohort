'use client'

import React, { useState } from 'react'
import { Card, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button } from '@/components/ui'
import { Trophy, Filter, Download, ChevronRight, Calculator } from 'lucide-react'
import LeaderboardScoringModal from '@/components/forms/modals/LeaderboardScoringModal'

interface LeaderboardTutor {
  rank: number
  odealId: string
  odealName: string
  points: number
  scheduledClassPoints: number
  additionalClassPoints: number
  examPoints: number
  dept: string
  dept_id: string
  year: string
  section: string
}

interface ExamConfig {
  exam_id: string
  exam_name: string
  weight: number
  included: boolean
}

interface LeaderboardScoringConfig {
  department: string
  scheduled_classes_weight: number
  additional_classes_weight: number
  exam_weight: number
  feedback_weight: number
  exam_config: ExamConfig[]
}

interface LeaderboardClientProps {
  leaderboardData: LeaderboardTutor[]
  years: string[]
  sections: string[]
  scoringConfig: LeaderboardScoringConfig
  examNames: Record<string, string>
}

export default function LeaderboardClient({
  leaderboardData,
  years,
  sections,
  scoringConfig,
  examNames: _examNames // Marked as unused per lint warning
}: LeaderboardClientProps) {
  const [selectedYear, setSelectedYear] = useState<string>('all')
  const [selectedSection, setSelectedSection] = useState<string>('all')
  const [isScoringModalOpen, setIsScoringModalOpen] = useState(false)

  const filteredData = leaderboardData.filter(item => {
    const yearMatch = selectedYear === 'all' || item.year === selectedYear
    const sectionMatch = selectedSection === 'all' || item.section === selectedSection
    return yearMatch && sectionMatch
  })

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Leaderboard Analytics</h1>
          <p className="text-xs font-bold text-gray-400 tracking-widest mt-1 uppercase">Monitor and manage peer tutor performance</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="outline" 
            className="rounded-xl border-gray-200 text-[10px] font-black tracking-widest uppercase py-6"
            onClick={() => setIsScoringModalOpen(true)}
          >
            <Calculator className="w-4 h-4 mr-2" />
            Scoring Rules
          </Button>
          
          <Button className="rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-[10px] font-black tracking-widest uppercase py-6">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
             <Filter className="w-3.5 h-3.5 text-gray-400" />
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filters</span>
          </div>
          
          <div className="flex items-center gap-4 flex-1">
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-gray-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-gray-100 transition-all outline-none min-w-[120px]"
            >
              <option value="all">ALL YEARS</option>
              {years.map(year => (
                <option key={year} value={year}>YEAR {year}</option>
              ))}
            </select>

            <select 
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="bg-gray-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold text-gray-900 focus:ring-2 focus:ring-gray-100 transition-all outline-none min-w-[120px]"
            >
              <option value="all">ALL SECTIONS</option>
              {sections.map(section => (
                <option key={section} value={section}>SECTION {section}</option>
              ))}
            </select>
          </div>
        </div>

        <Card className="rounded-[2rem] border-none bg-[#0F172A] p-6 shadow-sm flex items-center justify-between group overflow-hidden relative">
           <div className="relative z-10">
              <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest mb-1">Total Tutors</p>
              <h3 className="text-3xl font-black text-white tracking-tighter">{filteredData.length}</h3>
           </div>
           <Trophy className="w-12 h-12 text-white/5 absolute -right-2 -bottom-2 group-hover:scale-110 transition-transform duration-500" />
        </Card>
      </div>

      {/* Leaderboard Table */}
      <Card className="rounded-[2rem] border-none bg-white shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-100 hover:bg-transparent">
                <TableHead className="text-[10px] font-black text-gray-400 uppercase tracking-widest py-5 pl-8 text-center w-20">Rank</TableHead>
                <TableHead className="text-[10px] font-black text-gray-400 uppercase tracking-widest py-5">Tutor Name</TableHead>
                <TableHead className="text-[10px] font-black text-gray-400 uppercase tracking-widest py-5 text-center">Batch</TableHead>
                <TableHead className="text-[10px] font-black text-gray-400 uppercase tracking-widest py-5 text-right w-32">Total Pts</TableHead>
                <TableHead className="py-5 pr-8 w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((tutor) => (
                <TableRow key={tutor.odealId} className="border-gray-50 group transition-colors hover:bg-gray-50/30">
                  <TableCell className="pl-8 py-5 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-black ${
                      tutor.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                      tutor.rank === 2 ? 'bg-gray-100 text-gray-600' :
                      tutor.rank === 3 ? 'bg-orange-100 text-orange-700' :
                      'text-gray-400'
                    }`}>
                      {tutor.rank}
                    </span>
                  </TableCell>
                  <TableCell className="py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-gray-900 tracking-tight uppercase">{tutor.odealName}</span>
                      <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">{tutor.dept}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-5 text-center">
                    <span className="text-[10px] font-black bg-gray-100 px-3 py-1 rounded-lg text-gray-600">
                      Y{tutor.year}-{tutor.section}
                    </span>
                  </TableCell>
                  <TableCell className="py-5 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-base font-black text-gray-900">{tutor.points}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-5 pr-8 text-right">
                    <button className="p-2 text-gray-300 hover:text-gray-900 hover:bg-white rounded-xl transition-all shadow-none hover:shadow-sm">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <LeaderboardScoringModal 
        isOpen={isScoringModalOpen}
        onClose={() => setIsScoringModalOpen(false)}
        department={leaderboardData[0]?.dept || ''}
        departmentId={leaderboardData[0]?.dept_id || ''}
        currentConfig={scoringConfig}
        onSave={() => {}}
      />
    </div>
  )
}
