"use strict";
/**
 * Tomorrow.io weather client for the autopilot pipeline.
 * Free tier: 500 calls/day, 25 calls/hour.
 * With 2-hour DB caching per course per day, a full tournament week uses ~20-30 calls.
 *
 * Cache strategy: DB-first (autopilot_weather_cache), then Tomorrow.io API.
 * The DB cache is checked in enrichment.ts via db.getWeatherCache().
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConditionsFlag = getConditionsFlag;
exports.interpretWind = interpretWind;
exports.getWeatherContext = getWeatherContext;
exports.fallbackWeatherContext = fallbackWeatherContext;
const config_1 = require("./config");
const db_1 = require("./db");
const BASE_URL = 'https://api.tomorrow.io/v4/weather/forecast';
// ─── Helpers ──────────────────────────────────────────────────────────────────
function mpsToMph(mps) {
    return Math.round(mps * 2.237);
}
function celsiusToF(c) {
    return Math.round(c * 9 / 5 + 32);
}
function degreesToCardinal(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return dirs[Math.round(deg / 45)];
}
function getConditionsFlag(windMph, precipChance) {
    if (windMph < 10 && precipChance < 20)
        return 'calm';
    if (windMph < 18 && precipChance < 40)
        return 'moderate';
    if (windMph < 28 || precipChance > 50)
        return 'difficult';
    return 'severe';
}
function interpretWind(speedMph) {
    if (speedMph < 8)
        return 'calm conditions — expect low scoring';
    if (speedMph < 15)
        return 'light wind — minimal scoring impact';
    if (speedMph < 22)
        return `moderate wind (${speedMph}mph) — approach accuracy premium`;
    if (speedMph < 30)
        return `significant wind (${speedMph}mph) — scoring typically rises 2-3 shots`;
    return `severe wind (${speedMph}mph) — field-wide scoring disruption expected`;
}
function buildConditionsSummary(windMph, windDir, tempF, precipChance) {
    const parts = [];
    if (windMph >= 8)
        parts.push(`${windMph}mph ${windDir} wind`);
    if (precipChance >= 30)
        parts.push(`${precipChance}% precip chance`);
    parts.push(`${tempF}°F`);
    return parts.join(', ');
}
/**
 * From an hourly forecast array, pick the hours most relevant to tournament play
 * (roughly 8am–6pm local). Returns the average/peak values for the window.
 */
function extractPlayingWindowStats(hourly, forecastDate) {
    const dateStr = forecastDate.toISOString().slice(0, 10);
    const playingHours = hourly.filter(h => {
        const hDate = h.time.slice(0, 10);
        const hHour = parseInt(h.time.slice(11, 13));
        return hDate === dateStr && hHour >= 8 && hHour <= 18;
    });
    if (playingHours.length === 0) {
        // Fallback: first available hour
        const fallback = hourly[0]?.values;
        return {
            windSpeedMph: mpsToMph(fallback?.windSpeed ?? 0),
            windDir: fallback?.windDirection ?? 0,
            tempF: celsiusToF(fallback?.temperature ?? 20),
            precipChance: fallback?.precipitationProbability ?? 0,
        };
    }
    const windMphs = playingHours.map(h => mpsToMph(h.values.windSpeed));
    const precipChances = playingHours.map(h => h.values.precipitationProbability);
    const temps = playingHours.map(h => celsiusToF(h.values.temperature));
    const windDirs = playingHours.map(h => h.values.windDirection);
    return {
        windSpeedMph: Math.max(...windMphs), // peak wind during play
        windDir: windDirs[Math.floor(windDirs.length / 2)], // mid-day direction
        tempF: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
        precipChance: Math.max(...precipChances),
    };
}
// ─── Main fetch ───────────────────────────────────────────────────────────────
/**
 * Get weather context for a course + date.
 * Checks DB cache first (2hr TTL), then calls Tomorrow.io.
 *
 * @param courseKey  Kebab-case course identifier (e.g. "tpc-sawgrass")
 * @param lat        Course latitude
 * @param lng        Course longitude
 * @param forecastDate  Date of the round (UTC)
 */
async function getWeatherContext(courseKey, lat, lng, forecastDate) {
    // Check DB cache (2hr TTL managed by the DB layer)
    const cached = await (0, db_1.getWeatherCache)(courseKey, forecastDate);
    if (cached)
        return cached;
    // Fetch from Tomorrow.io
    const params = new URLSearchParams({
        location: `${lat},${lng}`,
        fields: 'windSpeed,windDirection,temperature,precipitationProbability,weatherCode',
        timesteps: '1h',
        units: 'metric',
        apikey: config_1.config.weather.apiKey,
    });
    const res = await fetch(`${BASE_URL}?${params}`);
    if (res.status === 429) {
        throw new Error('Tomorrow.io rate limit hit (25/hr or 500/day). Using fallback conditions.');
    }
    if (!res.ok) {
        throw new Error(`Tomorrow.io API error ${res.status}`);
    }
    const data = (await res.json());
    const hourly = data.timelines?.hourly ?? [];
    const stats = extractPlayingWindowStats(hourly, forecastDate);
    const windDir = degreesToCardinal(stats.windDir);
    const flag = getConditionsFlag(stats.windSpeedMph, stats.precipChance);
    const summary = buildConditionsSummary(stats.windSpeedMph, windDir, stats.tempF, stats.precipChance);
    const context = {
        windSpeedMph: stats.windSpeedMph,
        windDirection: windDir,
        conditionsFlag: flag,
        tempF: stats.tempF,
        precipChance: stats.precipChance,
        conditionsSummary: summary,
        lat,
        lng,
    };
    // Store in DB cache (2hr TTL set by db layer)
    await (0, db_1.setWeatherCache)(courseKey, forecastDate, lat, lng, data, context);
    return context;
}
/**
 * Fallback weather context when Tomorrow.io is unavailable.
 * Returns calm conditions so the pipeline can still run.
 */
function fallbackWeatherContext(lat, lng) {
    return {
        windSpeedMph: 0,
        windDirection: 'N',
        conditionsFlag: 'calm',
        tempF: 72,
        precipChance: 0,
        conditionsSummary: 'conditions unavailable',
        lat,
        lng,
    };
}
//# sourceMappingURL=weather.js.map