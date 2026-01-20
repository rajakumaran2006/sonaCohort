'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { motion, Variants } from 'framer-motion'
import { RefreshCw, Home } from 'lucide-react'

export default function AuthCodeError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Loading authentication status...</span>
        </div>
      </div>
  
    }>
      <AuthCodeErrorContent />
    </Suspense>
  )
}

function AuthCodeErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  // Animation variants
  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans relative overflow-hidden">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[70vw] h-[70vw] bg-blue-100/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-[20%] -left-[10%] w-[50vw] h-[50vw] bg-indigo-100/40 rounded-full blur-3xl" />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden">
 
          <div className="p-8 sm:p-12">
            

            {/* Title */}
            <motion.div variants={itemVariants} className="text-center space-y-3 mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight font-roboto-condensed uppercase">
                Authentication Error
              </h1>
              <p className="text-gray-600 text-lg leading-relaxed max-w-sm mx-auto">
                {error || 'We encountered a problem while trying to verify your identity.'}
              </p>
            </motion.div>

            {/* Divider */}
            <motion.div variants={itemVariants} className="w-full h-px bg-gray-100 mb-8" />

            {/* Actions */}
            <div className="space-y-4">
              <motion.div variants={itemVariants}>
                <Link
                  href="/login"
                  className="w-full flex items-center text-white uppercase justify-center gap-2 bg-black hover:bg-black-700 text-white px-8 py-4 rounded-xl"
                >
                  <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                  Try Again
                </Link>
              </motion.div>
              
              <motion.div variants={itemVariants}>
                <Link
                  href="/"
                  className="w-full flex items-center uppercase justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 hover:text-gray-900 px-8 py-4 rounded-xl font-bold text-base border border-gray-200 hover:border-gray-300 transition-all duration-200 active:scale-[0.98]"
                >
                  <Home className="w-5 h-5" />
                  Return to Home
                </Link>
              </motion.div>
            </div>

          </div>
          
          {/* Footer Info */}
          <div className="bg-gray-50/50 p-4 text-center border-t border-gray-100">
             <p className="text-xs text-gray-400 font-medium">
               Error Code: AUTH_FLOW_FAILURE
             </p>
          </div>
        </div>

        {/* Support Link */}
        <motion.div 
            variants={itemVariants}
            className="mt-8 text-center"
        >
            <p className="text-sm text-gray-500">
                Need help? <span className="text-blue-600 hover:text-blue-700 font-bold">CONTACT ADMIN</span>
            </p>
        </motion.div>

      </motion.div>
    </div>
  )
}
