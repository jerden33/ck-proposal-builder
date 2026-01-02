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
          <svg width="140" height="48" viewBox="0 0 140 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g opacity="0.9">
              {/* CIRCLE K */}
              <text x="6" y="32" fill="#ED8B00" fontSize="26" fontWeight="700" fontFamily="Space Grotesk, sans-serif">
                CIRCLE K
              </text>
              {/* pro */}
              <text x="102" y="36" fill="#ED8B00" fontSize="18" fontWeight="500" fontFamily="Space Grotesk, sans-serif">
                pro
              </text>
              {/* TM */}
              <text x="130" y="24" fill="#ED8B00" fontSize="10" fontWeight="400">
                ™
              </text>
            </g>
          </svg>
        </div>
      </body>
    </html>
  )
}
