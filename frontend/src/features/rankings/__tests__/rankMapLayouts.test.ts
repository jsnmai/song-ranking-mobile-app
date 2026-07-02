// Focused unit tests for the Rank Map "genres" lens layout math — no cap, no
// rollup, busiest genre centered. Screen-level pill assertions live in
// RankMapScreen.test.tsx; this covers the actual placement.
import { constellationLayout, RankMapSong, UNKNOWN_GENRE } from "../rankmap/layouts"
import { RankingResponse } from "../../comparison/types"

function song(id: number, genre: string): RankMapSong {
    return {
        id,
        ranking: {} as RankingResponse,
        title: `Song ${id}`,
        artist: "Artist",
        cover: null,
        bucket: "like",
        score: 8,
        pos: id,
        genre,
        date: 0,
    }
}

describe("constellationLayout", () => {
    it("gives every distinct genre its own constellation, with no cap", () => {
        const genres = ["Pop", "Rock", "Jazz", "Hip-Hop", "Metal", "Folk", "Soul", "Funk", "Blues", "Disco"]
        const songs = genres.map((g, i) => song(i + 1, g))

        const cl = constellationLayout(songs, { w: 600, h: 600 })

        expect(cl.map((c) => c.genre).sort()).toEqual([...genres].sort())
    })

    it("puts the genre with the most songs dead center, at the world's middle", () => {
        const songs = [
            ...Array.from({ length: 5 }, (_, i) => song(i + 1, "Pop")),
            song(6, "Rock"),
            song(7, "Jazz"),
        ]

        const cl = constellationLayout(songs, { w: 600, h: 800 })

        const pop = cl.find((c) => c.genre === "Pop")
        expect(pop?.ctr).toEqual({ x: 300, y: 400 })
    })

    it("never centers 'Unknown', even when it's the largest group", () => {
        const songs = [
            ...Array.from({ length: 5 }, (_, i) => song(i + 1, UNKNOWN_GENRE)),
            song(6, "Rock"),
            song(7, "Jazz"),
        ]

        const cl = constellationLayout(songs, { w: 600, h: 800 })

        const unknown = cl.find((c) => c.genre === UNKNOWN_GENRE)
        const rock = cl.find((c) => c.genre === "Rock")
        expect(unknown?.ctr).not.toEqual({ x: 300, y: 400 })
        expect(rock?.ctr).toEqual({ x: 300, y: 400 })
    })

    it("still centers 'Unknown' when it's the only group (no real genre to swap with)", () => {
        const songs = Array.from({ length: 3 }, (_, i) => song(i + 1, UNKNOWN_GENRE))

        const cl = constellationLayout(songs, { w: 600, h: 800 })

        expect(cl).toHaveLength(1)
        expect(cl[0].ctr).toEqual({ x: 300, y: 400 })
    })

    it("spirals every other genre outward from the center without overlapping centers", () => {
        const genres = ["Pop", "Rock", "Jazz", "Hip-Hop", "Metal"]
        const songs = genres.map((g, i) => song(i + 1, g))

        const cl = constellationLayout(songs, { w: 600, h: 600 })

        const rest = cl.filter((c) => c.genre !== "Pop")
        rest.forEach((c) => expect(c.ctr).not.toEqual({ x: 300, y: 300 }))
        const unique = new Set(cl.map((c) => `${c.ctr.x.toFixed(2)},${c.ctr.y.toFixed(2)}`))
        expect(unique.size).toBe(cl.length)
    })
})
