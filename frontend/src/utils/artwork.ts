// Cover art providers cap image size to a small default unless you ask for more via a
// pattern baked into the URL itself. Each check below is a no-op on URLs that don't match
// its pattern (MusicBrainz cover art, already-large URLs, unrecognized hosts) — never
// throws, never guesses at a host it doesn't recognize.
export function upsizeCoverArt(url: string): string {
    let out = url

    // Apple: .../100x100bb.jpg (or bare 100x100) → 600x600.
    out = out.replace("100x100bb", "600x600bb").replace("100x100", "600x600")

    // Deezer: .../{md5}/{size}x{size}-000000-80-0-0.jpg → 1000x1000. Legacy data only —
    // the catalog has moved off Deezer, but already-stored songs still carry these URLs.
    out = out.replace(/\/(\d+)x\1-000000-80-0-0\.jpg$/, "/1000x1000-000000-80-0-0.jpg")

    // picsum.photos seed placeholders (dev/demo data only) — .../seed/{name}/{w}/{h} → bump
    // the requested size so local testing doesn't read as "the app is blurry."
    const picsum = out.match(/^(https:\/\/picsum\.photos\/seed\/[^/]+)\/\d+\/\d+$/)
    if (picsum) out = `${picsum[1]}/900/900`

    return out
}
