jest.mock('react-native-reanimated', () => {
    const RN = require('react-native')
    const animationStub = { duration: jest.fn(() => ({})), delay: jest.fn(() => ({})), springify: jest.fn(() => ({})) }
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
        useSharedValue: jest.fn((v) => ({ value: v })),
        useAnimatedStyle: jest.fn(() => ({})),
        useAnimatedRef: jest.fn(() => ({ current: null })),
        useAnimatedScrollHandler: jest.fn(() => ({})),
        useDerivedValue: jest.fn((fn) => ({ value: fn() })),
        withTiming: jest.fn((val) => val),
        withSpring: jest.fn((val) => val),
        withDelay: jest.fn((_d, val) => val),
        withSequence: jest.fn((...vals) => vals[0]),
        runOnJS: jest.fn((fn) => fn),
        cancelAnimation: jest.fn(),
        FadeIn: animationStub,
        FadeInDown: animationStub,
        FadeInRight: animationStub,
        FadeInUp: animationStub,
        FadeOut: animationStub,
        FadeOutDown: animationStub,
        FadeOutRight: animationStub,
        FadeOutUp: animationStub,
        SlideInRight: animationStub,
        SlideOutLeft: animationStub,
        LinearTransition: animationStub,
        Easing: { bezier: jest.fn(), linear: jest.fn(), inOut: jest.fn() },
    }
})
