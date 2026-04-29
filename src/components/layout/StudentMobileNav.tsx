'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, BookOpen, User } from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/student/dashboard', Icon: LayoutGrid },
  { name: 'Classes', href: '/student/classes', Icon: BookOpen },
  { name: 'Profile', href: '/student/profile', Icon: User },
]

export default function StudentMobileNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#0f291e]/95 backdrop-blur-md border-t border-[#1a3d2e] safe-area-pb">
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map(({ name, href, Icon }) => {
          const isActive = pathname === href || pathname?.startsWith(`${href}/`)
          return (
            <Link
              key={name}
              href={href}
              className="flex flex-col items-center gap-1 px-5 py-2 rounded-2xl transition-all duration-200 relative group"
            >
              {isActive && (
                <span className="absolute inset-0 rounded-2xl bg-white/10" />
              )}
              <Icon
                className={`w-5 h-5 relative z-10 transition-colors ${
                  isActive ? 'text-[#bef264]' : 'text-gray-400 group-hover:text-white'
                }`}
              />
              <span
                className={`text-[9px] font-black uppercase tracking-widest relative z-10 transition-colors ${
                  isActive ? 'text-[#bef264]' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              >
                {name}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
