/**
 * DIVOT LAB — Blog Post Generator
 * 
 * Fetches live DataGolf data, constructs style-aware prompts,
 * calls the Claude API, and returns production-ready HTML blog posts.
 * 
 * Post types: tournament_preview, tournament_recap, stat_deep_dive, improvement
 * 
 * Usage:
 *   POST /api/generate-blog
 *   { "type": "tournament_preview", "topic": "optional override" }
 * 
 *   GET /api/blog-drafts
 *   Returns list of generated drafts
 * 
 *   GET /api/blog-drafts/:slug
 *   Preview a specific draft
 */

const blogConfig = require('./blog-config.json');

// ============================================
// DATA FETCHING — Pulls fresh stats from DataGolf
// ============================================

/**
 * Fetch current tournament context from DataGolf via our existing API proxy
 */
async function fetchTournamentData(apiBaseUrl, dgApiKey) {
  const endpoints = {
    skillRatings: `/preds/skill-ratings?display=value&file_format=json&key=${dgApiKey}`,
    preTournament: `/preds/pre-tournament?tour=pga&odds_format=percent&file_format=json&key=${dgApiKey}`,
    fieldUpdates: `/field-updates?tour=pga&file_format=json&key=${dgApiKey}`,
    schedule: `/get-schedule?tour=pga&season=2026&file_format=json&key=${dgApiKey}`
  };

  const DG_BASE = 'https://feeds.datagolf.com';
  
  const results = {};
  for (const [key, endpoint] of Object.entries(endpoints)) {
    try {
      const response = await fetch(`${DG_BASE}${endpoint}`);
      if (response.ok) {
        results[key] = await response.json();
      } else {
        console.warn(`⚠️ Failed to fetch ${key}: ${response.status}`);
        results[key] = null;
      }
    } catch (err) {
      console.warn(`⚠️ Error fetching ${key}:`, err.message);
      results[key] = null;
    }
  }

  return results;
}

/**
 * Process raw DataGolf data into a structured context object for the prompt
 */
function buildDataContext(rawData) {
  const { skillRatings, preTournament, fieldUpdates, schedule } = rawData;

  // Current tournament info
  const eventName = fieldUpdates?.event_name || preTournament?.event_name || 'Unknown Event';
  const currentEvent = schedule?.schedule?.find(e => e.event_name === eventName) || {};
  const field = fieldUpdates?.field || [];

  // Top players by skill rating (PGA Tour filtered)
  const allPlayers = skillRatings?.players || skillRatings?.skill_ratings || [];
  const pgaPlayers = allPlayers
    .filter(p => p.primary_tour === 'pga' || p.skill_estimate > 0)
    .sort((a, b) => (b.sg_total || b.skill_estimate || 0) - (a.sg_total || a.skill_estimate || 0));

  // Predictions sorted by win probability
  const predictions = (preTournament?.baseline_history_fit || preTournament?.predictions || [])
    .sort((a, b) => (b.win || 0) - (a.win || 0));

  // Match field players to skill data
  const fieldWithSkills = field.map(fp => {
    const skillData = pgaPlayers.find(p => p.dg_id === fp.dg_id);
    const predData = predictions.find(p => p.dg_id === fp.dg_id);
    return {
      name: fp.player_name,
      country: fp.country,
      dg_id: fp.dg_id,
      sg_total: skillData?.sg_total || null,
      sg_ott: skillData?.sg_ott || null,
      sg_app: skillData?.sg_app || null,
      sg_arg: skillData?.sg_arg || null,
      sg_putt: skillData?.sg_putt || null,
      win_prob: predData?.win || null,
      top5_prob: predData?.top_5 || null,
      top10_prob: predData?.top_10 || null,
      make_cut: predData?.make_cut || null
    };
  }).filter(p => p.sg_total !== null);

  // Calculate field strength
  const eliteCount = fieldWithSkills.filter(p => p.sg_total >= 1.5).length;
  const topTierCount = fieldWithSkills.filter(p => p.sg_total >= 1.0).length;
  const avgSG = fieldWithSkills.length > 0
    ? fieldWithSkills.reduce((sum, p) => sum + p.sg_total, 0) / fieldWithSkills.length
    : 0;

  // Top 10 by skill
  const top10bySkill = fieldWithSkills
    .sort((a, b) => b.sg_total - a.sg_total)
    .slice(0, 10);

  // Top 10 favorites by win probability  
  const top10byOdds = fieldWithSkills
    .filter(p => p.win_prob != null)
    .sort((a, b) => b.win_prob - a.win_prob)
    .slice(0, 10);

  // SG category leaders in field
  const sgCategories = ['sg_ott', 'sg_app', 'sg_arg', 'sg_putt'];
  const categoryLeaders = {};
  for (const cat of sgCategories) {
    const sorted = [...fieldWithSkills].filter(p => p[cat] != null).sort((a, b) => b[cat] - a[cat]);
    categoryLeaders[cat] = sorted.slice(0, 5).map(p => ({ name: p.name, value: p[cat] }));
  }

  // Top 10 overall PGA Tour (not field-specific)
  const globalTop10 = pgaPlayers.slice(0, 10).map(p => ({
    name: p.player_name,
    sg_total: p.sg_total,
    sg_ott: p.sg_ott,
    sg_app: p.sg_app,
    sg_arg: p.sg_arg,
    sg_putt: p.sg_putt
  }));

  return {
    tournament: {
      name: eventName,
      course: currentEvent.course || fieldUpdates?.course || '',
      start_date: currentEvent.start_date || null,
      end_date: currentEvent.end_date || null,
      field_size: field.length,
      current_round: fieldUpdates?.current_round || 0,
      purse: currentEvent.purse || null
    },
    field_strength: {
      elite_count: eliteCount,
      top_tier_count: topTierCount,
      avg_sg: avgSG.toFixed(3),
      total_players: fieldWithSkills.length
    },
    top10_by_skill: top10bySkill,
    top10_by_odds: top10byOdds,
    category_leaders: categoryLeaders,
    global_top10: globalTop10,
    predictions_event: preTournament?.event_name || null
  };
}


// ============================================
// PROMPT CONSTRUCTION
// ============================================

/**
 * Build the system prompt that encodes Divot Lab's writing voice
 */
function buildSystemPrompt() {
  const rules = blogConfig.writing_rules.map((r, i) => `${i + 1}. ${r}`).join('\n');
  const seo = blogConfig.seo_rules.map((r, i) => `${i + 1}. ${r}`).join('\n');

  return `You are the lead writer for Divot Lab — a golf analytics publication. Your job is to write blog posts that are indistinguishable from the existing Divot Lab editorial voice.

BRAND VOICE:
${blogConfig.brand.voice}

WRITING RULES (follow these exactly):
${rules}

SEO RULES:
${seo}

OUTPUT FORMAT:
You must return a JSON object with exactly these fields:
{
  "title": "The post title — must be compelling and SEO-friendly",
  "meta_description": "150-160 character meta description with primary keyword",
  "slug": "url-friendly-slug-3-to-6-words",
  "category": "PGA Tour | Strokes Gained | Improvement",
  "category_class": "pga | sg | improve",
  "read_time": "X min read",
  "hero_alt": "Descriptive alt text for the hero image",
  "body_html": "The complete article body HTML — paragraphs, h2 headings, stat callouts, pullquote, divider, and source line. Use the exact HTML element formats provided below.",
  "date": "Today's date in 'Mon D, YYYY' format"
}

HTML ELEMENTS TO USE:
- Paragraphs: <p>text</p>
- Section headings: <h2>Short Punchy Heading</h2>
- Stat callout: ${blogConfig.html_elements.stat_callout}
- Pullquote (max 1 per post): ${blogConfig.html_elements.pullquote}
- Divider (before final section): ${blogConfig.html_elements.divider}
- Source attribution (last element): ${blogConfig.html_elements.source_line}

CRITICAL: The body_html should contain ONLY the article content elements listed above. No wrapping divs, no article tags, no additional HTML structure. Just the sequence of p, h2, stat-callout, pullquote, divider, and source elements that make up the post body.

IMPORTANT: Every stat callout value and label must use REAL numbers from the data provided. Never invent statistics. If you reference a specific number, it must come from the data context provided.`;
}

/**
 * Build the user prompt for a specific post type with real data
 */
function buildUserPrompt(postType, dataContext, customTopic) {
  const typeConfig = blogConfig.post_types[postType];
  if (!typeConfig) throw new Error(`Unknown post type: ${postType}`);

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let dataSection = '';
  let instructions = '';

  switch (postType) {
    case 'tournament_preview':
      dataSection = `
CURRENT TOURNAMENT DATA:
- Event: ${dataContext.tournament.name}
- Course: ${dataContext.tournament.course}
- Dates: ${dataContext.tournament.start_date || 'TBD'} to ${dataContext.tournament.end_date || 'TBD'}
- Field size: ${dataContext.tournament.field_size} players

FIELD STRENGTH:
- Elite players (SG 1.5+): ${dataContext.field_strength.elite_count}
- Top tier (SG 1.0+): ${dataContext.field_strength.top_tier_count}
- Field average SG: ${dataContext.field_strength.avg_sg}

TOP 10 BY DATAGOLF SKILL RATING (in this field):
${dataContext.top10_by_skill.map((p, i) => `${i+1}. ${p.name} — SG Total: ${p.sg_total?.toFixed(2)}, OTT: ${p.sg_ott?.toFixed(2)}, APP: ${p.sg_app?.toFixed(2)}, ARG: ${p.sg_arg?.toFixed(2)}, Putt: ${p.sg_putt?.toFixed(2)}`).join('\n')}

TOP 10 BY WIN PROBABILITY:
${dataContext.top10_by_odds.map((p, i) => `${i+1}. ${p.name} — Win: ${(p.win_prob * 100).toFixed(1)}%, Top 5: ${(p.top5_prob * 100).toFixed(1)}%, Top 10: ${(p.top10_prob * 100).toFixed(1)}%`).join('\n')}

CATEGORY LEADERS (in this field):
Off-the-Tee: ${dataContext.category_leaders.sg_ott?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Approach: ${dataContext.category_leaders.sg_app?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Around Green: ${dataContext.category_leaders.sg_arg?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Putting: ${dataContext.category_leaders.sg_putt?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}`;

      instructions = `Write a tournament preview for ${dataContext.tournament.name} at ${dataContext.tournament.course}.

The post should:
1. Open with something specific and compelling about this particular event — a storyline, a stat anomaly, or a question about the field.
2. Analyze the field strength with specific numbers (elite count, top tier count).
3. Highlight 3-4 key players with their actual skill ratings and what makes them interesting THIS week.
4. Include a course-fit angle — which skills matter most and who in the field profiles well for it.
5. End with 2-3 data-backed picks with reasoning. Not betting picks — analytical picks. "The data says watch for X because Y."

Use at least 2 stat callouts with real numbers from the data above. Include one pullquote.
Today's date: ${dateStr}`;
      break;

    case 'tournament_recap':
      dataSection = `
TOURNAMENT DATA:
- Event: ${dataContext.tournament.name}
- Course: ${dataContext.tournament.course}
- Field size: ${dataContext.tournament.field_size} players

FIELD STRENGTH:
- Elite players (SG 1.5+): ${dataContext.field_strength.elite_count}
- Top tier (SG 1.0+): ${dataContext.field_strength.top_tier_count}

TOP FINISHERS BY SKILL RATING:
${dataContext.top10_by_skill.map((p, i) => `${i+1}. ${p.name} — SG Total: ${p.sg_total?.toFixed(2)}, OTT: ${p.sg_ott?.toFixed(2)}, APP: ${p.sg_app?.toFixed(2)}, ARG: ${p.sg_arg?.toFixed(2)}, Putt: ${p.sg_putt?.toFixed(2)}`).join('\n')}

WIN PROBABILITIES (pre-tournament):
${dataContext.top10_by_odds.map((p, i) => `${i+1}. ${p.name} — Win: ${(p.win_prob * 100).toFixed(1)}%`).join('\n')}

GLOBAL TOP 10 (for context):
${dataContext.global_top10.map((p, i) => `${i+1}. ${p.name} — SG: ${p.sg_total?.toFixed(2)}`).join('\n')}`;

      instructions = `Write a tournament recap for ${dataContext.tournament.name}.

NOTE: Since we may not have final results yet, frame this as a field/performance analysis rather than a specific results recap. Focus on:
1. The most interesting statistical storyline from the field.
2. Which players' skill profiles matched (or didn't match) expectations.
3. A surprising data point — something the casual viewer wouldn't notice.
4. What the numbers suggest about form going forward.

Use at least 2 stat callouts with real numbers. Include one pullquote.
Today's date: ${dateStr}`;
      break;

    case 'stat_deep_dive':
      dataSection = `
CURRENT TOP 10 PGA TOUR PLAYERS (by DataGolf skill rating):
${dataContext.global_top10.map((p, i) => `${i+1}. ${p.name} — SG Total: ${p.sg_total?.toFixed(2)}, OTT: ${p.sg_ott?.toFixed(2)}, APP: ${p.sg_app?.toFixed(2)}, ARG: ${p.sg_arg?.toFixed(2)}, Putt: ${p.sg_putt?.toFixed(2)}`).join('\n')}

CURRENT TOURNAMENT FIELD LEADERS:
Off-the-Tee: ${dataContext.category_leaders.sg_ott?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Approach: ${dataContext.category_leaders.sg_app?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Around Green: ${dataContext.category_leaders.sg_arg?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}
Putting: ${dataContext.category_leaders.sg_putt?.map(p => `${p.name} (${p.value?.toFixed(2)})`).join(', ')}`;

      const topic = customTopic || 'a compelling statistical trend visible in the current player data';
      instructions = `Write a statistical deep-dive about: ${topic}

Use the real player data above to ground every claim. The post should:
1. Open with a counterintuitive hook — challenge a common golf assumption with data.
2. Set up the analytical framework clearly for a non-expert audience.
3. Present the evidence with real numbers and specific player examples.
4. Explain why it matters — both for understanding the tour and for amateur golfers.
5. End with a practical insight the reader can take away.

Use at least 2 stat callouts with real numbers. Include one pullquote.
Today's date: ${dateStr}`;
      break;

    case 'improvement':
      dataSection = `
TOP PLAYERS FOR CONTEXT:
${dataContext.global_top10.slice(0, 5).map((p, i) => `${i+1}. ${p.name} — SG Total: ${p.sg_total?.toFixed(2)}, OTT: ${p.sg_ott?.toFixed(2)}, APP: ${p.sg_app?.toFixed(2)}, ARG: ${p.sg_arg?.toFixed(2)}, Putt: ${p.sg_putt?.toFixed(2)}`).join('\n')}`;

      const improveTopic = customTopic || 'a practical improvement insight backed by tour-level data';
      instructions = `Write an improvement-focused article about: ${improveTopic}

The post should:
1. Start with something relatable — a frustration or assumption every golfer has.
2. Introduce what the tour-level data actually shows about this topic.
3. Give practical application — what should the reader actually do differently.
4. Include specific numbers that make the case undeniable.
5. End with a clear, actionable step.

Use at least 2 stat callouts. Include one pullquote. Keep it grounded and useful — never condescending.
Today's date: ${dateStr}`;
      break;
  }

  return `${dataSection}\n\n${instructions}\n\nReturn your response as a valid JSON object. No markdown code fences — just the raw JSON.`;
}


// ============================================
// CLAUDE API INTEGRATION
// ============================================

/**
 * Call Claude API to generate the blog post content
 */
async function callClaudeAPI(systemPrompt, userPrompt, anthropicApiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      system: systemPrompt
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textContent = data.content?.find(c => c.type === 'text');
  if (!textContent) throw new Error('No text content in Claude response');

  // Parse the JSON response — handle potential markdown fences
  let jsonStr = textContent.text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('Failed to parse Claude response as JSON:', jsonStr.substring(0, 500));
    throw new Error(`JSON parse error: ${parseErr.message}`);
  }
}


// ============================================
// HTML TEMPLATE ASSEMBLY
// ============================================

/**
 * Wrap the generated content in the full Divot Lab blog HTML template
 */
function assembleHTML(postData) {
  const { title, meta_description, slug, category, category_class, read_time, hero_alt, body_html, date } = postData;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="/favicon.png">
<title>${escapeHTML(title)} - Divot Lab</title>
<meta name="description" content="${escapeHTML(meta_description)}">
<meta property="og:title" content="${escapeHTML(title)} - Divot Lab">
<meta property="og:description" content="${escapeHTML(meta_description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://divotlab.com/${slug}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(title)} - Divot Lab">
<meta name="twitter:description" content="${escapeHTML(meta_description)}">
<link rel="canonical" href="https://divotlab.com/${slug}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,500;1,600&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

<style>
:root {
  --black:      #0A0A0A;
  --white:      #FAFAFA;
  --graphite:   #4A4A4A;
  --steel:      #C4C4C4;
  --green:      #1B4D3E;
  --green-light:#5BBF85;
  --blue:       #2C5F7C;
  --blue-mid:   #5A8FA8;
  --warm-gray:  #F3F2F0;
  --display: 'Cormorant Garamond', Georgia, serif;
  --body:    'DM Sans', 'Helvetica Neue', sans-serif;
  --mono:    'JetBrains Mono', 'Courier New', monospace;
}
*,*::before,*::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { font-family: var(--body); color: var(--black); background: var(--white); -webkit-font-smoothing: antialiased; overflow-x: hidden; }
a { color:inherit; text-decoration:none; }

/* NAV */
nav { position:fixed; top:0; left:0; right:0; z-index:100; padding:0 56px; height:68px; display:flex; align-items:center; background:rgba(10,10,10,1); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); border-bottom:1px solid rgba(255,255,255,0.07); transition:background .35s, border-color .35s; }
nav.scrolled { background:rgba(10,10,10,0.55); }
nav.light { background:rgba(250,250,250,0.88); border-bottom-color:rgba(0,0,0,0.07); }
.nav-logo { display:flex; align-items:center; gap:11px; }
.nav-logo svg { width:26px; height:26px; flex-shrink:0; color:var(--white); transition:color .35s; }
nav.light .nav-logo svg { color:var(--black); }
.nav-wordmark { font-family:var(--body); font-size:14px; font-weight:600; letter-spacing:.1em; color:var(--white); transition:color .35s; }
.nav-wordmark span { font-weight:300; opacity:.55; }
nav.light .nav-wordmark { color:var(--black); }
.nav-links { display:flex; align-items:center; gap:32px; margin-left:auto; }
.nav-links a { font-size:13px; font-weight:500; letter-spacing:.05em; color:rgba(250,250,250,.65); transition:color .2s; }
.nav-links a:hover { color:var(--white); }
nav.light .nav-links a { color:var(--graphite); }
nav.light .nav-links a:hover { color:var(--black); }
.nav-cta { background:var(--green); color:var(--white) !important; padding:9px 22px; border-radius:5px; font-weight:500; transition:background .2s, transform .15s, box-shadow .2s; }
.nav-cta:hover { background:#236b4f; transform:translateY(-1px); box-shadow:0 4px 14px rgba(27,77,62,.3); }
.nav-hamburger { display:none; flex-direction:column; justify-content:center; align-items:center; width:40px; height:40px; margin-left:auto; cursor:pointer; background:none; border:none; gap:5px; z-index:101; position:relative; }
.nav-hamburger span { display:block; width:22px; height:2px; background:var(--white); border-radius:2px; transition:transform .3s cubic-bezier(.22,1,.36,1), opacity .2s ease; }
nav.light .nav-hamburger span { background:var(--black); }
nav.menu-open .nav-hamburger span:nth-child(1) { transform:translateY(7px) rotate(45deg); }
nav.menu-open .nav-hamburger span:nth-child(2) { opacity:0; }
nav.menu-open .nav-hamburger span:nth-child(3) { transform:translateY(-7px) rotate(-45deg); }
.nav-drawer { position:fixed; top:68px; left:0; right:0; z-index:99; background:rgba(10,10,10,0.92); backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px); border-bottom:1px solid rgba(255,255,255,0.07); padding:12px 0 20px; display:flex; flex-direction:column; align-items:center; gap:4px; max-height:0; overflow:hidden; opacity:0; transition:max-height .38s cubic-bezier(.22,1,.36,1), opacity .28s ease; }
.nav-drawer.open { max-height:260px; opacity:1; }
.nav-drawer.light { background:rgba(250,250,250,0.95); border-bottom-color:rgba(0,0,0,0.07); }
.nav-drawer a { font-size:15px; font-weight:500; letter-spacing:.06em; color:rgba(250,250,250,.75); padding:10px 0; width:100%; text-align:center; transition:color .2s; }
.nav-drawer a:hover { color:var(--white); }
.nav-drawer.light a { color:var(--graphite); }
.nav-drawer .nav-cta { margin-top:8px; width:auto; padding:10px 32px; border-radius:5px; }

/* HERO */
.post-hero { position:relative; height:480px; overflow:hidden; margin-top:68px; }
.post-hero-bg { position:absolute; inset:0; background:linear-gradient(140deg, #0f1a16 0%, #162420 50%, #0a0a0a 100%); }
.post-hero-overlay { position:absolute; inset:0; background:linear-gradient(to bottom, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.25) 40%, rgba(10,10,10,0.75) 80%, rgba(10,10,10,0.92) 100%); }
.post-hero-content { position:relative; z-index:1; max-width:720px; margin:0 auto; padding:0 48px; height:100%; display:flex; flex-direction:column; justify-content:flex-end; padding-bottom:56px; }
.post-cat { display:inline-block; width:fit-content; font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; padding:4px 10px; border-radius:3px; margin-bottom:18px; }
.post-cat.pga { background:rgba(44,95,124,.22); color:#7ab8d4; }
.post-cat.sg { background:rgba(44,95,124,.22); color:#7ab8d4; }
.post-cat.improve { background:rgba(27,77,62,.25); color:var(--green-light); }
.post-hero h1 { font-family:var(--display); font-size:clamp(32px, 5vw, 48px); font-weight:600; color:var(--white); letter-spacing:-.02em; line-height:1.1; margin-bottom:16px; }
.post-hero-meta { font-size:13px; color:rgba(250,250,250,.5); display:flex; align-items:center; gap:6px; }
.post-hero-meta .dot { opacity:.4; }

/* BODY */
.post-body-wrap { background:var(--white); padding:72px 48px 96px; }
.post-body { max-width:680px; margin:0 auto; }
.post-body p { font-size:16px; font-weight:300; line-height:1.8; color:var(--graphite); margin-bottom:24px; }
.post-body p:first-of-type::first-letter { font-family:var(--display); font-size:56px; font-weight:700; float:left; line-height:.85; margin-right:12px; margin-top:4px; color:var(--black); }
.post-body h2 { font-family:var(--display); font-size:28px; font-weight:600; color:var(--black); letter-spacing:-.01em; line-height:1.2; margin-top:52px; margin-bottom:16px; }

/* STAT CALLOUT */
.stat-callout { background:var(--black); border-radius:9px; padding:32px 36px; margin:40px 0; display:flex; align-items:center; gap:32px; }
.stat-callout-val { font-family:var(--mono); font-size:42px; font-weight:500; color:var(--blue-mid); letter-spacing:-.02em; white-space:nowrap; flex-shrink:0; }
.stat-callout-right { display:flex; flex-direction:column; gap:4px; }
.stat-callout-label { font-size:10px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:rgba(250,250,250,.35); }
.stat-callout-note { font-size:13px; font-weight:300; color:rgba(250,250,250,.5); line-height:1.5; }

/* PULLQUOTE */
.post-pullquote { border-left:3px solid var(--green); padding:8px 0 8px 28px; margin:40px 0; }
.post-pullquote p { font-family:var(--display); font-size:22px !important; font-weight:500; font-style:italic; color:var(--black) !important; line-height:1.45 !important; margin-bottom:0 !important; }
.post-pullquote p::first-letter { font-size:22px !important; float:none !important; margin:0 !important; }

/* DIVIDER */
.post-divider { width:48px; height:2px; background:linear-gradient(90deg, var(--green), var(--blue-mid)); margin:48px 0; border-radius:1px; }

/* SOURCE */
.post-source { font-size:11px; color:var(--steel); letter-spacing:.06em; margin-top:-16px; margin-bottom:28px; }
.post-source a { color:var(--blue-mid); text-decoration:underline; text-underline-offset:3px; }

/* READ NEXT */
.read-next-wrap { background:var(--warm-gray); padding:72px 48px; }
.read-next-inner { max-width:720px; margin:0 auto; }
.read-next-label { font-size:11px; font-weight:500; letter-spacing:.22em; text-transform:uppercase; color:var(--green); margin-bottom:24px; }
.read-next-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.rn-card { background:var(--white); border:1px solid #E6E6E4; border-radius:9px; overflow:hidden; cursor:pointer; transition:transform .28s cubic-bezier(.22,1,.36,1), box-shadow .28s, border-color .28s; position:relative; }
.rn-card:hover { transform:translateY(-4px); box-shadow:0 14px 40px rgba(0,0,0,.08); border-color:transparent; }
.rn-card::after { content:''; position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(90deg, var(--green), var(--blue-mid)); transform:scaleX(0); transform-origin:left; transition:transform .4s cubic-bezier(.22,1,.36,1); }
.rn-card:hover::after { transform:scaleX(1); }
.rn-img { height:150px; position:relative; overflow:hidden; }
.rn-img-bg { position:absolute; inset:0; }
.rn-card:nth-child(1) .rn-img-bg { background:linear-gradient(140deg, #0f1520 0%, #162028 60%, #0a0a0a 100%); }
.rn-card:nth-child(2) .rn-img-bg { background:linear-gradient(140deg, #1a140f 0%, #241a15 60%, #0a0a0a 100%); }
.rn-body { padding:18px 20px 20px; }
.rn-cat { display:inline-block; font-size:9px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; padding:3px 8px; border-radius:3px; margin-bottom:8px; }
.rn-cat.pga { background:rgba(44,95,124,.1); color:var(--blue); }
.rn-cat.sg { background:rgba(44,95,124,.1); color:var(--blue); }
.rn-cat.improve { background:rgba(27,77,62,.1); color:var(--green); }
.rn-title { font-family:var(--display); font-size:18px; font-weight:600; line-height:1.3; color:var(--black); margin-bottom:6px; }
.rn-meta { font-size:11px; color:var(--graphite); opacity:.6; }

/* FOOTER */
footer { background:var(--black); border-top:1px solid rgba(255,255,255,.06); padding:64px 56px 36px; }
.footer-grid { max-width:1120px; margin:0 auto; display:grid; grid-template-columns:1.5fr 1fr 1fr 1fr; gap:44px; }
.f-brand .f-logo { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
.f-brand .f-logo svg { width:20px; height:20px; }
.f-brand .f-logo-text { font-weight:600; font-size:13px; letter-spacing:.1em; color:var(--white); }
.f-brand .f-logo-text span { font-weight:300; opacity:.5; }
.f-brand p { font-size:13px; color:rgba(250,250,250,.36); line-height:1.65; max-width:240px; }
.f-col h5 { font-size:10px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:rgba(250,250,250,.28); margin-bottom:18px; }
.f-col a { display:block; font-size:13px; color:rgba(250,250,250,.5); margin-bottom:11px; transition:color .2s; }
.f-col a:hover { color:var(--white); }
.footer-bottom { max-width:1120px; margin:44px auto 0; padding-top:24px; border-top:1px solid rgba(255,255,255,.06); display:flex; justify-content:space-between; font-size:12px; color:rgba(250,250,250,.22); }

/* RESPONSIVE */
@media(max-width:768px){
  .post-hero { height:400px; }
  .post-hero-content { padding-bottom:40px; padding-left:24px; padding-right:24px; }
  .post-body-wrap { padding:52px 24px 72px; }
  .stat-callout { flex-direction:column; align-items:flex-start; gap:12px; padding:24px; }
  .stat-callout-val { font-size:36px; }
  .read-next-wrap { padding:52px 24px; }
  .read-next-grid { grid-template-columns:1fr; }
  footer { padding:48px 24px 28px; }
  .footer-grid { grid-template-columns:1fr 1fr; }
}
@media(max-width:600px){
  nav { padding:0 22px; }
  .nav-links { display:none; }
  .nav-hamburger { display:flex; }
  .post-hero { height:340px; }
  .post-hero h1 { font-size:28px; }
  .post-body p { font-size:15px; }
  .post-body p:first-of-type::first-letter { font-size:44px; }
  .post-body h2 { font-size:24px; margin-top:40px; }
  .footer-grid { grid-template-columns:1fr; gap:28px; }
}
</style>
</head>
<body>

<!-- NAV -->
<nav id="nav">
  <a href="/" class="nav-logo">
    <svg viewBox="0 0 72 72" fill="none">
      <line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/>
      <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/>
      <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/>
      <circle cx="36" cy="20.5" r="9" fill="currentColor"/>
    </svg>
    <span class="nav-wordmark">DIVOT <span>LAB</span></span>
  </a>
  <div class="nav-links">
    <a href="/articles">Articles</a>
    <a href="https://divotlab.printful.me/">Shop</a>
    <a href="/about">About</a>
    <a href="/the-lab" class="nav-cta">The Lab</a>
  </div>
  <button class="nav-hamburger" id="navHamburger" aria-label="Toggle menu">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="nav-drawer" id="navDrawer">
  <a href="/articles">Articles</a>
  <a href="https://divotlab.printful.me/">Shop</a>
  <a href="/about">About</a>
  <a href="/the-lab" class="nav-cta">The Lab</a>
</div>

<!-- HERO -->
<section class="post-hero">
  <div class="post-hero-bg"></div>
  <div class="post-hero-overlay"></div>
  <div class="post-hero-content">
    <span class="post-cat ${category_class}">${escapeHTML(category)}</span>
    <h1>${escapeHTML(title)}</h1>
    <div class="post-hero-meta">
      ${escapeHTML(date)} <span class="dot">·</span> ${escapeHTML(read_time)} <span class="dot">·</span> ${escapeHTML(category)}
    </div>
  </div>
</section>

<!-- BODY -->
<div class="post-body-wrap">
  <article class="post-body">
    ${body_html}
  </article>
</div>

<!-- READ NEXT -->
<div class="read-next-wrap">
  <div class="read-next-inner">
    <div class="read-next-label">Read Next</div>
    <div class="read-next-grid" id="readNextGrid">
      <!-- Populated dynamically or with latest posts -->
    </div>
  </div>
</div>

<!-- FOOTER -->
<footer>
  <div class="footer-grid">
    <div class="f-brand">
      <div class="f-logo">
        <svg viewBox="0 0 72 72" fill="none" style="color:var(--white)">
          <line x1="4" y1="36.5" x2="68" y2="36.5" stroke="currentColor" stroke-width="3.2"/>
          <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="currentColor" fill-opacity=".15"/>
          <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="currentColor" stroke-width="2.8" fill="none"/>
          <circle cx="36" cy="20.5" r="9" fill="currentColor"/>
        </svg>
        <span class="f-logo-text">DIVOT <span>LAB</span></span>
      </div>
      <p>Data-driven golf analysis and premium apparel. Smart takes. Real stats. Clothes worth wearing.</p>
    </div>
    <div class="f-col">
      <h5>Read</h5>
      <a href="/articles">All Articles</a>
    </div>
    <div class="f-col">
      <h5>Shop</h5>
      <a href="https://divotlab.printful.me/">All Products</a>
    </div>
    <div class="f-col">
      <h5>Company</h5>
      <a href="/about">About</a>
      <a href="/the-lab">The Lab</a>
      <a href="https://instagram.com/divotlab" target="_blank">Instagram</a>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© 2026 Divot Lab</span>
    <span>Built with data.</span>
  </div>
</footer>

<script>
(function(){
  var nav = document.getElementById('nav');
  var drawer = document.getElementById('navDrawer');
  var hamburger = document.getElementById('navHamburger');
  var ticking = false;
  window.addEventListener('scroll', function(){
    if(!ticking){
      requestAnimationFrame(function(){
        var scrolled = window.scrollY > 200;
        nav.classList.toggle('scrolled', scrolled);
        nav.classList.toggle('light', scrolled);
        drawer.classList.toggle('light', scrolled);
        ticking = false;
      });
      ticking = true;
    }
  });
  hamburger.addEventListener('click', function(){
    nav.classList.toggle('menu-open');
    drawer.classList.toggle('open');
  });
  drawer.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click', function(){
      nav.classList.remove('menu-open');
      drawer.classList.remove('open');
    });
  });
})();
</script>
</body>
</html>`;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ============================================
// EXPORTS
// ============================================
module.exports = {
  fetchTournamentData,
  buildDataContext,
  buildSystemPrompt,
  buildUserPrompt,
  callClaudeAPI,
  assembleHTML,
  blogConfig
};