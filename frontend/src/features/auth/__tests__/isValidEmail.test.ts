// Unit tests for the isValidEmail regex.
// Focuses on the boundary between accepted and rejected inputs — the cases
// where regex implementations commonly diverge.
import { formatBirthdateParts, isAtLeast13, isValidEmail } from "../RegisterScreen"

describe("isValidEmail", () => {
    describe("valid", () => {
        it.each([
            "user@example.com",
            "user.name@example.com",
            "user+tag@example.com",
            "user@mail.example.com",
            "user@example.co.uk",
        ])("accepts %s", (email) => {
            expect(isValidEmail(email)).toBe(true)
        })
    })

    describe("invalid", () => {
        it.each([
            ["no TLD",                     "user@domain"],
            ["space in local part",        "user @domain.com"],
            ["empty domain before dot",    "user@.com"],
            ["no local part",              "@domain.com"],
            ["trailing dot in domain",     "user@domain."],
            ["double at sign",             "user@@domain.com"],
            ["no at sign",                 "userdomain.com"],
            ["empty string",               ""],
        ])("%s: rejects %s", (_, email) => {
            expect(isValidEmail(email)).toBe(false)
        })
    })
})

describe("isAtLeast13", () => {
    it("accepts a clearly eligible birthdate", () => {
        expect(isAtLeast13("2000-01-01")).toBe(true)
    })

    it("rejects a clearly under-13 birthdate", () => {
        expect(isAtLeast13("2020-01-01")).toBe(false)
    })

    it("rejects invalid dates", () => {
        expect(isAtLeast13("2020-02-31")).toBe(false)
        expect(isAtLeast13("not-a-date")).toBe(false)
    })
})

describe("formatBirthdateParts", () => {
    it("formats separate month day and year values for the backend", () => {
        expect(formatBirthdateParts("1", "2", "2003")).toBe("2003-01-02")
        expect(formatBirthdateParts("12", "31", "2003")).toBe("2003-12-31")
    })

    it("rejects incomplete or pasted compact dates", () => {
        expect(formatBirthdateParts("", "1", "2003")).toBeNull()
        expect(formatBirthdateParts("1", "1", "203")).toBeNull()
        expect(formatBirthdateParts("20030101", "", "")).toBeNull()
    })
})
