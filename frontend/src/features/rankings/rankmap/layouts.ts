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
            cover: r.song.cover_url || null,
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
// pulled toward the sun and a lukewarm one drifts to the cold rim.
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
export type GravityLayout = { sun: RankMapSong; planets: Planet[] }

const GA = Math.PI * (3 - Math.sqrt(5)) // golden angle

export function gravityLayout(
    songs: RankMapSong[],
    opts: { cx: number; cy: number; minR: number; maxR: number },
): GravityLayout {
    const { cx, cy, minR, maxR } = opts
    const sorted = [...songs].sort((a, b) => b.score - a.score || a.pos - b.pos)
    const sun = sorted[0]
    const rest = sorted.slice(1)
    const planets: Planet[] = rest.map((s, i) => {
        const norm = 1 - s.score / 10 // 0 (loved) → 1 (cold)
        const r = minR + (maxR - minR) * norm
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
    return { sun, planets }
}

// GENRES — every distinct genre becomes its own constellation (no cap, no
// rollup); members jitter around a center and connect in a ring. Brightness
// encodes score. Centers spiral outward — golden-angle, same spacing rule as
// the gravity spiral — from the world's middle (where pan={0,0}/zoom=1 lands,
// see stageTop/worldLeft in RankMapScreen), so your most-charted genre sits
// dead center and rarer ones radiate out from there. UNKNOWN_GENRE is excluded
// from that center slot even when it's the largest group — it's a data gap,
// not a taste signal, so it shouldn't read as "the genre that defines you".
export type ConNode = { s: RankMapSong; x: number; y: number; size: number; bright: number }
export type Constellation = {
    genre: string
    ctr: { x: number; y: number }
    nodes: ConNode[]
    color: string
}

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
    const spacing = Math.min(w, h) * 0.16

    const out: Constellation[] = []
    ordered.forEach(([genre, list], gi) => {
        const r = spacing * Math.sqrt(gi)
        const a = gi * GA
        const ctr = gi === 0 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
        const rr = rng("con" + genre)
        const nodes: ConNode[] = list.map((s, i) => {
            const ang = (i / list.length) * Math.PI * 2 + rr() * 1.2
            const rad = 18 + rr() * 46 + (list.length > 3 ? 10 : 0)
            return {
                s,
                x: ctr.x + Math.cos(ang) * rad,
                y: ctr.y + Math.sin(ang) * rad,
                size: 11 + (s.score / 10) * 9,
                bright: 0.35 + (s.score / 10) * 0.65,
            }
        })
        out.push({ genre, ctr, nodes, color: bucketColor(nodes[0].s.bucket) })
    })
    return out
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

// NEBULA — three bucket clouds; cloud radius ∝ √count; stars scatter inside.
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
    return defs.map((d) => {
        const list = by[d.key]
        const rr = rng("neb" + d.key)
        const share = list.length / total
        const blob = clamp(minBlob + Math.sqrt(Math.max(list.length, 1)) * 15, minBlob, maxBlob)
        const nodes = list.map((s) => {
            const ang = rr() * Math.PI * 2
            const rad = (0.18 + rr() * 0.72) * blob * 0.58
            return { s, x: d.cx + Math.cos(ang) * rad, y: d.cy + Math.sin(ang) * rad, size: 13 + (s.score / 10) * 9 }
        })
        return { ...d, list, share, blob, nodes }
    })
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function bucketLabel(b: BucketName): string {
    return b === "like" ? "Like" : b === "alright" ? "Okay" : "Dislike"
}
