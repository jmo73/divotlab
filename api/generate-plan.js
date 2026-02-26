/**
 * DIVOT LAB — /api/generate-plan
 * Vercel Serverless Function
 * 
 * Accepts POST with intake form data, populates HTML template,
 * renders to PDF via Puppeteer, returns PDF buffer.
 * 
 * SETUP:
 * 1. npm install puppeteer-core @sparticuz/chromium
 * 2. Add this file to your api/ folder (or adjust vercel.json route)
 * 3. Increase function memory in vercel.json: "functions": { "api/generate-plan.js": { "memory": 1024, "maxDuration": 30 } }
 */

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const {
  PROFILES, WEAKNESS_MAP, TIERS,
  getTier, buildMistakesHTML, buildBodyKeysHTML, buildDrillsHTML, buildWeeklyHTML
} = require('./plan-data');

// Read the HTML template once at cold start
let TEMPLATE = null;
function getTemplate() {
  if (!TEMPLATE) {
    TEMPLATE = fs.readFileSync(path.join(__dirname, 'plan-template.html'), 'utf8');
  }
  return TEMPLATE;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { name, handicap, weakness, goals, practiceDays, email } = req.body;

    // Validate required fields
    if (!name || !handicap || !weakness) {
      return res.status(400).json({ error: 'Missing required fields: name, handicap, weakness' });
    }

    // Resolve profile
    const profileKey = WEAKNESS_MAP[weakness] || weakness;
    const profile = PROFILES[profileKey];
    if (!profile) {
      return res.status(400).json({ error: `Unknown weakness: ${weakness}` });
    }

    const tierKey = getTier(handicap);
    const tier = TIERS[tierKey];
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Format goals
    const goalsText = Array.isArray(goals) ? goals.join('. ') + '.' : (goals || 'Improve my overall game.');

    // Build HTML
    let html = getTemplate();
    const replacements = {
      '{{NAME}}': name,
      '{{HANDICAP}}': String(handicap),
      '{{WEAKNESS_TITLE}}': profile.title,
      '{{DATE}}': dateStr,
      '{{TIER_NAME}}': tier.name,
      '{{PRACTICE_DAYS}}': String(practiceDays || 3),
      '{{TARGET}}': tier.target,
      '{{PROJECTED}}': tier.projected,
      '{{ALLOC_SWING}}': String(tier.swing),
      '{{ALLOC_SWING_MIN}}': String(tier.swing),
      '{{ALLOC_SHORT}}': String(tier.short),
      '{{ALLOC_SHORT_MIN}}': String(tier.short),
      '{{ALLOC_PUTT}}': String(tier.putt),
      '{{ALLOC_PUTT_MIN}}': String(tier.putt),
      '{{ALLOC_MGMT}}': String(tier.mgmt),
      '{{ALLOC_MGMT_MIN}}': String(tier.mgmt),
      '{{KEY_MESSAGE}}': tier.message,
      '{{GOALS}}': goalsText,
      '{{INTRO}}': profile.intro,
      '{{MISTAKES_HTML}}': buildMistakesHTML(profile),
      '{{BODY_KEYS_HTML}}': buildBodyKeysHTML(profile),
      '{{DRILLS_HTML}}': buildDrillsHTML(profile),
      '{{WEEKLY_PLAN_HTML}}': buildWeeklyHTML(profile)
    };

    for (const [key, val] of Object.entries(replacements)) {
      html = html.split(key).join(val);
    }

    // Inject week bullet dot color CSS
    const colors = profile.weekColors;
    let dotCSS = '';
    colors.forEach((c, i) => {
      dotCSS += `.week-card:nth-child(${i + 1}) li::before { background: ${c}; }\n`;
    });
    html = html.replace('</style>', `${dotCSS}</style>`);

    // Launch Puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();

    // Return PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="divotlab-practice-plan-${name.toLowerCase()}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Plan generation error:', error);
    res.status(500).json({ error: 'Failed to generate plan', details: error.message });
  }
};