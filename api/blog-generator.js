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
 * Fetch current tournament context by reusing the internal /api/lab-data endpoint.
 * This ensures we get the same PGA-filtered, properly-matched data that The Lab page uses.
 * 
 * When called from within server.js, we pass the labDataFetcher function directly
 * to avoid an HTTP round-trip to ourselves.
 */
async function fetchTournamentData(labDataFetcher) {
  try {
    const data = await labDataFetcher();
    return data;
  } catch (err) {
    console.error('❌ Failed to fetch lab data for blog generator:', err.message);
    return null;
  }
}

/**
 * Find the most recently completed event from the schedule
 */
function findLastCompletedEvent(schedule) {
  if (!schedule || schedule.length === 0) return null;
  
  const today = new Date();
  const completed = schedule
    .filter(e => {
      if (!e.end_date) return false;
      const endDate = new Date(e.end_date);
      return endDate < today;
    })
    .sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
  
  return completed.length > 0 ? {
    event_name: completed[0].event_name,
    course: completed[0].course || '',
    start_date: completed[0].start_date,
    end_date: completed[0].end_date
  } : null;
}

/**
 * Process lab-data composite into a structured context object for the prompt.
 * Input is the already-processed data from /api/lab-data (PGA-filtered, field-matched).
 */
function buildDataContext(labData) {
  if (!labData) {
    return {
      tournament: { name: 'Unknown', course: '', field_size: 0 },
      field_strength: { elite_count: 0, top_tier_count: 0, avg_sg: '0', total_players: 0 },
      top10_by_skill: [],
      top10_by_odds: [],
      category_leaders: {},
      global_top10: [],
      predictions_event: null
    };
  }

  const players = labData.players || [];
  const predictions = labData.predictions || [];
  const tournament = labData.tournament || {};
  const fieldList = labData.field_list || [];
  const predictionEventName = labData.prediction_event_name || null;

  // Build field with skills by matching field_list players to skill data
  const fieldWithSkills = fieldList.map(fp => {
    const skillData = players.find(p => p.dg_id === fp.dg_id);
    const predData = predictions.find(p => p.dg_id === fp.dg_id);
    return {
      name: fp.player_name,
      country: fp.country || (skillData ? skillData.country : ''),
      dg_id: fp.dg_id,
      sg_total: skillData?.sg_total ?? null,
      sg_ott: skillData?.sg_ott ?? null,
      sg_app: skillData?.sg_app ?? null,
      sg_arg: skillData?.sg_arg ?? null,
      sg_putt: skillData?.sg_putt ?? null,
      win_prob: predData?.win ?? null,
      top5_prob: predData?.top_5 ?? null,
      top10_prob: predData?.top_10 ?? null,
      make_cut: predData?.make_cut ?? null
    };
  }).filter(p => p.sg_total !== null);

  // If field_list is empty, fall back to matching predictions to players
  let effectiveField = fieldWithSkills;
  if (effectiveField.length === 0 && predictions.length > 0) {
    effectiveField = predictions.map(pred => {
      const skillData = players.find(p => p.dg_id === pred.dg_id || p.player_name === pred.player_name);
      return {
        name: pred.player_name,
        country: skillData?.country || '',
        dg_id: pred.dg_id,
        sg_total: skillData?.sg_total ?? null,
        sg_ott: skillData?.sg_ott ?? null,
        sg_app: skillData?.sg_app ?? null,
        sg_arg: skillData?.sg_arg ?? null,
        sg_putt: skillData?.sg_putt ?? null,
        win_prob: pred.win ?? null,
        top5_prob: pred.top_5 ?? null,
        top10_prob: pred.top_10 ?? null,
        make_cut: pred.make_cut ?? null
      };
    }).filter(p => p.sg_total !== null);
  }

  // Calculate field strength
  const eliteCount = effectiveField.filter(p => p.sg_total >= 1.5).length;
  const topTierCount = effectiveField.filter(p => p.sg_total >= 1.0).length;
  const avgSG = effectiveField.length > 0
    ? effectiveField.reduce((sum, p) => sum + p.sg_total, 0) / effectiveField.length
    : 0;

  // Top 10 by skill
  const top10bySkill = [...effectiveField]
    .sort((a, b) => b.sg_total - a.sg_total)
    .slice(0, 10);

  // Top 10 favorites by win probability  
  const top10byOdds = [...effectiveField]
    .filter(p => p.win_prob != null)
    .sort((a, b) => b.win_prob - a.win_prob)
    .slice(0, 10);

  // SG category leaders in field
  const sgCategories = ['sg_ott', 'sg_app', 'sg_arg', 'sg_putt'];
  const categoryLeaders = {};
  for (const cat of sgCategories) {
    const sorted = [...effectiveField].filter(p => p[cat] != null).sort((a, b) => b[cat] - a[cat]);
    categoryLeaders[cat] = sorted.slice(0, 5).map(p => ({ name: p.name, value: p[cat] }));
  }

  // Top 10 overall PGA Tour (not field-specific)
  const globalTop10 = [...players]
    .filter(p => p.sg_total != null)
    .sort((a, b) => (b.sg_total || 0) - (a.sg_total || 0))
    .slice(0, 10)
    .map(p => ({
      name: p.player_name,
      sg_total: p.sg_total,
      sg_ott: p.sg_ott,
      sg_app: p.sg_app,
      sg_arg: p.sg_arg,
      sg_putt: p.sg_putt
    }));

  return {
    tournament: {
      name: tournament.event_name || 'Unknown Event',
      course: tournament.course || '',
      start_date: tournament.start_date || null,
      end_date: tournament.end_date || null,
      field_size: tournament.field_size || effectiveField.length,
      current_round: tournament.current_round || 0,
      purse: null,
      event_completed: tournament.event_completed || false
    },
    last_completed_event: findLastCompletedEvent(labData.schedule || []),
    field_strength: {
      elite_count: eliteCount,
      top_tier_count: topTierCount,
      avg_sg: avgSG.toFixed(3),
      total_players: effectiveField.length
    },
    top10_by_skill: top10bySkill,
    top10_by_odds: top10byOdds,
    category_leaders: categoryLeaders,
    global_top10: globalTop10,
    predictions_event: predictionEventName
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
  const dgAttribution = blogConfig.datagolf_attribution;

  return `You are the lead writer for Divot Lab — a golf analytics publication. Your job is to write blog posts that read like they were written by a human who plays golf three times a week and happens to love data. No one should ever suspect a machine wrote this.

BRAND VOICE:
${blogConfig.brand.voice}

DATAGOLF DATA ATTRIBUTION (CRITICAL):
The numbers you'll be working with come from DataGolf's predictive skill model — NOT from official PGA Tour statistics. Here's what you need to know:
- ${dgAttribution.what_it_is}
- ${dgAttribution.how_to_reference}
- ${dgAttribution.why_it_matters}
On first mention of DataGolf in a post, use something like: "${dgAttribution.first_mention_template}"
The source line at the bottom should follow this format: "${dgAttribution.source_line_format}"

WRITING RULES (follow these exactly — violations will be obvious to readers):
${rules}

SEO RULES:
${seo}

WORD COUNT TARGET:
Write ${blogConfig.post_types.tournament_preview?.target_word_count || 1900}-${blogConfig.post_types.tournament_preview?.max_word_count || 2200} words of body content (not counting HTML tags). This is the SEO sweet spot — long enough to rank, short enough to hold attention. Every paragraph should earn its place. If a sentence doesn't add insight, cut it.

ANTI-AI DETECTION CHECKLIST (run this mentally before finishing):
- Did I vary my sentence length? (Short. Then a longer one that builds. Then medium.)
- Did I avoid starting consecutive paragraphs the same way?
- Did I include at least one moment that shows I understand golf beyond the spreadsheet?
- Did I use any words from the banned list (landscape, realm, delve, tapestry, multifaceted, nuanced, underscores, paradigm)?
- Does every transition feel natural, not formulaic?
- Would a golf fan reading this feel like they're getting a perspective, not a report?

OUTPUT FORMAT:
You must return a JSON object with exactly these fields:
{
  "title": "The post title — compelling, SEO-friendly, under 60 chars if possible",
  "meta_description": "150-160 character meta description with primary keyword",
  "slug": "url-friendly-slug-3-to-6-words",
  "category": "PGA Tour | Strokes Gained | Improvement",
  "category_class": "pga | sg | improve",
  "hero_alt": "Descriptive alt text for the hero image",
  "body_html": "The complete article body HTML",
  "date": "Today's date in 'Mon D, YYYY' format"
}

NOTE: Do NOT include a read_time field. Read time will be calculated automatically from the word count of your body_html.

HTML ELEMENTS TO USE:
- Paragraphs: <p>text</p>
- Section headings: <h2>Short Punchy Heading</h2>
- Stat callout: ${blogConfig.html_elements.stat_callout}
- Pullquote (max 1 per post): ${blogConfig.html_elements.pullquote}
- Divider (before final section): ${blogConfig.html_elements.divider}
- Source attribution (last element): ${blogConfig.html_elements.source_line}

CRITICAL: The body_html should contain ONLY the article content elements listed above. No wrapping divs, no article tags, no additional HTML structure. Just the sequence of p, h2, stat-callout, pullquote, divider, and source elements that make up the post body.

IMPORTANT: Every stat callout value and label must use REAL numbers from the data provided. Never invent statistics. If you reference a specific number, it must come from the data context. Stat callout labels must indicate these are DataGolf model estimates.`;
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
1. Open with something specific and compelling about this particular event — a storyline, a stat anomaly, or a question about the field. Make the reader care about THIS week.
2. Analyze the field strength with specific numbers, but weave them into the narrative — don't dump a stats table into prose.
3. Highlight 3-4 key players with their actual skill ratings and what makes them interesting THIS week. Give each player a sentence or two of real golf context beyond the numbers.
4. Include a course-fit angle — which skills matter most at this course and who in the field profiles well for it.
5. One dark horse pick with reasoning — someone outside the top favorites whose numbers suggest they could surprise.
6. End with 2-3 data-backed picks with reasoning. Not betting picks — analytical picks. "The data says watch for X because Y."

Use 2 stat callouts (no more than 3) with real numbers from the data above. Include one pullquote. Let the storytelling carry the post — stats should support the narrative, not dominate it.

VOCABULARY NOTE: Write at a smart-but-accessible level. Avoid words like 'contrarian', 'prognosticate', 'efficacy', 'precipitous', 'nomenclature', or any word that would make a reader pause. If a simpler word works just as well, use it. The audience is golf fans, not academics.

Today's date: ${dateStr}`;
      break;

    case 'tournament_recap':
      // Use last completed event for recaps, not the current/upcoming one
      const recapEvent = dataContext.last_completed_event || dataContext.tournament;
      const recapEventName = recapEvent.event_name || recapEvent.name || 'Recent Tournament';
      const recapCourse = recapEvent.course || dataContext.tournament.course || '';

      dataSection = `
RECAP TARGET — LAST COMPLETED TOURNAMENT:
- Event: ${recapEventName}
- Course: ${recapCourse}
- Dates: ${recapEvent.start_date || 'N/A'} to ${recapEvent.end_date || 'N/A'}

IMPORTANT: This tournament has ALREADY FINISHED. Write about it in past tense. Do NOT write about it as if it is upcoming or ongoing.

NOTE: We do not have final leaderboard results from this specific API call. Focus your recap on the field composition, what the skill data suggested going in, and broader storylines. Frame your analysis around what the data told us about this event — who was expected to contend, whose form was trending, and what the field strength said about the quality of the winner (whoever it was). You can reference the field data below, which reflects current skill ratings of players who were likely in the field.

TOP PLAYERS BY DATAGOLF SKILL RATING (for context — these are current ratings, not event-specific results):
${dataContext.top10_by_skill.slice(0, 8).map((p, i) => `${i+1}. ${p.name} — SG Total: ${p.sg_total?.toFixed(2)}, OTT: ${p.sg_ott?.toFixed(2)}, APP: ${p.sg_app?.toFixed(2)}, Putt: ${p.sg_putt?.toFixed(2)}`).join('\n')}

GLOBAL TOP 10 PGA TOUR (for broader context):
${dataContext.global_top10.slice(0, 6).map((p, i) => `${i+1}. ${p.name} — SG: ${p.sg_total?.toFixed(2)}`).join('\n')}`;

      instructions = `Write a tournament recap for ${recapEventName} at ${recapCourse}.

This event has ALREADY BEEN COMPLETED. Write in past tense throughout.

Since we don't have the final leaderboard, write a field/form analysis recap that focuses on:
1. The storyline going into the event — what made this week interesting from a data perspective.
2. Which players' skill profiles made them strong fits for the course and conditions.
3. A broader observation about the state of the tour, form trends, or a player arc worth tracking.
4. A forward-looking thought about what this event's field strength means for the rest of the season.

Keep the stat references purposeful — use 2 stat callouts max, and let the narrative carry the post. Don't overwhelm the reader with numbers. Use stats to punctuate points, not make them.
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
4. Add some historical context or tour-level perspective that enriches the analysis.
5. Explain why it matters — both for understanding the tour and for amateur golfers.
6. End with a practical insight the reader can take away.

Use 2-3 stat callouts with real numbers (no more than 4). Include one pullquote. Let the story carry the weight — stats should land like punchlines, not pile up like homework.

VOCABULARY NOTE: Write at a smart-but-accessible level. Avoid words like 'contrarian', 'prognosticate', 'efficacy', 'precipitous', 'nomenclature', or any word that would make a reader pause. If a simpler word works just as well, use it.

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
2. Introduce a common misconception and why it persists.
3. Show what the tour-level data actually reveals about this topic.
4. Use a specific tour player as an example to make the data tangible.
5. Give practical application — what should the reader actually do differently.
6. Include specific numbers that make the case undeniable.
7. End with a clear, actionable step.

Use 2 stat callouts (no more than 3). Include one pullquote. Keep it grounded and useful — never condescending, never preachy.

VOCABULARY NOTE: Write at a smart-but-accessible level. Avoid words like 'contrarian', 'prognosticate', 'efficacy', 'precipitous', 'nomenclature', or any word that would make a reader pause. If a simpler word works just as well, use it.

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
      max_tokens: 8192,
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
 * Calculate read time from HTML body content
 * Strips HTML tags, counts words, divides by 200 WPM (Medium/Google standard)
 */
function calculateReadTime(bodyHtml) {
  if (!bodyHtml) return '5 min read';
  const textOnly = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / 200);
  return `${minutes} min read`;
}

/**
 * Wrap the generated content in the full Divot Lab blog HTML template
 */
function assembleHTML(postData) {
  const { title, meta_description, slug, category, category_class, hero_alt, body_html, date } = postData;
  const read_time = calculateReadTime(body_html);

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
.post-hero-brand {
  position:absolute; top:50%; left:50%; transform:translate(-50%,-65%);
  z-index:0; display:flex; flex-direction:column; align-items:center; gap:16px; opacity:.12;
}
.post-hero-brand svg { width:80px; height:80px; }
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
  <div class="post-hero-brand">
    <svg viewBox="0 0 72 72" fill="none">
      <line x1="4" y1="36.5" x2="68" y2="36.5" stroke="white" stroke-width="3.2"/>
      <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="white" fill-opacity=".15"/>
      <path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="white" stroke-width="2.8" fill="none"/>
      <circle cx="36" cy="20.5" r="9" fill="white"/>
    </svg>
  </div>
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
      <!-- Loaded dynamically -->
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

  // --- Read Next dynamic loading ---
  (function loadReadNext(){
    var API = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://divotlab-api.vercel.app';
    var slug = '${slug}';
    var grid = document.getElementById('readNextGrid');
    if (!grid) return;

    var logoSVG = '<svg viewBox="0 0 72 72" fill="none"><line x1="4" y1="36.5" x2="68" y2="36.5" stroke="white" stroke-width="3.2"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" fill="white" fill-opacity=".12"/><path d="M10 36.5 C18 36.5,26 60.5,36 60.5 S54 36.5,62 36.5" stroke="white" stroke-width="2.8" fill="none"/><circle cx="36" cy="20.5" r="9" fill="white"/></svg>';

    function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

    fetch(API + '/api/blog-posts/' + slug + '/read-next?limit=2')
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.success && data.posts && data.posts.length > 0) {
          grid.innerHTML = data.posts.map(function(p){
            var imgHTML;
            if (p.hero_image) {
              imgHTML = '<div class="rn-img"><img src="' + p.hero_image + '" alt="' + esc(p.hero_alt||p.title) + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></div>';
            } else {
              imgHTML = '<div class="rn-img" style="background:linear-gradient(140deg,#0f1a16 0%,#162420 50%,#0a0a0a 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;"><div style="opacity:.3;">' + logoSVG + '</div></div>';
            }
            return '<a href="/' + p.slug + '" style="text-decoration:none;color:inherit;"><div class="rn-card">' +
              imgHTML +
              '<div class="rn-body">' +
                '<span class="rn-cat ' + p.category_class + '">' + esc(p.category) + '</span>' +
                '<h3 class="rn-title">' + esc(p.title) + '</h3>' +
                '<div class="rn-meta">' + esc(p.date) + ' <span class="dot">&middot;</span> ' + esc(p.read_time) + '</div>' +
              '</div></div></a>';
          }).join('');
        }
      })
      .catch(function(){ /* silent fail — Read Next is non-critical */ });
  })();
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
  calculateReadTime,
  blogConfig
};