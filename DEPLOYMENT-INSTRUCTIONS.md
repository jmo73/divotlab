# Deployment Instructions - V4 Final

## CRITICAL: Vercel Configuration

A `vercel.json` file has been added to enable clean URLs (no .html extensions).

**This file MUST be deployed to Vercel for The Lab page to work.**

## Deployment Steps

### 1. Download & Extract
- Download `divotlab-v4-complete.zip`
- Extract all files

### 2. Important: Check Your Files
You should have:
- vercel.json (CRITICAL - this fixes the 404 error)
- All .html files
- All image files (.jpg for blogs, .webp for products)

### 3. GitHub Desktop
- Copy ALL files (including vercel.json) to your local divotlab folder
- Commit: "V4 update - The Lab page, clean URLs, all fixes"
- Push to GitHub

### 4. Vercel Auto-Deploy
- Vercel will automatically detect the push
- It will read vercel.json and configure clean URLs
- Site will be live in ~30 seconds

### 5. Test The Lab Page
After deployment, visit:
- https://divotlab.com/the-lab

If you get a 404, the vercel.json file may not have been deployed. Check:
1. Is vercel.json in your GitHub repo?
2. Did Vercel rebuild after the push?
3. Try a hard refresh (Cmd+Shift+R or Ctrl+Shift+F5)

## What vercel.json Does

```json
{
  "cleanUrls": true,
  "trailingSlash": false
}
```

This tells Vercel:
- /the-lab → serve the-lab.html
- /articles → serve articles.html
- /about → serve about.html
- etc.

Without this file, Vercel returns 404 for clean URLs.

## Product Images Note

The product images are now the ORIGINAL .webp files from Printful with:
- No background modifications
- No cropping
- No format conversions
- Exactly as you uploaded them

They should look perfect now.

## All Working URLs

After deployment, these should all work:
- https://divotlab.com/
- https://divotlab.com/articles
- https://divotlab.com/about
- https://divotlab.com/the-lab ⭐ NEW
- https://divotlab.com/scheffler-putting-analysis
- https://divotlab.com/strokes-gained-approach
- https://divotlab.com/driver-upgrade-myth

## Troubleshooting

**If The Lab page shows 404:**
1. Verify vercel.json is in your GitHub repo (check on github.com)
2. Go to Vercel dashboard → Your project → Deployments
3. Click on the latest deployment
4. Look for vercel.json in the file list
5. If missing, re-commit and push

**If product images look bad:**
- Check that ribbed-tee.webp, ua-tee.webp, ua-hat.webp are uploaded
- These are the original Printful mockups with no modifications

## Success Criteria

✅ Home page loads
✅ Articles page loads (/articles)
✅ About page loads (/about)
✅ The Lab page loads (/the-lab) ← Key test
✅ Blog posts load (clean URLs)
✅ Product images look clean (original mockups)
✅ Nav "The Lab" button works
