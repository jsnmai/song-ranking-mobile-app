// Tests for the search API request wrapper.
// These verify the frontend calls Apple Search directly, then asks LISTn for annotations.
import { searchSongs } from "../apiRequests"

const mockPost = jest.fn()
const mockFetch = jest.fn()

jest.mock("../../../api/client", () => ({
    apiClient: {
        post: (...args: unknown[]) => mockPost(...args),
    },
}))

beforeEach(() => {
    jest.resetAllMocks()
    globalThis.fetch = mockFetch
})

describe("searchSongs", () => {
    it("maps Apple search results and merges LISTn annotations", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                results: [
                    {
                        trackId: 1440841363,
                        trackName: "Nights",
                        artistName: "Frank Ocean",
                        collectionName: "Blonde",
                        artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg",
                        previewUrl: "https://audio-ssl.itunes.apple.com/apple-preview.m4a",
                        trackViewUrl: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
                        primaryGenreName: "R&B/Soul",
                        trackTimeMillis: 307151,
                        releaseDate: "2016-08-20T07:00:00Z",
                        artistId: 442122051,
                        collectionId: 1440840117,
                        // iTunes returns a 3-letter country code. The result's storefront must
                        // still resolve to the 2-letter "US" the search ran in (and that the
                        // backend files refs / echoes annotations under) — otherwise the merged
                        // annotation below is keyed "…:US" but looked up "…:USA" and the rating
                        // (my_bucket/my_score) silently drops, so a rated song shows unrated.
                        country: "USA",
                    },
                ],
            }),
        })
        mockPost.mockResolvedValue({
            results: [
                {
                    apple_track_id: "1440841363",
                    storefront: "US",
                    song_id: 42,
                    my_bucket: "like",
                    my_score: 8.8,
                    already_rated: true,
                },
            ],
        })

        const response = await searchSongs("frank ocean", "test-token")

        expect(mockFetch).toHaveBeenCalledWith(
            "https://itunes.apple.com/search?term=frank%20ocean&media=music&entity=song&country=US&limit=50",
        )
        expect(mockPost).toHaveBeenCalledWith(
            "/api/v1/search/apple/annotations",
            {
                results: [{
                    apple_track_id: "1440841363",
                    storefront: "US",
                    title: "Nights",
                    artist: "Frank Ocean",
                    album: "Blonde",
                }],
            },
            "test-token",
        )
        expect(response.results[0]).toMatchObject({
            provider: "apple",
            deezer_id: null,
            apple_track_id: "1440841363",
            title: "Nights",
            cover_url: "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/600x600bb.jpg",
            preview_url: "https://audio-ssl.itunes.apple.com/apple-preview.m4a",
            apple_view_url: "https://music.apple.com/us/album/nights/1440841363?i=1440841363",
            song_id: 42,
            my_bucket: "like",
            my_score: 8.8,
            preview_available: true,
        })
    })
})
