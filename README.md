# Circle K Pro - Proposal Builder

A professional, beautifully designed proposal generation tool for Circle K Pro sales opportunities. Build comprehensive fleet fuel proposals with coverage analysis, product selection, and PDF export.

![Circle K Pro](https://img.shields.io/badge/Circle%20K-Pro-ED8B00?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)

## ✨ Features

### 🎯 Smart Workflow
- **4-Step Process**: Opportunity → Coverage → Configure → Generate
- **Live Preview**: Real-time proposal summary as you build
- **Product Selection**: Fleet Fuel Cards, Universal (WEX), and Digital+
- **Coverage Analysis**: Add service addresses for location-based insights

### 🎨 Beautiful Design
- **Circle K Branding**: Authentic brand colors and typography
- **Smooth Animations**: Polished micro-interactions and transitions
- **Responsive Layout**: Works beautifully on desktop, tablet, and mobile
- **Accessibility**: WCAG AA compliant color contrasts

### 📊 Proposal Sections
- Executive Summary
- About Circle K Pro
- Solution Overview
- Coverage Analysis (with maps)
- Pricing Table
- Implementation Timeline
- Case Studies
- Terms & Conditions
- Signature Page

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ck-proposal-builder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create `.env.local` in the project root:
   ```env
   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📦 Deployment to Vercel

### Method 1: Deploy via Vercel Dashboard (Easiest)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Add Environment Variable**
   - In Project Settings → Environment Variables
   - Add: `NEXT_PUBLIC_MAPBOX_TOKEN`
   - Value: Your Mapbox token
   - Save

4. **Deploy**
   - Click "Deploy"
   - Your app will be live in ~2 minutes!

### Method 2: Deploy via Vercel CLI

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Set Environment Variable**
   ```bash
   vercel env add NEXT_PUBLIC_MAPBOX_TOKEN
   ```

5. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS
- **Fonts**: DM Sans (body), Space Grotesk (headings)
- **Icons**: Lucide React
- **Maps**: Mapbox GL JS
- **PDF Generation**: jsPDF + html2canvas

## 🎨 Brand Guidelines

This project follows Circle K Pro brand guidelines:

### Colors
- **Brand Orange**: `#ED8B00`
- **Dark Orange**: `#D64303` (buttons, CTAs)
- **Off-Black**: `#101820` (text)
- **Off-White**: `#F7F5F2` (backgrounds)

### Typography
- **Headings**: Space Grotesk (distinctive, professional)
- **Body**: DM Sans (clean, readable)
- **Style**: Sentence case for headlines, not ALL CAPS

### Design Principles
- Clean and uncluttered layouts
- Authentic and approachable tone
- Professional but warm
- Generous whitespace
- Subtle animations

## 📂 Project Structure

```
ck-proposal-builder/
├── app/
│   ├── layout.tsx          # Root layout with fonts
│   ├── page.tsx            # Main proposal builder
│   └── globals.css         # Custom styles
├── components/
│   ├── StepIndicator.tsx   # Progress indicator
│   ├── OpportunityStep.tsx # Step 1: Customer & products
│   ├── CoverageStep.tsx    # Step 2: Address analysis
│   ├── ConfigureStep.tsx   # Step 3: Section selection
│   ├── GenerateStep.tsx    # Step 4: PDF generation
│   └── PreviewPanel.tsx    # Live preview sidebar
├── public/                 # Static assets
├── .env.local             # Environment variables
└── package.json           # Dependencies
```

## 🔮 Coming Soon (Phase 2)

- [ ] **Authentication**: User login with Clerk/Supabase
- [ ] **Database**: Save proposals for later
- [ ] **Admin Panel**: Manage templates and content
- [ ] **PDF Generation**: Full implementation with maps
- [ ] **Mapbox Integration**: Live coverage maps
- [ ] **Email Delivery**: Send proposals directly
- [ ] **Analytics**: Track proposal views and conversions

## 🤝 Contributing

This is a private project for Circle K Pro. Contact the project maintainer for access.

## 📄 License

Proprietary - Circle K Pro Internal Use Only

## 🆘 Support

For questions or issues:
- Contact: [Your contact info]
- Documentation: This README
- Circle K Brand Guidelines: easyportal.circlek.com

---

**Built with ❤️ for Circle K Pro**
