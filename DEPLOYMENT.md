# 🚀 Vercel Deployment Guide - Circle K Pro Proposal Builder

## Quick Deploy (5 minutes)

### Step 1: Prepare Your Code

1. **Initialize Git Repository**
   ```bash
   cd ck-proposal-builder
   git init
   git add .
   git commit -m "Initial commit - Circle K Pro Proposal Builder"
   ```

2. **Create GitHub Repository**
   - Go to [github.com/new](https://github.com/new)
   - Name: `ck-proposal-builder`
   - Make it **Private**
   - Don't initialize with README (we have one)
   - Click "Create repository"

3. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/ck-proposal-builder.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. **Go to Vercel**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with GitHub (or create account)

2. **Import Project**
   - Click "Add New..." → "Project"
   - Find `ck-proposal-builder` in your repositories
   - Click "Import"

3. **Configure Project**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave as is)
   - **Build Command**: `npm run build` (auto-filled)
   - **Output Directory**: `.next` (auto-filled)

4. **Add Environment Variable**
   - Click "Environment Variables"
   - Add variable:
     - **Name**: `NEXT_PUBLIC_MAPBOX_TOKEN`
     - **Value**: `pk.eyJ1Ijoiam9yZGFuLWNrcHJvIiwiYSI6ImNtNTh3cHl1MjBpY2cybXF2Yjk0cnhxb3kifQ.XulFv4Oj7uqSbQWuomvyVw`
   - Click "Add"

5. **Deploy**
   - Click "Deploy"
   - Wait 2-3 minutes ⏱️
   - ✅ Your app is live!

### Step 3: Access Your App

Your app will be available at:
```
https://ck-proposal-builder-xxxxx.vercel.app
```

Vercel will give you:
- ✅ Production URL (auto-generated)
- ✅ HTTPS automatically
- ✅ Custom domain support (optional)
- ✅ Auto-deploy on git push

## 🔄 Continuous Deployment

After initial setup, every time you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push
```

Vercel automatically:
1. Detects the push
2. Builds your app
3. Deploys to production
4. Updates your live URL

**That's it!** 🎉

## 🌐 Custom Domain (Optional)

Want `proposals.circlek.com`?

1. Go to your Vercel project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow DNS setup instructions
5. Vercel handles SSL automatically

## 📱 Preview Deployments

Every git branch gets its own preview URL:

```bash
git checkout -b feature-new-design
git push origin feature-new-design
```

Vercel creates: `ck-proposal-builder-git-feature-new-design.vercel.app`

Perfect for testing before merging to main!

## 🛠️ Common Issues

### Build Fails?
```bash
# Test locally first
npm run build

# If it works locally, check Vercel logs
```

### Environment Variable Not Working?
- Make sure it starts with `NEXT_PUBLIC_`
- Redeploy after adding variables
- Check Vercel dashboard → Settings → Environment Variables

### Can't Find Repository?
- Make sure GitHub is connected to Vercel
- Repository might be private (you need proper permissions)
- Try importing from Git URL directly

## 🎯 Next Steps After Deployment

1. **Test Everything**
   - Open your live URL
   - Click through all 4 steps
   - Test on mobile

2. **Share with Team**
   - Send the URL
   - Add team members in Vercel dashboard

3. **Set Up Analytics** (Optional)
   - Vercel Analytics is free
   - Enable in project settings

4. **Custom Domain** (Optional)
   - Add your domain
   - Point DNS to Vercel

## 💡 Pro Tips

- **Preview Branches**: Create feature branches for safe testing
- **Environment Variables**: Use different values for preview vs production
- **Build Logs**: Check them if deployment fails
- **Rollback**: Can rollback to previous deployment instantly

## 🆘 Need Help?

- Vercel Docs: [vercel.com/docs](https://vercel.com/docs)
- Next.js Docs: [nextjs.org/docs](https://nextjs.org/docs)
- Contact: Your project maintainer

---

**Deployment should take < 5 minutes total** ⚡
