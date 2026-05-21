import { formatRelativeTime } from "../formatRelativeTime"

const NOW = new Date("2026-05-21T20:00:00Z")

describe("formatRelativeTime", () => {
    it("shows Just now for timestamps under 1 minute", () => {
        expect(formatRelativeTime("2026-05-21T19:59:30Z", NOW)).toBe("Just now")
    })

    it("shows minutes for 1 through 59 minutes", () => {
        expect(formatRelativeTime("2026-05-21T19:59:00Z", NOW)).toBe("1 min ago")
        expect(formatRelativeTime("2026-05-21T19:01:00Z", NOW)).toBe("59 mins ago")
    })

    it("shows hours starting at exactly 60 minutes through 23 hours", () => {
        expect(formatRelativeTime("2026-05-21T19:00:00Z", NOW)).toBe("1 hr ago")
        expect(formatRelativeTime("2026-05-20T21:00:00Z", NOW)).toBe("23 hrs ago")
    })

    it("shows Yesterday starting at exactly 24 hours", () => {
        expect(formatRelativeTime("2026-05-20T20:00:00Z", NOW)).toBe("Yesterday")
    })

    it("shows weekday and date for 2 through 6 days ago", () => {
        expect(formatRelativeTime("2026-05-18T20:00:00Z", NOW)).toBe("Mon 18")
    })

    it("shows month and date for 7+ days in the same year", () => {
        expect(formatRelativeTime("2026-01-19T20:00:00Z", NOW)).toBe("Jan 19")
    })

    it("shows month, date, and year for timestamps from a different year", () => {
        expect(formatRelativeTime("2025-12-31T20:00:00Z", NOW)).toBe("Dec 31 2025")
    })

    it("treats future timestamps as Just now", () => {
        expect(formatRelativeTime("2026-05-21T20:01:00Z", NOW)).toBe("Just now")
    })
})
