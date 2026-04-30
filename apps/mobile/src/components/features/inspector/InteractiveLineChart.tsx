/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useRef, useCallback, useMemo } from "react"
import { View, PanResponder, LayoutChangeEvent } from "react-native"
import Svg, { Path, Line, Circle, Rect, Text as SvgText } from "react-native-svg"
import { clamp } from "../../../utils/format"

interface InteractiveLineChartProps {
  data: number[]
  color: string
  fillColor?: string
  textColor: string
  backgroundColor: string
  formatValue: (value: number) => string
  height?: number
  activeIndex?: number | null
  onActiveIndexChange?: (index: number | null) => void
}

const CHART_PADDING = { top: 24, bottom: 20, left: 40, right: 0 }
const TOOLTIP_WIDTH = 70
const TOOLTIP_HEIGHT = 22

export function InteractiveLineChart({
  data,
  color,
  fillColor,
  textColor,
  backgroundColor,
  formatValue,
  height = 140,
  activeIndex: externalIndex,
  onActiveIndexChange
}: InteractiveLineChartProps) {
  const [chartWidth, setChartWidth] = useState(0)
  const [internalIndex, setInternalIndex] = useState<number | null>(null)
  const activeIndex = externalIndex !== undefined ? externalIndex : internalIndex
  const setActiveIndex = onActiveIndexChange ?? setInternalIndex
  const widthRef = useRef(0)
  const dataRef = useRef(data)
  dataRef.current = data

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setChartWidth(w)
    widthRef.current = w
  }, [])

  const getIndexFromX = useCallback((x: number): number | null => {
    const w = widthRef.current
    const d = dataRef.current
    if (w === 0 || d.length === 0) return null
    const plotW = w - CHART_PADDING.left - CHART_PADDING.right
    const clampedX = clamp(x - CHART_PADDING.left, 0, plotW)
    const idx = Math.round((clampedX / plotW) * (d.length - 1))
    return clamp(idx, 0, d.length - 1)
  }, [])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setActiveIndex(getIndexFromX(e.nativeEvent.locationX))
        },
        onPanResponderMove: (e) => {
          setActiveIndex(getIndexFromX(e.nativeEvent.locationX))
        },
        onPanResponderRelease: () => {
          setActiveIndex(null)
        },
        onPanResponderTerminate: () => {
          setActiveIndex(null)
        }
      }),
    [getIndexFromX, setActiveIndex]
  )

  if (data.length < 2 || chartWidth === 0) {
    return <View style={{ height }} onLayout={onLayout} />
  }

  const plotW = chartWidth - CHART_PADDING.left - CHART_PADDING.right
  const plotH = height - CHART_PADDING.top - CHART_PADDING.bottom
  const minVal = data.reduce((min, v) => Math.min(min, v), Infinity)
  const maxVal = data.reduce((max, v) => Math.max(max, v), -Infinity)
  const range = maxVal - minVal || 1

  const toX = (i: number) => CHART_PADDING.left + (i / (data.length - 1)) * plotW
  const toY = (v: number) => CHART_PADDING.top + (1 - (v - minVal) / range) * plotH

  // Build SVG path
  let linePath = `M ${toX(0)} ${toY(data[0])}`
  for (let i = 1; i < data.length; i++) {
    linePath += ` L ${toX(i)} ${toY(data[i])}`
  }

  // Fill path (area under curve)
  const fillPath = `${linePath} L ${toX(data.length - 1)} ${CHART_PADDING.top + plotH} L ${toX(0)} ${CHART_PADDING.top + plotH} Z`

  // Active point
  const activeX = activeIndex !== null ? toX(activeIndex) : 0
  const activeY = activeIndex !== null ? toY(data[activeIndex]) : 0
  const activeValue = activeIndex !== null ? formatValue(data[activeIndex]) : ""

  // Clamp tooltip position
  let tooltipX = activeX - TOOLTIP_WIDTH / 2
  if (tooltipX < 2) tooltipX = 2
  if (tooltipX + TOOLTIP_WIDTH > chartWidth - 2) tooltipX = chartWidth - TOOLTIP_WIDTH - 2

  return (
    <View style={{ height }} onLayout={onLayout} {...panResponder.panHandlers}>
      <Svg width={chartWidth} height={height}>
        {/* Area fill */}
        <Path d={fillPath} fill={fillColor ?? color + "20"} />

        {/* Line */}
        <Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" />

        {/* Y-axis labels and grid lines */}
        {/* Y-axis labels */}
        {[0, 0.33, 0.67, 1].map((frac) => {
          const val = minVal + frac * range
          const y = CHART_PADDING.top + (1 - frac) * plotH
          return (
            <SvgText
              key={frac}
              x={CHART_PADDING.left - 6}
              y={y + 4}
              fill={textColor}
              fontSize={10}
              opacity={0.6}
              textAnchor="end"
            >
              {formatValue(val)}
            </SvgText>
          )
        })}

        {/* Cursor */}
        {activeIndex !== null && (
          <>
            {/* Vertical line */}
            <Line
              x1={activeX}
              y1={CHART_PADDING.top}
              x2={activeX}
              y2={CHART_PADDING.top + plotH}
              stroke={textColor}
              strokeWidth={1}
              opacity={0.4}
              strokeDasharray="4,3"
            />

            {/* Dot */}
            <Circle cx={activeX} cy={activeY} r={4} fill={color} stroke={backgroundColor} strokeWidth={2} />

            {/* Tooltip background */}
            <Rect x={tooltipX} y={2} width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx={6} fill={color} />

            {/* Tooltip text */}
            <SvgText
              x={tooltipX + TOOLTIP_WIDTH / 2}
              y={17}
              fill="#fff"
              fontSize={11}
              fontWeight="600"
              textAnchor="middle"
            >
              {activeValue}
            </SvgText>
          </>
        )}
      </Svg>
    </View>
  )
}
