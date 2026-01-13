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
            {/* Circle K Pro Logo - Matches brand guidelines */}
            <svg width="160" height="48" viewBox="0 0 160 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g>
                {/* CIRCLE K - Bold, uppercase */}
                <text x="4" y="30" fill="#D64303" fontSize="22" fontWeight="800" fontFamily="Space Grotesk, Arial Black, sans-serif" letterSpacing="0.5">
                  CIRCLE K
                </text>

                {/* "pro" - Italic, lowercase, brand orange */}
                <text x="102" y="33" fill="#ED8B00" fontSize="17" fontWeight="600" fontFamily="Space Grotesk, Arial, sans-serif" fontStyle="italic">
                  pro
                </text>

                {/* TM symbol - Small, superscript */}
                <text x="133" y="20" fill="#D64303" fontSize="8" fontWeight="700">
                  ™
                </text>

                {/* Subtle underline accent */}
                <line x1="4" y1="36" x2="140" y2="36" stroke="#ED8B00" strokeWidth="1.5" opacity="0.3"/>
              </g>
            </svg>
          </div>
        </div>
      </body>
    </html>
  )
}
