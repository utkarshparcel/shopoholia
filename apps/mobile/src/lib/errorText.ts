/**
 * The text to show a person for a caught error: the API's own messages pass through, while
 * network failures ("Failed to fetch", "Network request failed"), timeouts, 5xx and schema dumps
 * become plain sentences. One helper for Play and Closet screens alike.
 */
export { closetAlertText as errorText } from '@/src/lib/closetScreenState';
