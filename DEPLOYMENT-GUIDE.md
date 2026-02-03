# Divot Lab - Vercel Deployment Guide

## Quick Start (No Git Required)

### Option 1: Drag & Drop Deploy (Easiest - 5 minutes)

1. **Go to Vercel**: https://vercel.com
2. **Sign in** with your GitHub account
3. **Click "Add New" → "Project"**
4. **Drag the entire `divotlab-deploy` folder** into the upload area
5. **Click "Deploy"**
6. **Done!** Your site will be live at `yourproject.vercel.app`

### Option 2: GitHub Deploy (Recommended - 15 minutes)

#### Step 1: Push to GitHub

```bash
cd divotlab-deploy
git init
git add .
git commit -m "Initial Divot Lab site"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/divotlab.git
git push -u origin main
```

#### Step 2: Deploy on Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your `divotlab` repo
4. Click "Deploy"
5. Wait 30-60 seconds
6. Your site is live!

## Custom Domain Setup (divotlab.com)

### In Vercel:

1. Go to your project dashboard
2. Click "Settings" → "Domains"
3. Add domain: `divotlab.com`
4. Add domain: `www.divotlab.com`
5. Vercel will show you DNS records to add

### In GoDaddy:

1. Log into GoDaddy
2. Go to "My Products" → "DNS" for divotlab.com
3. **Add A Record:**
   - Type: `A`
   - Name: `@`
   - Value: `76.76.21.21` (Vercel's IP)
   - TTL: 600

4. **Add CNAME Record:**
   - Type: `CNAME`
   - Name: `www`
   - Value: `cname.vercel-dns.com`
   - TTL: 600

5. **Save changes**
6. Wait 10-60 minutes for DNS propagation

### Verify:

- Visit https://divotlab.com
- Visit https://www.divotlab.com
- Both should show your site!

## Troubleshooting

**Site not updating?**
- Push changes to GitHub
- Vercel auto-deploys on every push

**Custom domain not working?**
- DNS can take up to 24 hours (usually 10-30 mins)
- Check Vercel dashboard for domain status
- Verify DNS records in GoDaddy match Vercel's requirements

**Need to update content?**
- Edit HTML files locally
- Push to GitHub (if using Git)
- OR drag-drop new folder to Vercel (if not using Git)

## What's Connected:

- ✅ Shop links → https://divotlab.printful.me/
- ✅ Favicon → C2 logo
- ✅ 3 blog posts ready
- ✅ Homepage with all sections

## Next Steps After Launch:

1. Order merch samples
2. Test checkout flow on Printful store
3. Share divotlab.com on social media
4. Start writing more blog posts
5. Set up Google Analytics (optional)

---

Questions? Issues? Let me know!
