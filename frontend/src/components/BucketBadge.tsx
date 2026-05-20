// Shared bucket label so future badge styling changes happen in one place.
import { StyleSheet, Text } from "react-native"

import { BucketName } from "../features/comparison/types"

type BucketBadgeProps = {
    bucket: BucketName;
}

const BUCKET_LABELS: Record<BucketName, string> = {
    like: "Like",
    alright: "Alright",
    dislike: "Dislike",
}

export default function BucketBadge({ bucket }: BucketBadgeProps) {
    return <Text style={styles.badge}>{BUCKET_LABELS[bucket]}</Text>
}

const styles = StyleSheet.create({
    badge: {
        color: "#b8b8b8",
        fontSize: 13,
        fontWeight: "700",
    },
})
