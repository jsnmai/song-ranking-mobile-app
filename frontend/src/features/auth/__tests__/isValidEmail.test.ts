// Unit tests for the isValidEmail regex.
// Focuses on the boundary between accepted and rejected inputs — the cases
// where regex implementations commonly diverge.
import { isValidEmail } from "../RegisterScreen"

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
