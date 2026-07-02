// Rank Map — pure layout math (no rendering).
// Ports the three "lenses" from the Bento Orbit design:
//   • Gravity  — golden-angle spiral; distance from your sun (#1) encodes score.
//   • Genres   — songs cluster + connect by genre; brightness encodes score.
//   • Nebula   — three bucket clouds (like / okay / dislike); cloud size ∝ count.
// Every visual property maps to real data so the map stays readable, never
// decorative-only. Positions are deterministic trig — the only randomness is a
// seeded jitter inside genre/nebula clusters so members don't stack.
import { BucketName, RankingResponse } from "../../comparison/types"
import { bucketColor, colors } from "../../../theme"
import { upsizeCoverArt } from "../../../utils/artwork"

export type RankView = "gravity" | "genres" | "nebula"
export type TimeGranularity = "week" | "month"

// One ranked song, enriched with the genre + date the map needs.
export type RankMapSong = {
    id: number              // song_id (stable key)
    ranking: RankingResponse
    title: string
    artist: string
    cover: string | null
    bucket: BucketName
    score: number
    pos: number             // 1-based rank by score (1 = your sun)
    genre: string
    date: number            // ranking createdAt as epoch ms
}

// ── seeded RNG (matches the design's string-seeded LCG)
export function rng(seed: string): () => number {
    let s = 0
    for (const ch of String(seed)) s = (s * 131 + ch.charCodeAt(0)) >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return (s & 0x7fffffff) / 0x7fffffff
    }
}

// Nudges apart any two circles closer than the sum of their radii (+ pad), over
// a few relaxation passes. This is what makes zooming feel "naturally dynamic":
// positions are computed once in world space and the map only ever scales/pans
// that world, so real overlap at any zoom level has to be resolved here, not by
// the camera. Mark an item `locked` to let others move around it without it
// moving itself (e.g. the sun, or a genre's dead-center anchor).
//
// Uses a uniform spatial grid (cell size ≈ 2× the largest radius) so each item
// only checks its own cell and its 8 neighbors instead of every other item —
// O(n) per pass instead of O(n²), which is what keeps a few hundred songs fast.
type Circle = { x: number; y: number; r: number; locked?: boolean }
function declutter<T extends Circle>(items: T[], iterations = 6, pad = 3): T[] {
    if (items.length < 2) return items
    const maxR = items.reduce((m, c) => Math.max(m, c.r), 0)
    const cellSize = Math.max(maxR * 2 + pad, 1)
    const cellKey = (x: number, y: number) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`

    for (let pass = 0; pass < iterations; pass++) {
        let moved = false
        const grid = new Map<string, number[]>()
        items.forEach((c, idx) => {
            const key = cellKey(c.x, c.y)
            const bucket = grid.get(key)
            if (bucket) bucket.push(idx)
            else grid.set(key, [idx])
        })

        for (let i = 0; i < items.length; i++) {
            const a = items[i]
            const cx = Math.floor(a.x / cellSize)
            const cy = Math.floor(a.y / cellSize)
            for (let gx = cx - 1; gx <= cx + 1; gx++) {
                for (let gy = cy - 1; gy <= cy + 1; gy++) {
                    const bucket = grid.get(`${gx},${gy}`)
                    if (!bucket) continue
                    for (const j of bucket) {
                        if (j <= i) continue // each pair checked once, from the lower index
                        const b = items[j]
                        const dx = b.x - a.x
                        const dy = b.y - a.y
                        const dist = Math.sqrt(dx * dx + dy * dy)
                        const minDist = a.r + b.r + pad
                        if (dist < minDist) {
                            moved = true
                            const push = (minDist - (dist || 0.01)) / 2
                            const ux = dist ? dx / dist : 1
                            const uy = dist ? dy / dist : 0
                            if (!a.locked) { a.x -= ux * push; a.y -= uy * push }
                            if (!b.locked) { b.x += ux * push; b.y += uy * push }
                        }
                    }
                }
            }
        }
        if (!moved) break
    }
    return items
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

// Missing-genre fallback — kept as a named constant so constellationLayout can
// recognize it and keep it out of the world's dead-center slot (see below).
export const UNKNOWN_GENRE = "Unknown"

// Derive a single genre label from the song's enrichment fields.
function songGenre(r: RankingResponse): string {
    const deezer = r.song.genre_deezer?.trim()
    if (deezer) return deezer
    const mb = r.song.genres_mb?.find((g) => g && g.trim())
    if (mb) return titleCase(mb.trim())
    return UNKNOWN_GENRE
}

// ── enrich: rankings → RankMapSong[] with genre, score-rank and sortable date ─
export function enrichRankings(rankings: RankingResponse[]): RankMapSong[] {
    // rank by score (desc); ties broken by stored position so it's stable
    const byScore = [...rankings].sort((a, b) => b.score - a.score || a.position - b.position)
    const rankById = new Map<number, number>()
    byScore.forEach((r, i) => rankById.set(r.song_id, i + 1))

    return rankings.map((r) => {
        const date = new Date(r.created_at).getTime()
        return {
            id: r.song_id,
            ranking: r,
            title: r.song.title,
            artist: r.song.artist,
            // Some ingestion paths (Apple lookup vs. legacy Deezer vs. dev/demo seed data)
            // store cover_url at whatever small default the source hands back — upsize
            // defensively here so the map's zoomed-in album art has real pixels to work with.
            cover: r.song.cover_url ? upsizeCoverArt(r.song.cover_url) : null,
            bucket: r.bucket,
            score: r.score,
            pos: rankById.get(r.song_id) ?? 0,
            genre: songGenre(r),
            date,
        }
    })
}

export type EraTimeline = {
    labels: string[]
    indexBySongId: Map<number, number>
}

function weekStart(date: Date): Date {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset)
    start.setHours(0, 0, 0, 0)
    return start
}

function timeKey(ts: number, granularity: TimeGranularity): number {
    const d = new Date(ts)
    if (granularity === "month") return d.getFullYear() * 12 + d.getMonth()
    return weekStart(d).getTime()
}

function timeLabel(ts: number, granularity: TimeGranularity): string {
    const d = new Date(ts)
    if (granularity === "month") return `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`

    const start = weekStart(d)
    return `${MONTHS[start.getMonth()]} ${start.getDate()} ’${String(start.getFullYear()).slice(2)}`
}

// Ordered time buckets for the scrubber. Weekly uses local Monday starts; monthly uses calendar months.
export function eraTimeline(songs: RankMapSong[], granularity: TimeGranularity): EraTimeline {
    const labelsByKey = new Map<number, string>()
    const keyBySongId = new Map<number, number>()

    songs.forEach((s) => {
        const key = timeKey(s.date, granularity)
        keyBySongId.set(s.id, key)
        if (!labelsByKey.has(key)) labelsByKey.set(key, timeLabel(s.date, granularity))
    })

    const keys = Array.from(labelsByKey.keys()).sort((a, b) => a - b)
    const indexByKey = new Map(keys.map((key, i) => [key, i]))
    const indexBySongId = new Map<number, number>()
    keyBySongId.forEach((key, songId) => {
        indexBySongId.set(songId, indexByKey.get(key) ?? 0)
    })

    return {
        labels: keys.map((key) => labelsByKey.get(key) ?? ""),
        indexBySongId,
    }
}

export type BucketCounts = { like: number; alright: number; dislike: number }

export function countBy(songs: RankMapSong[]): BucketCounts {
    const c: BucketCounts = { like: 0, alright: 0, dislike: 0 }
    songs.forEach((s) => {
        c[s.bucket] = (c[s.bucket] ?? 0) + 1
    })
    return c
}

// GRAVITY — golden-angle spiral; radius = (1 − score/10), so a loved song is
// pulled toward the sun and a lukewarm one drifts to the cold rim. Score has to
// stay the thing that decides radius, so crowding can't be fixed by moving
// songs to a "free" spot the way genres/nebula can — instead the whole spiral
// grows with library size (more songs → more radial room, same idea as the
// nebula cloud sizing below) and a final declutter pass nudges apart whatever
// still overlaps among near-identical scores, beeswarm-plot style.
export type Planet = {
    s: RankMapSong
    x: number
    y: number
    r: number
    size: number
    glow: string
    fx: number      // entrance offset: how far to fly from the sun
    fy: number
    delay: number   // staggered entrance delay (ms) — inner planets settle first
    rank: number
}
export type GravityLayout = { sun: RankMapSong; planets: Planet[]; maxR: number }

const GA = Math.PI * (3 - Math.sqrt(5)) // golden angle
const SUN_RADIUS = 37 // half of Planet.tsx's <Sun size={74}> default — keep in sync

export function gravityLayout(
    songs: RankMapSong[],
    opts: { cx: number; cy: number; minR: number; maxR: number },
): GravityLayout {
    const { cx, cy, minR } = opts
    const sorted = [...songs].sort((a, b) => b.score - a.score || a.pos - b.pos)
    const sun = sorted[0]
    const rest = sorted.slice(1)

    // Annulus area needed to seat `rest.length` average-size planets with real
    // breathing room (×3.2 slack), solved back to a radius — same sqrt(count)
    // scaling law as the nebula blob, so big libraries get a bigger spiral
    // instead of the same fixed ring getting ever more crowded.
    const avgOrbR = (23 + 40) / 4
    const dynMaxR = Math.sqrt(minR * minR + rest.length * avgOrbR * avgOrbR * 3.2)
    const maxR = Math.max(opts.maxR, dynMaxR)

    const n = rest.length
    const planets: Planet[] = rest.map((s, i) => {
        const norm = 1 - s.score / 10 // 0 (loved) → 1 (cold)
        // Break score ties with a small rank-based nudge, sorted-index order (so it
        // never fights the score gradient) — without it, many songs sharing a score
        // would all compute the exact same radius and dump the entire crowding
        // problem on the declutter pass below. i/n is unique per song, so this
        // alone guarantees no two songs ever start at the same radius.
        const tie = (i / Math.max(n - 1, 1)) * 0.35
        const r = minR + (maxR - minR) * Math.min(norm + tie, 1)
        const a = i * GA - Math.PI / 2
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        const size = 23 + (s.score / 10) * 17
        return {
            s,
            x,
            y,
            r,
            size,
            glow: bucketColor(s.bucket),
            fx: cx - x,
            fy: cy - y,
            delay: Math.round((r / maxR) * 520 + i * 4),
            rank: s.pos,
        }
    })

    const circles = [
        { x: cx, y: cy, r: SUN_RADIUS, locked: true },
        ...planets.map((p) => ({ x: p.x, y: p.y, r: p.size / 2 })),
    ]
    declutter(circles, 60, 4)
    planets.forEach((p, i) => {
        const c = circles[i + 1]
        p.x = c.x
        p.y = c.y
        p.fx = cx - p.x
        p.fy = cy - p.y
    })

    return { sun, planets, maxR }
}

// GENRES — every distinct genre becomes its own constellation (no cap, no
// rollup); members spiral around a center (Fermat/Vogel spiral — same
// even-density, no-overlap math a sunflower's seeds use) and connect in a
// ring. Brightness encodes score. Cluster centers spiral outward from the
// world's middle (where pan={0,0}/zoom=1 lands, see stageTop/worldLeft in
// RankMapScreen) — golden-angle, same as the gravity spiral — but each
// cluster's own "footprint" (how far its members reach out) grows with its
// song count, and a declutter pass keeps busier constellations from bleeding
// into their neighbors instead of using fixed-size slots. UNKNOWN_GENRE is
// excluded from the center slot even when it's the largest group — it's a
// data gap, not a taste signal, so it shouldn't read as "the genre that
// defines you".
export type ConNode = { s: RankMapSong; x: number; y: number; size: number; bright: number }
export type Constellation = {
    genre: string
    ctr: { x: number; y: number }
    nodes: ConNode[]
    color: string
}

const NODE_SPACING = 28 // px between successive rings of a cluster's member spiral

export function constellationLayout(
    songs: RankMapSong[],
    opts: { w: number; h: number },
): Constellation[] {
    const { w, h } = opts
    const groups: Record<string, RankMapSong[]> = {}
    songs.forEach((s) => {
        ;(groups[s.genre] = groups[s.genre] || []).push(s)
    })
    const ordered = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
    // Bump Unknown out of the dead-center slot — swap it with the next entry so a real
    // genre still takes the center whenever one exists (only true if it's the only group).
    if (ordered.length > 1 && ordered[0][0] === UNKNOWN_GENRE) {
        ;[ordered[0], ordered[1]] = [ordered[1], ordered[0]]
    }
    const cx = w / 2
    const cy = h / 2
    const initialSpacing = 70
    // How far out a cluster's own member spiral reaches, given its size — the
    // radius two neighboring clusters need between their centers to not overlap.
    const footprint = (count: number) => 66 + NODE_SPACING * Math.sqrt(Math.max(count - 1, 0))

    type Placed = { genre: string; list: RankMapSong[]; x: number; y: number; r: number; locked?: boolean }
    const placed: Placed[] = ordered.map(([genre, list], gi) => {
        const r = initialSpacing * Math.sqrt(gi)
        const a = gi * GA
        return {
            genre,
            list,
            x: gi === 0 ? cx : cx + Math.cos(a) * r,
            y: gi === 0 ? cy : cy + Math.sin(a) * r,
            r: footprint(list.length),
            locked: gi === 0, // the dead-center genre anchors; everyone else moves around it
        }
    })
    declutter(placed, 16, 8)

    return placed.map(({ genre, list, x, y }) => {
        const ctr = { x, y }
        const rr = rng("con" + genre)
        const nodeCircles = list.map((s, i) => {
            const rad = i === 0 ? 0 : NODE_SPACING * Math.sqrt(i)
            const ang = i * GA + rr() * 0.3
            const size = 17 + (s.score / 10) * 13
            return {
                s,
                x: ctr.x + Math.cos(ang) * rad,
                y: ctr.y + Math.sin(ang) * rad,
                size,
                bright: 0.35 + (s.score / 10) * 0.65,
                r: size / 2,
            }
        })
        declutter(nodeCircles, 6, 6)
        const nodes: ConNode[] = nodeCircles.map(({ s, x, y, size, bright }) => ({ s, x, y, size, bright }))
        return { genre, ctr, nodes, color: bucketColor(list[0].bucket) }
    })
}

// Connect each constellation's members into a ring of segments.
export type ConSeg = { genre: string; color: string; x1: number; y1: number; x2: number; y2: number; key: string }
export function constellationSegments(cl: Constellation[]): ConSeg[] {
    const segs: ConSeg[] = []
    cl.forEach((con) => {
        if (con.nodes.length > 1) {
            con.nodes.forEach((n, i) => {
                const m = con.nodes[(i + 1) % con.nodes.length]
                segs.push({
                    genre: con.genre,
                    color: con.color,
                    x1: n.x,
                    y1: n.y,
                    x2: m.x,
                    y2: m.y,
                    key: con.genre + i,
                })
            })
        }
    })
    return segs
}

// NEBULA — three bucket clouds; cloud (glow) radius ∝ √count, capped so the
// three don't visually crowd each other. The actual star positions are a
// Fermat/Vogel spiral scaled to the bucket's real size — uncapped, so a very
// lopsided library (e.g. 300 likes, 4 dislikes) still gets non-overlapping
// stars even once the "like" cloud's glow has hit its cap — and a single
// declutter pass runs across all three clouds together so an oversized one
// can't bleed its stars into a neighboring cloud's territory.
export type NebulaCloud = {
    key: BucketName
    color: string
    cx: number
    cy: number
    list: RankMapSong[]
    share: number
    blob: number
    nodes: { s: RankMapSong; x: number; y: number; size: number }[]
}

const NEBULA_NODE_SPACING = 26

export function nebulaLayout(
    songs: RankMapSong[],
    opts: { w: number; h: number; colors: { like: string; sky: string; plum: string } },
): NebulaCloud[] {
    const { w, h, colors } = opts
    const by: Record<BucketName, RankMapSong[]> = { like: [], alright: [], dislike: [] }
    songs.forEach((s) => by[s.bucket].push(s))
    const defs: { key: BucketName; color: string; cx: number; cy: number }[] = [
        { key: "like", color: colors.like, cx: w * 0.32, cy: h * 0.32 },
        { key: "alright", color: colors.sky, cx: w * 0.7, cy: h * 0.52 },
        { key: "dislike", color: colors.plum, cx: w * 0.34, cy: h * 0.76 },
    ]
    const total = songs.length || 1
    const maxBlob = Math.min(w, h) * 0.29
    const minBlob = Math.min(w, h) * 0.16

    const allNodes: { s: RankMapSong; x: number; y: number; size: number; r: number }[] = []
    const clouds = defs.map((d) => {
        const list = by[d.key]
        const rr = rng("neb" + d.key)
        const share = list.length / total
        const blob = clamp(minBlob + Math.sqrt(Math.max(list.length, 1)) * 15, minBlob, maxBlob)
        const nodes = list.map((s, i) => {
            const rad = i === 0 ? 0 : NEBULA_NODE_SPACING * Math.sqrt(i)
            const ang = i * GA + rr() * 0.3
            const size = 19 + (s.score / 10) * 13
            return { s, x: d.cx + Math.cos(ang) * rad, y: d.cy + Math.sin(ang) * rad, size, r: size / 2 }
        })
        allNodes.push(...nodes)
        return { ...d, list, share, blob, nodes }
    })
    declutter(allNodes, 10, 6)

    return clouds.map((c) => ({
        ...c,
        nodes: c.nodes.map(({ s, x, y, size }) => ({ s, x, y, size })),
    }))
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function bucketLabel(b: BucketName): string {
    return b === "like" ? "Like" : b === "alright" ? "Okay" : "Dislike"
}
