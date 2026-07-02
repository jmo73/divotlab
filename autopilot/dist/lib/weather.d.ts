/**
 * Tomorrow.io weather client for the autopilot pipeline.
 * Free tier: 500 calls/day, 25 calls/hour.
 * With 2-hour DB caching per course per day, a full tournament week uses ~20-30 calls.
 *
 * Cache strategy: DB-first (autopilot_weather_cache), then Tomorrow.io API.
 * The DB cache is checked in enrichment.ts via db.getWeatherCache().
 */
import type { ConditionsFlag } from './types';
export interface WeatherContext {
    windSpeedMph: number;
    windDirection: string;
    conditionsFlag: ConditionsFlag;
    tempF: number;
    precipChance: number;
    conditionsSummary: string;
    lat: number;
    lng: number;
}
export declare function getConditionsFlag(windMph: number, precipChance: number): ConditionsFlag;
export declare function interpretWind(speedMph: number): string;
/**
 * Get weather context for a course + date.
 * Checks DB cache first (2hr TTL), then calls Tomorrow.io.
 *
 * @param courseKey  Kebab-case course identifier (e.g. "tpc-sawgrass")
 * @param lat        Course latitude
 * @param lng        Course longitude
 * @param forecastDate  Date of the round (UTC)
 */
export declare function getWeatherContext(courseKey: string, lat: number, lng: number, forecastDate: Date): Promise<WeatherContext>;
/**
 * Fallback weather context when Tomorrow.io is unavailable.
 * Returns calm conditions so the pipeline can still run.
 */
export declare function fallbackWeatherContext(lat: number, lng: number): WeatherContext;
//# sourceMappingURL=weather.d.ts.map