jest.mock('react-native-reanimated', () => {
    const RN = require('react-native')
    // Builder methods return the stub itself so chains like FadeIn.duration(x).delay(y) work
    const animationStub = {}
    animationStub.duration = () => animationStub
    animationStub.delay = () => animationStub
    animationStub.springify = () => animationStub
    return {
        __esModule: true,
        default: {
            View: RN.View,
            Text: RN.Text,
            Image: RN.Image,
            ScrollView: RN.ScrollView,
            FlatList: RN.FlatList,
            createAnimatedComponent: (c) => c,
        },
        // Plain functions (not jest.fn) so jest.resetAllMocks() in test files
        // cannot wipe their implementations mid-suite
        useSharedValue: (v) => ({ value: v }),
        useReducedMotion: () => false,
        useAnimatedStyle: () => ({}),
        useAnimatedRef: () => ({ current: null }),
        useAnimatedScrollHandler: () => ({}),
        useDerivedValue: (fn) => ({ value: fn() }),
        withTiming: (val) => val,
        withSpring: (val) => val,
        withDelay: (_d, val) => val,
        withRepeat: (val) => val,
        withSequence: (...vals) => vals[0],
        runOnJS: (fn) => fn,
        cancelAnimation: () => {},
        FadeIn: animationStub,
        FadeInDown: animationStub,
        FadeInRight: animationStub,
        FadeInUp: animationStub,
        FadeOut: animationStub,
        FadeOutDown: animationStub,
        FadeOutRight: animationStub,
        FadeOutUp: animationStub,
        SlideInRight: animationStub,
        SlideInDown: animationStub,
        SlideOutLeft: animationStub,
        SlideOutDown: animationStub,
        LinearTransition: animationStub,
        Easing: { bezier: jest.fn(), linear: jest.fn(), inOut: jest.fn() },
    }
})

// Native modules for the activity share art (image capture + save/share). They have no JS-only
// implementation, so stub them for tests. Mirrors the factory-form mock convention above.
jest.mock('react-native-view-shot', () => ({
    captureRef: jest.fn(() => Promise.resolve('file:///tmp/listn-activity.png')),
}))

jest.mock('expo-media-library', () => ({
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
    saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}))

jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    shareAsync: jest.fn(() => Promise.resolve()),
}))
