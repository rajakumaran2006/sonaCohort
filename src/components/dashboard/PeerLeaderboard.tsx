import { Card, LoadingSpinner } from '@/components/ui'

interface LeaderboardProps {
  data: {
    topThree: {
      id: string
      name: string
      score: number
      total: number
    }[]
    myRank: number
    myStats: {
      id: string
      name: string
      score: number
      total: number
    } | null
    totalPeers: number
  } | null | undefined
  loading: boolean
  currentUserId?: string
}

export default function PeerLeaderboard({ data, loading, currentUserId }: LeaderboardProps) {
  if (loading) {
    return (
      <Card className="rounded-2xl border-2 border-[#0f291e] bg-white p-8 min-h-[400px] flex items-center justify-center">
        <LoadingSpinner size="sm" className="mr-2" />
        <span className="text-sm font-bold text-[#0f291e]">Loading...</span>
      </Card>
    )
  }

  if (!data || data.topThree.length === 0) {
    return (
       <Card className="rounded-2xl border-2 border-[#0f291e] bg-white p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
          <p className="text-lg font-bold text-[#0f291e] mb-2">No Data</p>
          <p className="text-sm text-gray-600 max-w-[250px]">Leaderboard will appear once classes are completed.</p>
       </Card>
    )
  }

  // Sort top three by ascending score
  const sortedTopThree = [...data.topThree].sort((a, b) => a.score - b.score)
  
  // Check if user is in top 3
  const isUserInTopThree = data.myRank <= 3

  return (
    <Card className="rounded-2xl border-2 border-[#0f291e] bg-white p-0 flex flex-col overflow-hidden">
       {/* Header Section */}
       <div className="bg-[#0f291e] px-6 py-5 flex items-center justify-between">
           <h4 className="text-lg font-bold text-white uppercase tracking-wider">LEADERBOARD</h4>
           <div className="px-4 py-1.5 bg-white text-[#0f291e] rounded-full text-sm font-bold">TOP 3</div>
       </div>

       {/* Leaderboard Table Content */}
       <div className="bg-white">
          {/* Table Header */}
          <div className="flex items-center px-6 py-3 border-b-2 border-[#0f291e] bg-[#0f291e]/5">
             <div className="w-12 text-center">
                <span className="text-xs font-bold text-[#0f291e] uppercase tracking-wider">#</span>
             </div>
             <div className="flex-1">
                <span className="text-xs font-bold text-[#0f291e] uppercase tracking-wider">Name</span>
             </div>
             <div className="w-20 text-right">
                <span className="text-xs font-bold text-[#0f291e] uppercase tracking-wider">Score</span>
             </div>
          </div>

          {/* Table Rows */}
          {sortedTopThree.map((tutor, index) => {
             const isMe = tutor.id === currentUserId
             const displayRank = index + 1

             return (
                <div 
                  key={tutor.id} 
                  className={`flex items-center px-6 py-4 border-b border-[#0f291e]/20 last:border-b-0 ${isMe ? 'bg-[#0f291e]/10' : 'bg-white'}`}
                >
                   {/* Rank Number */}
                   <div className="w-12 text-center">
                     <span className="text-lg font-bold text-[#0f291e]">{displayRank}</span>
                   </div>

                   {/* Name */}
                   <div className="flex-1 min-w-0">
                      <p className="text-base font-bold uppercase truncate text-[#0f291e]">
                         {tutor.name}
                      </p>
                   </div>

                   {/* Score */}
                   <div className="w-20 text-right">
                      <span className="text-base font-bold text-[#0f291e]">
                        {tutor.score.toFixed(1)}/10
                      </span>
                   </div>
                </div>
             )
          })}
       </div>

       {/* User's Position (Only show if user is NOT in top 3) */}
       {data.myStats && !isUserInTopThree && (
          <div className="border-t-2 border-[#0f291e] bg-[#0f291e]/10">
             <div className="flex items-center px-6 py-4">
                {/* Rank Number */}
                <div className="w-12 text-center">
                  <span className="text-lg font-bold text-[#0f291e]">{data.myRank}</span>
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                   <p className="text-base font-bold uppercase truncate text-[#0f291e]">
                      {data.myStats.name} <span className="text-xs font-medium text-[#0f291e]/70 ml-2">(You)</span>
                   </p>
                </div>

                {/* Score */}
                <div className="w-20 text-right">
                   <span className="text-base font-bold text-[#0f291e]">
                     {data.myStats.score.toFixed(1)}/10
                   </span>
                </div>
             </div>
          </div>
       )}
    </Card>
  )
}
