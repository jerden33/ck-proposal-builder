import type { Metadata } from 'next'
import Image from 'next/image'
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
            <Image
              src="/circle-k-pro-logo.png"
              alt="Circle K Pro"
              width={160}
              height={48}
              priority
              className="w-40 h-auto"
            />
          </div>
        </div>
      </body>
    </html>
  )
}
