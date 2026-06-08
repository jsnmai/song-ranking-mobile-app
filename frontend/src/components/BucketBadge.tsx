// Shared bucket label so future badge styling changes happen in one place.
import { StyleSheet, Text } from "react-native"

import { BucketName } from "../features/comparison/types"
import { bucketColor, fonts } from "../theme"

type BucketBadgeProps = {
    bucket: BucketName;
}

const BUCKET_LABELS: Record<BucketName, string> = {
    like: "Like",
    alright: "Okay",
    dislike: "Dislike",
}

export default function BucketBadge({ bucket }: BucketBadgeProps) {
    return <Text style={[styles.badge, { color: bucketColor(bucket) }]}>{BUCKET_LABELS[bucket]}</Text>
}

const styles = StyleSheet.create({
    badge: {
        fontFamily: fonts.mono,
        fontSize: 13,
    },
})
