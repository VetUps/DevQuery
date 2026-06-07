<script setup lang="ts">
// Кратко: отвечает за часть интерфейса.
import { computed, ref, watch, onMounted, nextTick } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  ToolboxComponent,
  BrushComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { ReputationLedgerEntry } from '@/features/users/api/reputation'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  ToolboxComponent,
  BrushComponent,
])

const props = defineProps<{
  items: ReputationLedgerEntry[]
}>()

const emit = defineEmits<{
  rangeChange: [start: string, end: string]
}>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const isReady = ref(false)

// Сортируем и строим кумулятивный график
const sortedItems = computed(() =>
  [...props.items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  ),
)

const chartData = computed(() => {
  let total = 0
  return sortedItems.value.map((item) => {
    total += item.amount
    return [new Date(item.created_at).getTime(), total]
  })
})

// Границы данных для процентного пересчёта
const dataMinTime = computed(() =>
  chartData.value.length > 0 ? chartData.value[0][0] : 0,
)
const dataMaxTime = computed(() =>
  chartData.value.length > 0 ? chartData.value[chartData.value.length - 1][0] : 0,
)
const dataSpan = computed(() => Math.max(dataMaxTime.value - dataMinTime.value, 1))

function timeToPercent(time: number) {
  return ((time - dataMinTime.value) / dataSpan.value) * 100
}

function percentToTime(pct: number) {
  return dataMinTime.value + (pct / 100) * dataSpan.value
}

// ---------- dataZoom → родитель ----------
function handleDataZoom(params: any) {
  // params от ECharts dataZoom содержит start/end (процентные) или startValue/endValue
  let startPct: number
  let endPct: number

  if (params.batch && params.batch.length > 0) {
    // inside zoom (scroll/pinch)
    startPct = params.batch[0].start
    endPct = params.batch[0].end
  } else {
    // slider zoom
    startPct = params.start ?? 0
    endPct = params.end ?? 100
  }

  const startTime = percentToTime(startPct)
  const endTime = percentToTime(endPct)

  emit('rangeChange', new Date(startTime).toISOString(), new Date(endTime).toISOString())
}

// ---------- brush → родитель ----------
function handleBrushEnd(params: any) {
  if (!params.areas || params.areas.length === 0) return
  const area = params.areas[0]
  if (!area.coordRange) return

  const [startMs, endMs] = area.coordRange
  emit('rangeChange', new Date(startMs).toISOString(), new Date(endMs).toISOString())

  // Обновляем dataZoom, чтобы ползунок совпадал с выделением
  nextTick(() => {
    chartRef.value?.setOption({
      dataZoom: [
        { start: timeToPercent(startMs), end: timeToPercent(endMs) },
        { start: timeToPercent(startMs), end: timeToPercent(endMs) },
      ],
    })
  })
}

// ---------- внешний сброс (setRange из родителя) ----------
function setRange(start: string, end: string) {
  if (!chartRef.value) return
  const s = start ? new Date(start).getTime() : dataMinTime.value
  const e = end ? new Date(end).getTime() : dataMaxTime.value

  chartRef.value.setOption({
    dataZoom: [
      { start: timeToPercent(s), end: timeToPercent(e) },
      { start: timeToPercent(s), end: timeToPercent(e) },
    ],
  })
}

function resetZoom() {
  if (!chartRef.value) return
  chartRef.value.setOption({
    dataZoom: [
      { start: 0, end: 100 },
      { start: 0, end: 100 },
    ],
  })
  emit('rangeChange', '', '')
}

defineExpose({ setRange, resetZoom })

onMounted(() => {
  isReady.value = true
  // Активируем brush-режим по умолчанию
  nextTick(() => {
    chartRef.value?.dispatchAction({
      type: 'takeGlobalCursor',
      key: 'brush',
      brushOption: {
        brushType: 'lineX',
        brushMode: 'single',
      },
    })
  })
})

const option = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: {
    trigger: 'axis',
    axisPointer: {
      type: 'cross',
      label: { backgroundColor: '#0E7490' },
    },
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#E4DED0',
    textStyle: { color: '#1F2937' },
    formatter(params: any) {
      const p = Array.isArray(params) ? params[0] : params
      if (!p) return ''
      const d = new Date(p.value[0])
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `<strong>${day}.${month}.${year}</strong><br/>Репутация: <strong>${p.value[1]}</strong>`
    },
  },
  toolbox: {
    right: 16,
    top: 4,
    feature: {
      brush: {
        type: ['lineX', 'clear'],
        title: { lineX: 'Выделить промежуток', clear: 'Сбросить выделение' },
      },
    },
    iconStyle: {
      borderColor: '#0E7490',
    },
  },
  brush: {
    xAxisIndex: 0,
    brushStyle: {
      borderWidth: 2,
      color: 'rgba(14, 116, 144, 0.12)',
      borderColor: '#0E7490',
    },
    outOfBrush: { colorAlpha: 0.25 },
  },
  grid: {
    top: 48,
    left: 16,
    right: 16,
    bottom: 80,
    containLabel: true,
  },
  xAxis: {
    type: 'time',
    boundaryGap: false,
    axisLine: { lineStyle: { color: '#CFC6B4' } },
    axisLabel: { color: '#4B5563', fontSize: 12 },
  },
  yAxis: {
    type: 'value',
    axisLine: { show: false },
    axisLabel: { color: '#4B5563', fontSize: 12 },
    splitLine: { lineStyle: { color: 'rgba(207,198,180,0.28)' } },
  },
  series: [
    {
      name: 'Репутация',
      type: 'line',
      data: chartData.value,
      smooth: 0.35,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { color: '#0E7490', width: 2.5 },
      itemStyle: { color: '#0E7490', borderColor: '#fff', borderWidth: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(14,116,144,0.22)' },
            { offset: 1, color: 'rgba(14,116,144,0.02)' },
          ],
        },
      },
      emphasis: { focus: 'series', itemStyle: { borderWidth: 3 } },
    },
  ],
  dataZoom: [
    {
      type: 'inside',
      xAxisIndex: 0,
      filterMode: 'none',
    },
    {
      type: 'slider',
      xAxisIndex: 0,
      filterMode: 'none',
      height: 28,
      bottom: 12,
      borderColor: '#CFC6B4',
      fillerColor: 'rgba(14,116,144,0.12)',
      backgroundColor: 'rgba(247,243,234,0.6)',
      handleIcon:
        'path://M306.1,413c0,2.2-1.8,4-4,4h-59.8c-2.2,0-4-1.8-4-4V200.8c0-2.2,1.8-4,4-4h59.8c2.2,0,4,1.8,4,4V413z',
      handleSize: '110%',
      handleStyle: {
        color: '#fff',
        borderColor: '#0E7490',
        shadowBlur: 4,
        shadowColor: 'rgba(0,0,0,0.15)',
      },
      textStyle: { color: '#4B5563', fontSize: 12 },
      dataBackground: {
        lineStyle: { color: 'rgba(14,116,144,0.25)' },
        areaStyle: { color: 'rgba(14,116,144,0.06)' },
      },
      selectedDataBackground: {
        lineStyle: { color: '#0E7490' },
        areaStyle: { color: 'rgba(14,116,144,0.14)' },
      },
    },
  ],
}))
</script>

<template>
  <div class="reputation-chart">
    <VChart
      v-if="chartData.length > 0"
      ref="chartRef"
      class="reputation-chart__canvas"
      :option="option"
      :autoresize="true"
      @datazoom="handleDataZoom"
      @brush="handleBrushEnd"
    />
    <p v-else class="reputation-chart__empty">
      Данных для графика пока нет.
    </p>
  </div>
</template>

<style scoped>
.reputation-chart {
  width: 100%;
  border: 1px solid rgb(207 198 180 / 0.78);
  border-radius: var(--radius-lg);
  background: rgb(255 255 255 / 0.64);
  overflow: hidden;
}

.reputation-chart__canvas {
  width: 100%;
  height: 360px;
}

.reputation-chart__empty {
  margin: 0;
  padding: var(--space-xl);
  color: var(--color-muted);
  text-align: center;
}
</style>
