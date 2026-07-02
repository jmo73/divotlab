"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const renderHtml_1 = require("../lib/renderHtml");
const imageGen_1 = require("../lib/imageGen");
const OUT_DIR = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(OUT_DIR, { recursive: true });
const DIM = { width: 1080, height: 1350 };
async function testLeaderboard() {
    const fields = (0, imageGen_1.leaderboardFields)({
        eventName: 'Travelers Championship · R2',
        courseConditions: 'TPC River Highlands',
        roundBadge: 'After R2',
        players: [
            { name: 'Viktor Hovland', score: -12, dgRating: 178, sgTotal: 4.1 },
            { name: 'Scottie Scheffler', score: -11, dgRating: 196, sgTotal: 3.7 },
            { name: 'Collin Morikawa', score: -10, dgRating: 182, sgTotal: 2.9 },
            { name: 'Rory McIlroy', score: -9, dgRating: 185, sgTotal: 2.4 },
            { name: 'Patrick Cantlay', score: -8, dgRating: 170, sgTotal: 1.8 },
        ],
        insight: 'Hovland leads with +4.1 SG: Approach through 36 holes — field avg is +0.8. Putting premium course rewarding ball-strikers early.',
        fieldContext: '',
    });
    const buf = await (0, renderHtml_1.renderHtmlTemplate)('leaderboard', fields, DIM);
    fs.writeFileSync(path.join(OUT_DIR, 'leaderboard-html.png'), buf);
    console.log('✓ leaderboard');
}
async function testPlayerSpotlight() {
    const fields = {
        BADGE: 'Player Spotlight',
        PLAYER_NAME: 'Viktor Hovland',
        CONTEXT: 'Travelers Championship · After Round 2',
        HERO_LABEL: 'SG: Total',
        HERO_VALUE: '+4.1',
        HERO_COLOR: '#5BBF85',
        HERO_SUB: '#1 in the field',
        STAT1_LABEL: 'SG: Approach',
        STAT1_VALUE: '+2.8',
        STAT2_LABEL: 'SG: Putting',
        STAT2_VALUE: '+0.9',
        STAT3_LABEL: 'DG Rating',
        STAT3_VALUE: '178',
        STAT4_LABEL: 'Win %',
        STAT4_VALUE: '12.4%',
        INSIGHT: 'Hovland is gaining strokes everywhere that matters at River Highlands. Ball-striking advantage over the field is the largest in 3 years at this event.',
    };
    const buf = await (0, renderHtml_1.renderHtmlTemplate)('player-spotlight', fields, DIM);
    fs.writeFileSync(path.join(OUT_DIR, 'player-spotlight-html.png'), buf);
    console.log('✓ player-spotlight');
}
async function testCourseProfile() {
    const fields = {
        BADGE: 'Course Profile',
        COURSE_NAME: 'TPC River Highlands',
        COURSE_META: 'Par 70 · 6,852 yds · Travelers Championship',
        REWARDS: 'Approach + Putting',
        HIST_SCORING: '-10.2 avg (2020–2025)',
        FIELD_AVG: '+0.4 SG today',
        KEY_STAT: 'SG: App explains 58% of scoring variance at this venue',
        INSIGHT: 'Bermuda greens reward elite putters, but the 6 par-4s under 430 yds create birdie chances that separate approach players from the field.',
    };
    const buf = await (0, renderHtml_1.renderHtmlTemplate)('course-profile', fields, DIM);
    fs.writeFileSync(path.join(OUT_DIR, 'course-profile-html.png'), buf);
    console.log('✓ course-profile');
}
async function testWeatherCard() {
    const fields = {
        BADGE: 'Conditions',
        EVENT_NAME: 'The Open Championship',
        ROUND_DATE: 'Friday · July 18',
        WIND_SPEED: '28',
        WIND_DIR: 'SW',
        WIND_ARROW_DEG: '225',
        WIND_DIR_TEMP: 'SW · 58°F · 20% rain',
        CONDITIONS_FLAG: 'DIFFICULT',
        CONDITIONS_COLOR: '#C9A84C',
        SCORING_IMPACT: 'Field scoring avg typically rises 2–3 shots in these conditions.',
        HIST_CONTEXT: 'Royal Troon avg +2.4 vs par when wind exceeds 25mph (2009–2023)',
    };
    const buf = await (0, renderHtml_1.renderHtmlTemplate)('weather-card', fields, DIM);
    fs.writeFileSync(path.join(OUT_DIR, 'weather-card-html.png'), buf);
    console.log('✓ weather-card');
}
async function main() {
    console.log('Rendering HTML templates...');
    await testLeaderboard();
    await testPlayerSpotlight();
    await testCourseProfile();
    await testWeatherCard();
    console.log(`\nAll saved → ${OUT_DIR}`);
}
main().catch(console.error);
//# sourceMappingURL=test-html-image.js.map