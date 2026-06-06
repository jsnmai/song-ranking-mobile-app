import { BucketName } from "../comparison/types"

export type ComparisonHistoryReceipt = {
    id: number;
    winner_song_id: number;
    winner_title: string;
    winner_artist: string;
    winner_cover_url: string | null;
    loser_song_id: number;
    loser_title: string;
    loser_artist: string;
    loser_cover_url: string | null;
    bucket: BucketName | null;
    decision_duration_ms: number | null;
    comparison_session_uuid: string;
    comparison_index_in_session: number | null;
    finalized_at: string;
}

export type ComparisonHistoryListResponse = {
    receipts: ComparisonHistoryReceipt[];
}
