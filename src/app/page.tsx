'use client'

import { useAuth } from '@/lib/auth/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import { logger } from '@/lib/logger'

export default function Home() {
  const { user, loading, session } = useAuth()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('home')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    logger.info('Home page - User:', user)
    logger.info('Home page - Loading:', loading)
    logger.info('Home page - Session:', session)
    
    // Only redirect logged-in users to role detection
    // Do NOT redirect to /login - that causes a loop
    if (user && !loading && user.email) {
      logger.info('User authenticated, redirecting to role detection...')
      // Redirect to a page that will detect roles and redirect appropriately
      router.push('/auth/detect-role')
    }
  }, [user, loading, session, router])

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['home', 'about', 'contact']
      const scrollPosition = window.scrollY + 100

      for (const section of sections) {
        const element = document.getElementById(section)
        if (element) {
          const { offsetTop, offsetHeight } = element
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close mobile menu when scrolling
  useEffect(() => {
    if (isMobileMenuOpen) {
      const handleScroll = () => setIsMobileMenuOpen(false)
      window.addEventListener('scroll', handleScroll)
      return () => window.removeEventListener('scroll', handleScroll)
    }
  }, [isMobileMenuOpen])
  
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (loading) {
    return null
  }

  if (user) {
    return null // Redirect immediately without showing loading screen
  }

  return (
    <div className="min-h-screen bg-white relative">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo - Bold and Uppercase */}
            <div className="flex items-center gap-2">
              <Image 
                src="/peers.png" 
                alt="SONACOHORT Logo" 
                width={32} 
                height={32}
                className="object-contain"
              />
              <span className="text-xl font-black text-gray-900 uppercase tracking-tight">
                SONA<span className="text-[#84cc16]">COHORT</span>
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <button
                onClick={() => scrollToSection('home')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'home' ? 'text-[#1C2434]' : 'text-gray-700 hover:text-[#1C2434]'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => scrollToSection('about')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'about' ? 'text-[#1C2434]' : 'text-gray-700 hover:text-[#1C2434]'
                }`}
              >
                About
              </button>
              <button
                onClick={() => scrollToSection('contact')}
                className={`text-sm font-medium transition-colors ${
                  activeSection === 'contact' ? 'text-[#1C2434]' : 'text-gray-700 hover:text-[#1C2434]'
                }`}
              >
                Contact
              </button>
              <a
                href="/login"
                className="inline-flex items-center justify-center px-6 py-2 bg-[#1C2434] hover:bg-[#0F172A] text-white font-medium rounded-lg transition-colors duration-200 shadow-sm hover:shadow-md"
              >
                Login
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700 hover:text-[#1C2434] hover:bg-gray-100 transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-100">
              <div className="flex flex-col space-y-3">
                <button
                  onClick={() => {
                    scrollToSection('home')
                    setIsMobileMenuOpen(false)
                  }}
                  className={`px-4 py-2 text-left font-medium rounded-md transition-colors ${
                    activeSection === 'home' ? 'bg-gray-100 text-[#1C2434]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => {
                    scrollToSection('about')
                    setIsMobileMenuOpen(false)
                  }}
                  className={`px-4 py-2 text-left font-medium rounded-md transition-colors ${
                    activeSection === 'about' ? 'bg-gray-100 text-[#1C2434]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  About
                </button>
                <button
                  onClick={() => {
                    scrollToSection('contact')
                    setIsMobileMenuOpen(false)
                  }}
                  className={`px-4 py-2 text-left font-medium rounded-md transition-colors ${
                    activeSection === 'contact' ? 'bg-gray-100 text-[#1C2434]' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Contact
                </button>
                <a
                  href="/login"
                  className="mx-4 px-4 py-2 bg-[#1C2434] hover:bg-[#0F172A] text-white font-medium rounded-md transition-colors text-center"
                >
                  Login
                </a>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="pt-24 pb-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[600px]">
            {/* Left Content */}
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight">
                 INTERACT. CONNECT. LEARN.
                </h1>
                <p className="text-lg text-gray-600 max-w-lg">
                  Join a vibrant community of learners and creators. Share your knowledge, 
                  collaborate on projects, and grow your skills in a supportive environment.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-[#1C2434] hover:bg-[#0F172A] text-white font-medium rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
                >
                  Login
                </a>
                <button
                  onClick={() => scrollToSection('about')}
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg transition-colors duration-200"
                >
                  Learn More
                </button>
              </div>
            </div>
            
            {/* Right Illustration */}
            <div className="relative">
              <div className="max-w-md mx-auto">
                <Image 
                  src="/HERO.png" 
                  alt="Students collaborating and learning together" 
                  width={600} 
                  height={600}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Our Community Section */}
      <section id="about" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top Section - Image Left, Content Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            {/* Left Side - Image */}
            <div className="relative order-2 lg:order-1">
              <div className="max-w-md mx-auto rounded-3xl p-8">
                <Image
                  src="/ABOUT.png"
                  alt="Students learning together"
                  width={500}
                  height={350}
                  className="w-full h-auto"
                />
              </div>
            </div>

            {/* Right Side - Content */}
            <div className="space-y-6 lg:pt-0 order-1 lg:order-2">
              <h2 className="text-4xl sm:text-5xl font-bold text-gray-900">
                OUR COMMUNITY
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
              Our community is a vibrant hub for students to connect, learn and grow together. We foster an inclusive environment where everyone feels welcome and supported. We also provide opportunities for skill development, collaborative projects, and regular events that encourage creativity and friendship.
              </p>

              {/* Faculty Mentors */}
              <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">OUR MENTOR</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Mentor 1 */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 text-center hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-full overflow-hidden mx-auto mb-3 border-2 border-gray-200">
                      <Image
                        src="/mentor.png"
                        alt="Ms. P. Kruthika"
                        width={48}
                        height={48}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <h4 className="font-semibold text-gray-900 text-sm">Ms. P. Kruthika</h4>
                    <p className="text-xs text-gray-600">Assistant Professor</p>
                    <p className="text-xs text-[#1C2434] mt-1 font-bold">Information Technology</p>
                  </div>

                </div>
              </div>

              <div className="flex items-center gap-4">
                <a
                  href="/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-[#1C2434] hover:bg-[#0F172A] text-white font-medium rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
                >
                  Login
                </a>
                <button
                  onClick={() => scrollToSection('contact')}
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg transition-colors duration-200"
                >
                  Contact Us
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>


      {/* Get in Touch Section */}
      <section id="contact" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Contact Form */}
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="text-4xl sm:text-5xl font-bold text-gray-900">
              GET IN TOUCH
            </h2>
                <p className="text-gray-600">
                  Have questions, suggestions, or just want to say hello? We&apos;d love to hear from you. 
                  Drop us a line and we&apos;ll get back to you as soon as possible.
            </p>
          </div>

              <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First name
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1C2434] focus:border-transparent bg-gray-50"
                      placeholder=""
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last name
                  </label>
                  <input
                    type="text"
                      id="lastName"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1C2434] focus:border-transparent bg-gray-50"
                      placeholder=""
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1C2434] focus:border-transparent bg-gray-50"
                    placeholder=""
                  />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1C2434] focus:border-transparent bg-gray-50"
                    placeholder=""
                  ></textarea>
                </div>
                <button
                  type="submit"
                  className="w-full bg-[#1C2434] hover:bg-[#0F172A] text-white px-6 py-3.5 rounded-lg font-medium transition-colors duration-200"
                >
                  Send Message
                </button>
              </form>
            </div>

            {/* Google Maps */}
            <div className="relative h-full">
              <div className="w-full h-full min-h-[450px] rounded-2xl overflow-hidden shadow-xl">
                <iframe 
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3907.229526416407!2d78.12186387519256!3d11.678139141914446!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3babf065115b5f7d%3A0x1d08f4d05518b24d!2sSona%20College%20of%20Technology!5e0!3m2!1sen!2sin!4v1760519462198!5m2!1sen!2sin" 
                  width="100%" 
                  height="450" 
                  style={{ border: 0 }}
                  allowFullScreen={true}
                  loading="lazy" 
                  referrerPolicy="no-referrer-when-downgrade"
                  className="w-full h-full"
                  title="Sona College of Technology Location"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            {/* Logo - Bold and Uppercase */}
            <div className="flex items-center gap-2">
              <Image 
                src="/peers.png" 
                alt="SONACOHORT Logo" 
                width={32} 
                height={32}
                className="object-contain"
              />
              <span className="text-xl font-black text-gray-900 uppercase tracking-tight">
                SONA<span className="text-[#84cc16]">COHORT</span>
              </span>
            </div>
            
            <p className="text-sm text-gray-600">
              © 2026 SONACOHORT. All rights reserved.
            </p>
            
            <div className="flex items-center space-x-6">
              <a href="#" className="text-gray-400 hover:text-[#1C2434] transition-colors" aria-label="Twitter">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-[#1C2434] transition-colors" aria-label="GitHub">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-[#1C2434] transition-colors" aria-label="Instagram">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073z" />
                  <path d="M12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zm0 10.162a4 4 0 110-8 4 4 0 010 8zm7.845-10.405a1.44 1.44 0 11-2.88 0 1.44 1.44 0 012.88 0z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
