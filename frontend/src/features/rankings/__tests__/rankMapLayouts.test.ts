// Focused unit tests for the Rank Map layout math — placement (no cap, busiest
// genre centered) and, for all three lenses, that song orbs never actually
// overlap in world space (which is what makes zooming read as "naturally
// dynamic" — the camera only scales/pans a layout that was already decluttered
// once). Screen-level pill assertions live in RankMapScreen.test.tsx.
import { constellationLayout, enrichRankings, gravityLayout, nebulaLayout, RankMapSong, UNKNOWN_GENRE } from "../rankmap/layouts"
import { RankingResponse } from "../../comparison/types"

function ranking(coverUrl: string): RankingResponse {
    return {
        id: 1,
        song_id: 1,
        bucket: "like",
        position: 1,
        score: 8,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        song: {
            id: 1,
            deezer_id: null,
            isrc: null,
            title: "Song",
            artist: "Artist",
            artist_deezer_id: null,
            album: "Album",
            cover_url: coverUrl,
            preview_url: null,
            genre_deezer: null,
            musicbrainz_id: null,
            genres_mb: null,
            release_year: null,
            spotify_energy: null,
            spotify_valence: null,
            spotify_tempo: null,
            spotify_danceability: null,
            metadata_enriched_at: null,
            spotify_enriched_at: null,
            global_avg_score: null,
            global_rating_count: 0,
            created_at: "2026-01-01T00:00:00Z",
        },
    }
}

function song(id: number, genre: string, opts: { score?: number; bucket?: RankMapSong["bucket"] } = {}): RankMapSong {
    return {
        id,
        ranking: {} as RankingResponse,
        title: `Song ${id}`,
        artist: "Artist",
        cover: null,
        bucket: opts.bucket ?? "like",
        score: opts.score ?? 8,
        pos: id,
        genre,
        date: 0,
    }
}

// Fails with the offending pair's indices/distance if any two circles overlap
// by more than a small floating-point tolerance.
function assertNoOverlap(circles: { x: number; y: number; r: number }[], label: string) {
    for (let i = 0; i < circles.length; i++) {
        for (let j = i + 1; j < circles.length; j++) {
            const a = circles[i]
            const b = circles[j]
            const dist = Math.hypot(b.x - a.x, b.y - a.y)
            const minDist = a.r + b.r
            if (dist < minDist - 0.5) {
                throw new Error(
                    `${label}: overlap between #${i} and #${j} — center distance ${dist.toFixed(2)} < required ${minDist.toFixed(2)}`,
                )
            }
        }
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

    it("keeps every song orb from overlapping, within or across constellations, even when one genre dominates", () => {
        const songs = [
            ...Array.from({ length: 50 }, (_, i) => song(i + 1, "Pop", { score: 4 + (i % 6) })),
            song(51, "Rock"),
            song(52, "Jazz"),
        ]

        const cl = constellationLayout(songs, { w: 900, h: 900 })

        const circles = cl.flatMap((c) => c.nodes.map((n) => ({ x: n.x, y: n.y, r: n.size / 2 })))
        assertNoOverlap(circles, "constellation nodes")
    })

    it("keeps many similarly-sized genre clusters from overlapping each other", () => {
        // 40 distinct genres of 5-15 songs each — every cluster needs mutual
        // repositioning against its neighbors, not just one dominant cluster.
        const songs: RankMapSong[] = []
        let id = 1
        for (let g = 0; g < 40; g++) {
            const count = 5 + (g % 11)
            for (let k = 0; k < count; k++) songs.push(song(id++, `Genre${g}`, { score: 3 + (k % 7) }))
        }

        const cl = constellationLayout(songs, { w: 1400, h: 1400 })

        const circles = cl.flatMap((c) => c.nodes.map((n) => ({ x: n.x, y: n.y, r: n.size / 2 })))
        assertNoOverlap(circles, "constellation nodes (40 clusters)")
    })
})

describe("gravityLayout", () => {
    it("keeps planets from overlapping the sun or each other, even with many similar scores", () => {
        const songs = Array.from({ length: 80 }, (_, i) => song(i + 1, "Pop", { score: 7 + (i % 3) * 0.1 }))

        const { planets, maxR } = gravityLayout(songs, { cx: 300, cy: 300, minR: 46, maxR: 200 })

        const circles = [
            { x: 300, y: 300, r: 37 },
            ...planets.map((p) => ({ x: p.x, y: p.y, r: p.size / 2 })),
        ]
        assertNoOverlap(circles, "gravity planets")
        expect(planets).toHaveLength(songs.length - 1)
        expect(maxR).toBeGreaterThan(0)
    })

    it("keeps 500 songs crammed into a 0.2-point score band from overlapping (extreme density)", () => {
        const songs = Array.from({ length: 500 }, (_, i) => song(i + 1, "Pop", { score: 7 + (i % 5) * 0.05 }))

        const { planets } = gravityLayout(songs, { cx: 300, cy: 300, minR: 46, maxR: 200 })

        const circles = [
            { x: 300, y: 300, r: 37 },
            ...planets.map((p) => ({ x: p.x, y: p.y, r: p.size / 2 })),
        ]
        assertNoOverlap(circles, "gravity planets (extreme density)")
    })

    it("grows maxR for larger libraries instead of cramming everyone into the same ring", () => {
        const small = gravityLayout(
            Array.from({ length: 5 }, (_, i) => song(i + 1, "Pop")),
            { cx: 300, cy: 300, minR: 46, maxR: 200 },
        )
        const big = gravityLayout(
            Array.from({ length: 200 }, (_, i) => song(i + 1, "Pop")),
            { cx: 300, cy: 300, minR: 46, maxR: 200 },
        )

        expect(big.maxR).toBeGreaterThan(small.maxR)
    })
})

describe("nebulaLayout", () => {
    it("keeps stars from overlapping across all three clouds, even when heavily lopsided", () => {
        const songs = [
            ...Array.from({ length: 120 }, (_, i) => song(i + 1, "Pop", { bucket: "like", score: 3 + (i % 7) })),
            ...Array.from({ length: 3 }, (_, i) => song(200 + i, "Pop", { bucket: "alright" })),
            ...Array.from({ length: 2 }, (_, i) => song(300 + i, "Pop", { bucket: "dislike" })),
        ]

        const clouds = nebulaLayout(songs, { w: 900, h: 900, colors: { like: "#f00", sky: "#0af", plum: "#a0f" } })

        const circles = clouds.flatMap((c) => c.nodes.map((n) => ({ x: n.x, y: n.y, r: n.size / 2 })))
        assertNoOverlap(circles, "nebula stars")
    })

    it("keeps each cloud's center clear when innerRadius is set (stat sits in the middle)", () => {
        const buckets = ["like", "alright", "dislike"] as const
        const songs = Array.from({ length: 45 }, (_, i) =>
            song(i + 1, "Pop", { bucket: buckets[i % 3], score: 3 + (i % 7) }),
        )

        const clouds = nebulaLayout(songs, {
            w: 900,
            h: 900,
            colors: { like: "#f00", sky: "#0af", plum: "#a0f" },
            innerRadius: 80,
        })

        // No star sits in the middle of its cloud — they ring around the reserved center.
        clouds.forEach((c) => {
            c.nodes.forEach((n) => {
                expect(Math.hypot(n.x - c.cx, n.y - c.cy)).toBeGreaterThan(80 * 0.6)
            })
        })
        // Still overlap-free with the annulus in place.
        const circles = clouds.flatMap((c) => c.nodes.map((n) => ({ x: n.x, y: n.y, r: n.size / 2 })))
        assertNoOverlap(circles, "nebula annulus stars")
    })
})

describe("enrichRankings", () => {
    it("upsizes a raw Apple 100x100 thumbnail so zoomed-in album art has real pixels", () => {
        const enriched = enrichRankings([ranking("https://is1-ssl.mzstatic.com/image/thumb/foo/100x100bb.jpg")])

        expect(enriched[0].cover).toBe("https://is1-ssl.mzstatic.com/image/thumb/foo/600x600bb.jpg")
    })

    it("upsizes a legacy Deezer thumbnail", () => {
        const enriched = enrichRankings([
            ranking("https://cdn-images.dzcdn.net/images/cover/abc123/250x250-000000-80-0-0.jpg"),
        ])

        expect(enriched[0].cover).toBe("https://cdn-images.dzcdn.net/images/cover/abc123/1000x1000-000000-80-0-0.jpg")
    })

    it("upsizes a picsum.photos dev/demo seed placeholder", () => {
        const enriched = enrichRankings([ranking("https://picsum.photos/seed/listn9000033/300/300")])

        expect(enriched[0].cover).toBe("https://picsum.photos/seed/listn9000033/900/900")
    })

    it("leaves unrecognized cover URLs untouched", () => {
        const enriched = enrichRankings([ranking("https://coverartarchive.org/release/abc/front")])

        expect(enriched[0].cover).toBe("https://coverartarchive.org/release/abc/front")
    })

    it("maps a missing cover_url to null", () => {
        const enriched = enrichRankings([ranking("")])

        expect(enriched[0].cover).toBeNull()
    })
})
