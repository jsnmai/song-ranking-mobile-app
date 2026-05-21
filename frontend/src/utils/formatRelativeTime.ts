const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
    const timestamp = new Date(isoTimestamp)
    const elapsedMs = Math.max(0, now.getTime() - timestamp.getTime())

    if (elapsedMs < MINUTE_MS) {
        return "Just now"
    }

    if (elapsedMs < HOUR_MS) {
        const minutes = Math.floor(elapsedMs / MINUTE_MS)
        return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`
    }

    if (elapsedMs < DAY_MS) {
        const hours = Math.floor(elapsedMs / HOUR_MS)
        return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`
    }

    if (elapsedMs < 2 * DAY_MS) {
        return "Yesterday"
    }

    if (elapsedMs < 7 * DAY_MS) {
        return `${DAY_LABELS[timestamp.getDay()]} ${timestamp.getDate()}`
    }

    const monthAndDate = `${MONTH_LABELS[timestamp.getMonth()]} ${timestamp.getDate()}`
    if (timestamp.getFullYear() === now.getFullYear()) {
        return monthAndDate
    }

    return `${monthAndDate} ${timestamp.getFullYear()}`
}
