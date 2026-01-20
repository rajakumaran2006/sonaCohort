import { Card } from '@/components/ui'
import { Trophy } from 'lucide-react'

interface LeaderboardData {
  id: string
  name: string
  year?: string
  totalScore: number
  rank: number
}

interface LeaderboardProps {
  data: {
    allTutors: LeaderboardData[]
    myRank: number
    myData: LeaderboardData | null
    totalPeers: number
  } | null | undefined
  loading: boolean
  currentUserId?: string
}

export default function PeerLeaderboard({ data, loading, currentUserId }: LeaderboardProps) {
  if (loading) {
    return (
      <Card className="rounded-[2.5rem] border-none bg-white p-6 flex flex-col items-center justify-center shadow-sm">
        <div className="w-6 h-6 border-2 border-gray-100 border-t-gray-900 rounded-full animate-spin mb-3"></div>
        <span className="text-[9px] font-black text-gray-300 uppercase tracking-[0.2em] animate-pulse">Loading...</span>
      </Card>
    )
  }

  const allTutors = data?.allTutors || []
  const myData = data?.myData
  
  // Get top 3
  const top3 = allTutors.slice(0, 3)

  return (
    <Card className="rounded-[2.5rem] border-none bg-white p-6 shadow-sm flex flex-col">
       {/* Header with My Rank */}
       <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-50">
          <div>
             <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Leaderboard</h3>
             <span className="text-xl font-black text-gray-900 uppercase tracking-tight">
               {myData?.year ? `Year ${myData.year}` : 'All Years'}
             </span>
          </div>
          {myData && (
             <div className="text-right">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Your Rank</p>
                <div className="flex items-baseline justify-end gap-1">
                   <span className="text-3xl font-black text-gray-900 tracking-tighter leading-none">
                      #{myData.rank}
                   </span>
                </div>
             </div>
          )}
       </div>

       {/* Top 3 List */}
       <div className="space-y-1">
          {top3.length > 0 ? (
             top3.map((tutor) => (
                <div 
                   key={tutor.id}
                   className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                      tutor.id === currentUserId 
                      ? 'bg-gray-50' 
                      : 'bg-white'
                   }`}
                >
                   <div className="flex items-center gap-4">
                      <span className={`w-4 text-sm font-black ${
                         tutor.rank === 1 ? 'text-gray-900' : 
                         tutor.rank === 2 ? 'text-gray-900' :
                         tutor.rank === 3 ? 'text-gray-900' : 'text-gray-300'
                      }`}>{tutor.rank}</span>
                      <span className="text-xs font-bold text-gray-900 uppercase tracking-tight line-clamp-1">
                         {tutor.name}
                         {tutor.id === currentUserId && <span className="ml-2 text-[8px] text-gray-400 tracking-wider">YOU</span>}
                      </span>
                   </div>
                   <span className="text-xs font-black text-gray-900">{tutor.totalScore.toFixed(0)}</span>
                </div>
             ))
          ) : (
             <div className="flex flex-col items-center justify-center text-center opacity-50 py-4">
                <Trophy className="w-6 h-6 text-gray-200 mb-2" />
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">No rankings</p>
             </div>
          )}
       </div>
    </Card>
  )
}

