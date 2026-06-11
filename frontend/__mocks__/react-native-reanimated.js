'use strict';

const React = require('react');
const { View, Text, Image, ScrollView, FlatList, Animated: RNAnimated } = require('react-native');

// Stub layout-animation builder — .duration(), .springify(), etc. all return `this`
class AnimationMock {
    duration() { return this; }
    springify() { return this; }
    damping() { return this; }
    delay() { return this; }
    easing() { return this; }
    overshootClamping() { return this; }
    restDisplacementThreshold() { return this; }
    restSpeedThreshold() { return this; }
    withCallback() { return this; }
    withInitialValues() { return this; }
    randomDelay() { return this; }
}

const animationMock = new AnimationMock();

// Animated.View et al. — just forward to the real RN Animated counterparts so layout works
const Animated = {
    View: View,
    Text: Text,
    Image: Image,
    ScrollView: ScrollView,
    FlatList: FlatList,
    createAnimatedComponent: (component) => component,
};

module.exports = {
    __esModule: true,
    default: Animated,
    Animated,

    // Shared values
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: (fn) => fn(),
    useDerivedValue: (fn) => ({ value: fn() }),
    useAnimatedGestureHandler: (handlers) => handlers,
    useAnimatedScrollHandler: (handlers) => handlers,
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: () => {},
    useAnimatedKeyboard: () => ({ height: { value: 0 }, state: { value: 0 } }),

    // Timing / spring / etc.
    withTiming: (toValue) => toValue,
    withSpring: (toValue) => toValue,
    withDecay: () => 0,
    withDelay: (_delay, animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    withRepeat: (animation) => animation,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    measure: () => ({}),

    // Interpolation
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    interpolate: (_v, _i, _o) => 0,

    // Layout animations — all return a stub builder
    FadeIn: animationMock,
    FadeInRight: animationMock,
    FadeInLeft: animationMock,
    FadeInUp: animationMock,
    FadeInDown: animationMock,
    FadeOut: animationMock,
    FadeOutRight: animationMock,
    FadeOutLeft: animationMock,
    FadeOutUp: animationMock,
    FadeOutDown: animationMock,
    SlideInRight: animationMock,
    SlideInLeft: animationMock,
    SlideInUp: animationMock,
    SlideInDown: animationMock,
    SlideOutRight: animationMock,
    SlideOutLeft: animationMock,
    SlideOutUp: animationMock,
    SlideOutDown: animationMock,
    ZoomIn: animationMock,
    ZoomOut: animationMock,
    LinearTransition: animationMock,
    Layout: animationMock,

    // Easing
    Easing: RNAnimated.EasingNode ?? {
        linear: (t) => t,
        ease: (t) => t,
        quad: (t) => t,
        cubic: (t) => t,
        sin: (t) => t,
        circle: (t) => t,
        exp: (t) => t,
        elastic: () => (t) => t,
        back: () => (t) => t,
        bounce: (t) => t,
        bezier: () => (t) => t,
        bezierFn: () => (t) => t,
        in: (f) => f,
        out: (f) => f,
        inOut: (f) => f,
    },

    // Misc
    createWorklet: (fn) => fn,
    ReduceMotion: { Always: 'always', Never: 'never', System: 'system' },
};
