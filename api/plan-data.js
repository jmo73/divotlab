/**
 * DIVOT LAB — Practice Plan Content Database
 * All weakness profiles, handicap tiers, and HTML builder functions.
 */

const PROFILES = {
  driving: {
    title: "Off the Tee",
    weekColors: ["var(--green)","var(--blue)","var(--green-light)","var(--blue-mid)"],
    mistakes: [
      ["Grip pressure too tight", "Creates tension in your forearms and restricts wrist hinge through the takeaway. Tour average grip pressure is 4 out of 10. Most amateurs grip at 7-8. Loosen your hands and you'll gain both accuracy and distance."],
      ["Ball position too far back", "Promotes a steep angle of attack, which increases spin and reduces carry. For driver, the ball should be opposite your lead heel — further forward than you probably think. A forward ball position lets you catch it on the upswing."],
      ["Early extension (hips toward ball)", "When your hips push toward the ball in the downswing instead of rotating, it forces your hands to compensate — usually with a block right or a flip-hook left. Your belt buckle should stay behind the ball at impact."],
      ["Swinging at 100% effort", "The difference between 100% and 85% effort off the tee is only 8-12 yards of carry. But the accuracy cost is 30% or more. A controlled swing finds the short grass far more often."],
      ["Ignoring course conditions", "A 10mph crosswind moves the ball 15-25 yards. Elevation changes affect distance by roughly 1 yard per foot. Aim for the wide side of the fairway and use conditions instead of fighting them."]
    ],
    bodyKeys: [
      ["Shoulder turn", "Your lead shoulder should feel like it turns under your chin, not around your body. At the top of the backswing, your back should face the target. This creates the coil that generates effortless power."],
      ["Weight transfer", "At the top, 60% of your weight should sit on your trail foot. Start the downswing with a subtle lateral shift of the hips toward the target before rotating. This sequence is what the pros call 'the slot.'"],
      ["Arm-body connection", "Maintain the triangle formed by your arms and chest through the takeaway. If the triangle breaks early, your hands have taken over. Feel like your chest and arms move as one unit for the first two feet."],
      ["Trail elbow position", "In the downswing, your trail elbow should stay connected to your ribcage. Imagine holding a towel under your trail arm. If the towel falls, your arms have separated from your body."],
      ["Impact wrist position", "At impact, your lead wrist should be slightly bowed (flexed), not cupped. This delofts the driver slightly and produces a penetrating ball flight that holds its line in wind."]
    ],
    drills: [
      { name: "Feet-Together Driver", time: "10 min", reps: "15 balls", purpose: "Balance & tempo", desc: "Hit driver with your feet touching. You physically cannot swing out of your shoes with a narrow base, so this forces smooth tempo and centered contact. If you can carry it 200+ yards, your balance is excellent." },
      { name: "Alignment Stick Gate", time: "15 min", reps: "20 balls", purpose: "Accuracy", desc: "Place two alignment sticks 10 yards out, 6 feet apart. Every drive must land between them. Narrow the gate by one foot each session. Track your hit percentage — this is your key improvement metric." },
      { name: "Tee Height Ladder", time: "10 min", reps: "15 balls", purpose: "Launch control", desc: "Hit 5 drives with the tee low, 5 at normal height, and 5 extra high. Observe trajectory and dispersion changes. This teaches launch angle control without changing your swing." },
      { name: "3-2-1 Pressure Drill", time: "10 min", reps: "6 balls", purpose: "Performing under pressure", desc: "Visualize a tight fairway. Hit 3 to the target, then 2, then 1 final 'money ball.' Score: 3pts fairway, 1pt rough, 0 miss. Goal: 10+ out of 18 possible." }
    ],
    weeklyPlan: [
      ["Foundation: Alignment & Setup", [
        "Every session: alignment sticks on the ground, video your setup from behind and down-the-line.",
        "Fix ball position first — this single adjustment eliminates 40% of tee shot errors.",
        "Check grip pressure before every swing. If your forearms are tense, you're gripping too hard.",
        "<strong>End-of-week test:</strong> Hit 10 drives and measure fairway percentage. Record your baseline."
      ]],
      ["Tempo & Rhythm", [
        "Use a metronome app at 72 BPM. Backswing on beat 1, downswing on beat 2.",
        "This eliminates the 'quick from the top' fault that causes most amateur drives to leak right.",
        "Alternate between the Feet-Together drill and normal stance to groove the feel.",
        "<strong>End-of-week test:</strong> 10 drives with metronome. Track fairway % vs. Week 1."
      ]],
      ["Shot Shaping", [
        "Pick one shape — a reliable 10-yard fade OR draw. Commit to it for the entire week.",
        "Having a go-to shape eliminates one side of the course — the biggest strategic advantage off the tee.",
        "Practice the Alignment Stick Gate with your chosen shape.",
        "<strong>End-of-week test:</strong> Hit 10 drives. Did 7+ move in the intended direction?"
      ]],
      ["Course Simulation", [
        "Every drive has a target, a shape, and a consequence. No more 'just hitting it.'",
        "Alternate between tight and wide fairways. Vary your target with each ball.",
        "Run the 3-2-1 Pressure Drill twice and track your score.",
        "<strong>End-of-week test:</strong> Play 18 imaginary holes. Track fairways hit out of 14."
      ]]
    ],
    intro: "Your diagnostic identified driving as your biggest opportunity. Off the tee, the goal isn't maximum distance — it's finding the fairway with enough length to set up a reasonable approach. The data is clear: a ball in the fairway at 240 yards outscores a ball in the trees at 280 almost every time."
  },
  approach: {
    title: "Approach Play",
    weekColors: ["var(--blue)","var(--green)","var(--blue-mid)","var(--green-light)"],
    mistakes: [
      ["Club selection ego", "78% of amateur approach shots finish short of the pin. The average PGA Tour 7-iron carries 172 yards; the average 15-handicap carries it 148. Take one more club than you think you need."],
      ["Aiming at the flag", "The pin is a trap. Center-green approach play gains you 1.5 strokes per round compared to flag-hunting. A ball anywhere on the green is a two-putt par opportunity."],
      ["Inconsistent ball position", "For mid-irons: 1-2 ball widths ahead of center. Short irons: center. Moving ball position around creates wildly inconsistent contact — fat one shot, thin the next."],
      ["Deceleration through impact", "When you decelerate, the clubhead passes your hands, the face opens, and you chunk or push it. Pick a club, trust the yardage, and swing with conviction."],
      ["Ignoring the lie", "A ball in rough flies 5-15 yards shorter with less spin. Above your feet = draw. Below = fade. Account for the lie or your club selection is wrong before you swing."]
    ],
    bodyKeys: [
      ["Weight distribution", "At address, weight should slightly favor the lead foot — roughly 55/45. And it stays there. Hanging back on the trail foot is the most common cause of thin and fat iron shots."],
      ["Hands ahead at impact", "Feel the grip end pointing at your lead hip at impact, not at the ball. This ensures forward shaft lean, ball compression, and a divot after the ball — not before it."],
      ["Spine angle maintenance", "The urge to look up early pulls your chest up and thins the ball. Keep your chest pointing at the ground through impact. Listen for clean compression — that's your cue."],
      ["Ball-divot sequence", "Think 'ball then divot.' Your low point should be 2-4 inches ahead of the ball. Place a tee one inch in front and try to clip it on the through-swing."],
      ["Inside delivery path", "Your trail arm delivers the club from inside the target line. If it crosses over, you'll pull-hook or slice. Feel the trail elbow drop into your side."]
    ],
    drills: [
      { name: "9-Shot Grid", time: "20 min", reps: "27 balls", purpose: "Ball-flight control", desc: "Using a 7-iron, hit 3 shots for each of 9 flights: low/mid/high × draw/straight/fade. This builds full command of trajectory and shape. It's hard — that's the point." },
      { name: "Distance Ladder", time: "15 min", reps: "15 balls", purpose: "Carry accuracy", desc: "Hit 3 shots each at 100, 120, 140, 160, 180 yards. Note cluster tightness at each distance. Tight clusters = reliable distance control." },
      { name: "Quadrant Targeting", time: "15 min", reps: "12 balls", purpose: "Green reading from distance", desc: "From 150 yards, pick a quadrant (front-left, back-right, etc.). Score: 2pts correct quadrant, 1pt green, 0 miss. Goal: 16+ out of 24." },
      { name: "Random Lie Challenge", time: "10 min", reps: "10 balls", purpose: "Adaptability", desc: "Toss 5 balls into different lies — rough, hardpan, uphill, downhill. Assess, pick the right club, choose a target, execute. No two shots the same." }
    ],
    weeklyPlan: [
      ["Foundation: Contact Quality", [
        "Every session: focus on striking ball first, then ground. Use a towel 2\" behind the ball to prevent fat contact.",
        "Hit only mid-irons (6, 7, 8) this week. No driver, no wedges. Pure contact focus.",
        "Count divots in front of the ball vs. behind. The ratio tells you everything.",
        "<strong>End-of-week test:</strong> 10 shots with 7-iron. How many produce a divot ahead of the ball?"
      ]],
      ["Distance Control", [
        "Map your exact carry distances with every iron using a rangefinder at the range.",
        "Most amateurs overestimate carry by 10-15 yards — know your real numbers.",
        "Run the Distance Ladder drill twice per session. Track cluster tightening.",
        "<strong>End-of-week test:</strong> Write your actual carry for each iron. Tape it in your bag."
      ]],
      ["Trajectory Control", [
        "Learn a stock shot, then a knockdown (grip down, ball back, shorter finish) that flies 10-15 yards shorter.",
        "The knockdown is essential for wind. Practice 9-Shot Grid with just 3 flights: stock, knockdown, high.",
        "Alternate between stock and knockdown from the same yardage.",
        "<strong>End-of-week test:</strong> Can you reliably hit knockdown 10 yards shorter than stock?"
      ]],
      ["Strategic Green Targeting", [
        "This week: aim center-third of every green. Never aim at a flag.",
        "Track GIR percentage each session. Center-green strategy alone will surprise you.",
        "Run Quadrant Targeting and match landing zone to aim point.",
        "<strong>End-of-week test:</strong> 18 imaginary approaches. GIR out of 18. Goal: 8+ for mid-handicaps."
      ]]
    ],
    intro: "Your diagnostic identified approach play as your biggest opportunity. Strokes gained data at every level shows approach is the single highest-leverage skill in golf. The correlation between SG: Approach and scoring average is stronger than any other category."
  },
  short_game: {
    title: "Short Game",
    weekColors: ["var(--green)","var(--green-light)","var(--blue)","var(--blue-mid)"],
    mistakes: [
      ["One-chip-fits-all approach", "A tight lie off hardpan demands a different setup than fluffy rough. You need at least three shots: a low runner, a standard pitch, and a high lob."],
      ["Flipping wrists through impact", "When wrists break down, the leading edge digs (chunk) or bounces (blade). Your hands must stay ahead of the clubhead through the strike."],
      ["Standing too far from the ball", "Chipping is precision from close range. Stand closer, grip down, compact motion. Distance from the ball = more moving parts = more inconsistency."],
      ["Not reading break for chips", "Your chip lands and rolls like a putt. If the green breaks and you don't account for it, even a perfect strike rolls 10 feet past on the wrong side."],
      ["Avoiding bunker practice", "You face 2-3 bunker shots per round with no technique. This is pure lost strokes. Bunker play is actually simple once you understand the mechanics — the club never touches the ball."]
    ],
    bodyKeys: [
      ["Address position", "Narrow stance, 70% weight on lead foot, ball back of center, hands ahead. This creates a naturally descending blow — no manipulation needed."],
      ["Shoulder pendulum", "The chipping stroke is driven by shoulders, not wrists. Wrists stay firm and quiet through impact. Rock shoulders back and through — hands go along for the ride."],
      ["Bunker technique", "Open the face BEFORE you grip. Open stance, swing along stance line (not at target). The open face adds bounce — the club glides under the ball on a cushion of sand."],
      ["Landing spot focus", "Before every chip, pick exactly where the ball should LAND, not finish. Visualize the landing spot, chip to it, and let club selection and the green do the rest."],
      ["Rotation on pitch shots", "On 30-50 yard pitches, your body must keep rotating through impact. When the body stops, wrists flip — that's when you skull it over the green. Belt buckle faces target at finish."]
    ],
    drills: [
      { name: "Up-and-Down Challenge", time: "20 min", reps: "10 balls", purpose: "Scrambling %", desc: "Drop 10 balls around the green — rough, fringe, bunker. One chip + one putt each. Track up-and-down rate. Tour avg: 60%. Goal: above 40%. Record every session." },
      { name: "Landing Zone Towel", time: "15 min", reps: "20 chips", purpose: "Landing precision", desc: "Place a towel on the green at your landing spot. Hit 20 chips trying to land on the towel. Trains your eyes to see landing spots instead of the hole — the fundamental shift in how good chippers think." },
      { name: "3-Club Rotation", time: "15 min", reps: "15 chips", purpose: "Loft as a tool", desc: "Same spot: 5 chips with 56°, 5 with PW, 5 with 8-iron. Watch trajectory and rollout change dramatically. This teaches loft as a variable — not just one club for everything." },
      { name: "Par-18 Short Game", time: "20 min", reps: "18 holes", purpose: "Competition simulation", desc: "Create 18 'holes' around the green. Each = chip + putt. Par is 2 (36 total). Under 40 is solid. Under 36 is excellent. Play weekly and track the trend — your most important benchmark." }
    ],
    weeklyPlan: [
      ["The Stock Chip", [
        "Master one reliable chip: low flight, predictable roll. Use PW or 52°.",
        "Lock in technique: weight forward, hands forward, ball back, shoulder pendulum. No wrists.",
        "Hit 50 chips per session to one target. Same club, same shot, same routine.",
        "<strong>End-of-week test:</strong> 10 chips from fringe. How many stop within 6 feet of the hole?"
      ]],
      ["Adding Variety: The Lob", [
        "Learn a high-trajectory shot for stopping the ball quickly. Open face, wide stance, ball forward, accelerate.",
        "Alternate between stock chip and lob from the same spot. Feel the difference.",
        "Never decelerate on lob shots — that's where the skull comes from.",
        "<strong>End-of-week test:</strong> From 15 yards, pin cut tight — 5 out of 10 within 8 feet?"
      ]],
      ["Bunker Fundamentals", [
        "Dedicate entire short game portion to bunker play this week.",
        "Draw a line 2\" behind the ball in sand. Enter sand at the line — every time.",
        "The swing is bigger than you think. 15-yard bunker shot = 30-yard swing. Sand absorbs energy.",
        "<strong>End-of-week test:</strong> 10 bunker shots. How many land on the green?"
      ]],
      ["Pressure & Competition", [
        "Play up-and-down games with consequences. Miss = add a penalty stroke.",
        "Par-18 Short Game drill twice this week. Beat your previous score both times.",
        "Simulate needing to get up-and-down on 18 to break your target score.",
        "<strong>End-of-week test:</strong> Final Par-18 score for the cycle. Record as benchmark."
      ]]
    ],
    intro: "Your diagnostic identified short game as your highest-leverage area. Tour data shows the difference between a 15-handicap and a 10-handicap is almost entirely around-the-green performance. A good chip saves par; a bad chip makes double. There's more variance within 50 yards than anywhere else."
  },
  putting: {
    title: "Putting",
    weekColors: ["var(--blue-mid)","var(--green)","var(--blue)","var(--green-light)"],
    mistakes: [
      ["No consistent pre-putt routine", "Tour pros execute the exact same routine every time — same practice strokes, same looks, same timing. Without a routine, every putt feels like a new challenge."],
      ["Deceleration on short putts", "The putter must accelerate through the ball, even on 3-footers. A decelerating stroke wanders offline. Fix: make follow-through longer than backstroke."],
      ["Reading from over the ball", "Read from three positions: behind the ball, behind the hole, and the low side. The low side always reveals the most break."],
      ["Ignoring speed on long putts", "From 30+ feet, speed beats line for three-putt avoidance. Getting within a 3-foot circle should be the goal on every putt over 20 feet."],
      ["Aiming low on breaking putts", "Putts that miss low never had a chance to go in. Train yourself to play more break — err high side. Every high-side miss at least had the opportunity."]
    ],
    bodyKeys: [
      ["Eye position", "Eyes directly over the ball or slightly inside the target line. Place a mirror on the ground and check — this is the most important alignment fundamental in putting."],
      ["Grip pressure", "3 out of 10. Heavy pressure kills feel and distance control. Imagine holding a tube of toothpaste without squeezing any out. That's the pressure."],
      ["Shoulder pendulum", "Putting stroke is a shoulder-driven pendulum. Arms, wrists, hands are quiet connectors. Lower body does not move at all."],
      ["Head stability", "Keep your head completely still. Don't watch the ball leave — listen for the drop. Head movement during the stroke is the #1 putting fault at every handicap."],
      ["Backswing calibration", "Match backstroke length to putt distance. 40-footer needs much longer backstroke than 10-footer. Practice with eyes closed to build internal calibration."]
    ],
    drills: [
      { name: "Gate Drill", time: "10 min", reps: "20 putts", purpose: "Stroke path", desc: "Two tees just wider than putter head, 3 feet from hole. Stroke through without touching either tee. Goal: 18/20 clean. Do this every session — it's the foundation drill." },
      { name: "Lag Putting Circle", time: "15 min", reps: "20 putts", purpose: "3-putt elimination", desc: "Ring of tees 3 feet around the hole. From 30, 40, 50 feet — stop every ball inside the circle. Tour players: 85%+. Get above 70% and three-putts virtually disappear." },
      { name: "Clock Drill", time: "15 min", reps: "12+ putts", purpose: "Short putt confidence", desc: "Balls at 3, 6, 9, 12 o'clock at 4 feet. Make all 4 to advance to 5 feet, then 6. Miss = restart that distance. Builds 'I don't miss inside 5 feet' confidence." },
      { name: "Speed Ladder", time: "10 min", reps: "15 putts", purpose: "Distance calibration", desc: "Tees at 10, 20, 30, 40, 50 feet. 3 putts each. Every putt within 3 feet of the tee. Pure speed calibration — the most transferable skill to actual rounds." }
    ],
    weeklyPlan: [
      ["Stroke Mechanics", [
        "Gate Drill and mirror drill every session to lock in path and eye position.",
        "Establish your pre-putt routine: same looks, same practice strokes, same trigger.",
        "This week builds a repeatable stroke — not about holing putts.",
        "<strong>End-of-week test:</strong> 20 putts through gate from 3 feet. How many clean?"
      ]],
      ["Speed Control", [
        "Focus entirely on lag putting. From 20+ feet, goal is NOT to make it — leave within 3 feet.",
        "Speed Ladder twice per session. Track 3-foot percentages.",
        "On the course: count three-putts. Write the number after every round.",
        "<strong>End-of-week test:</strong> 10 putts from 40 feet. How many finish inside 3 feet?"
      ]],
      ["Short Putt Mastery", [
        "Clock Drill from 3-6 feet is your primary exercise. Miss = start over.",
        "Build confidence to never miss inside 5 feet. This eliminates yips anxiety.",
        "On the course: commit to your line on every short putt. No second-guessing.",
        "<strong>End-of-week test:</strong> 20 putts from 4 feet. Goal: make 17+."
      ]],
      ["Green Reading & Integration", [
        "Before every practice putt: predict break direction and amount. Then hit it. Were you right?",
        "Track read accuracy — green reading is learnable, not intuition.",
        "Combine all drills: Gate, Speed Ladder, Clock. Full 30-minute integrated session.",
        "<strong>End-of-week test:</strong> 18 random putts on practice green. Total putts under 30."
      ]]
    ],
    intro: "Your diagnostic identified putting as your primary opportunity. Putting accounts for roughly 40% of all strokes, yet most amateurs spend less than 10% of practice time on it. Cutting three-putts in half saves 1.5-2 strokes immediately — no swing changes required."
  }
};

// Map quiz weakness keys to profile keys
const WEAKNESS_MAP = {
  driving: 'driving',
  approach: 'approach',
  shortGame: 'short_game',
  putting: 'putting'
};

const TIERS = {
  beginner: { label: "25+", name: "Beginner", target: "Break 100", projected: "8-15 strokes", swing: 35, short: 30, putt: 25, mgmt: 10, message: "At your level, the fastest improvement comes from eliminating penalty strokes and three-putts. We're not chasing perfection — we're building consistency and removing the blow-up holes that inflate your score." },
  high:     { label: "15-24", name: "High", target: "Break 90", projected: "5-10 strokes", swing: 30, short: 30, putt: 25, mgmt: 15, message: "You have the fundamentals. Now it's about sharpening your short game and eliminating big misses. Strokes gained data shows approach play and scrambling are where mid-to-high handicaps gain the most ground." },
  mid:      { label: "8-14", name: "Mid", target: "Break 80", projected: "3-6 strokes", swing: 25, short: 30, putt: 25, mgmt: 20, message: "You're within striking distance of single digits. The difference between a 12 and a 7 is almost entirely short game and putting. Your full swing is good enough — your scoring needs to catch up." },
  low:      { label: "0-7", name: "Low", target: "Scratch", projected: "1-3 strokes", swing: 25, short: 25, putt: 25, mgmt: 25, message: "At your level, marginal gains come from course management, pressure putting, and eliminating mental mistakes. We're optimizing, not overhauling." }
};

function getTier(handicap) {
  const h = parseFloat(handicap);
  if (h >= 25) return 'beginner';
  if (h >= 15) return 'high';
  if (h >= 8) return 'mid';
  return 'low';
}

const GOAL_OPTIONS = [
  "Break 100 consistently",
  "Break 90 for the first time",
  "Break 80 for the first time",
  "Get to single-digit handicap",
  "Get to scratch",
  "Stop three-putting so much",
  "Hit more fairways off the tee",
  "Improve my iron striking",
  "Get up-and-down more often",
  "Build a consistent pre-shot routine",
  "Play more confidently under pressure",
  "Lower my scoring average by 3+ strokes"
];

function buildMistakesHTML(profile) {
  return profile.mistakes.map((m, i) => `<div class="card numbered">
  <div class="num">${i + 1}</div>
  <div class="card-title">${m[0]}</div>
  <div class="card-body">${m[1]}</div>
</div>`).join('\n');
}

function buildBodyKeysHTML(profile) {
  return profile.bodyKeys.map((k, i) => `<div class="checkpoint">
  <div class="cp-label">Checkpoint ${i + 1}</div>
  <div class="cp-title">${k[0]}</div>
  <div class="cp-body">${k[1]}</div>
</div>`).join('\n');
}

function buildDrillsHTML(profile) {
  return profile.drills.map(d => `<div class="drill-card">
  <div class="drill-name">${d.name}</div>
  <div class="drill-meta">${d.time}  &bull;  ${d.reps}  &bull;  ${d.purpose}</div>
  <div class="drill-desc">${d.desc}</div>
</div>`).join('\n');
}

function buildWeeklyHTML(profile) {
  const colors = profile.weekColors;
  return profile.weeklyPlan.map((w, i) => {
    const bullets = w[1].map(b => `    <li>${b}</li>`).join('\n');
    return `<div class="week-card">
  <div class="week-header">
    <div class="week-num" style="background:${colors[i]};">${i + 1}</div>
    <div><div class="week-label">Week ${i + 1}</div><div class="week-title">${w[0]}</div></div>
  </div>
  <ul>
${bullets}
  </ul>
</div>`;
  }).join('\n');
}

module.exports = {
  PROFILES,
  WEAKNESS_MAP,
  TIERS,
  GOAL_OPTIONS,
  getTier,
  buildMistakesHTML,
  buildBodyKeysHTML,
  buildDrillsHTML,
  buildWeeklyHTML
};