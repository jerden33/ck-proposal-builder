import type { Metadata } from 'next'
import { DM_Sans, Space_Grotesk } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ 
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({ 
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Circle K Pro - Proposal Builder',
  description: 'Configure and generate branded proposals for your fleet fuel opportunities',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${spaceGrotesk.variable}`}>
      <body className={dmSans.className}>
        {children}
        
        {/* Circle K Pro Logo - Bottom Right */}
        <div className="fixed bottom-8 right-8 z-50 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-3 shadow-lg border border-gray-100">
            <svg width="160" height="52" viewBox="0 0 160 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g>
                {/* Background accent bar */}
                <rect x="0" y="18" width="160" height="28" rx="4" fill="url(#orangeGradient)" opacity="0.08"/>

                {/* CIRCLE K */}
                <text x="8" y="36" fill="#D64303" fontSize="28" fontWeight="800" fontFamily="Space Grotesk, sans-serif" letterSpacing="0.02em">
                  CIRCLE K
                </text>

                {/* pro */}
                <text x="116" y="40" fill="#ED8B00" fontSize="20" fontWeight="600" fontFamily="Space Grotesk, sans-serif" fontStyle="italic">
                  pro
                </text>

                {/* TM symbol */}
                <text x="148" y="26" fill="#D64303" fontSize="10" fontWeight="600">
                  ™
                </text>

                {/* Gradient definition */}
                <defs>
                  <linearGradient id="orangeGradient" x1="0" y1="0" x2="160" y2="0">
                    <stop offset="0%" stopColor="#ED8B00"/>
                    <stop offset="100%" stopColor="#D64303"/>
                  </linearGradient>
                </defs>
              </g>
            </svg>
          </div>
        </div>
      </body>
    </html>
  )
}
