/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useRef } from "react"
import { Animated, Easing } from "react-native"
import { Loader } from "lucide-react-native"

type Props = {
  size?: number
  color?: string
}

export function SpinningLoader({ size = 16, color = "#fff" }: Props) {
  const rotation = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    )
    animation.start()
    return () => animation.stop()
  }, [rotation])

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"]
  })

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Loader size={size} color={color} />
    </Animated.View>
  )
}
