// The chart kit, as the cockpits see it (R1-N9). This is the only file in src/ui/nav that imports the chart gate, and it takes
// only the lazy views: the chart components arrive as a chunk of their own, so the first download does not carry them
// (test/lazy-zones.test.ts). Until a chunk is ready each view shows the `fallback` it is given, so a cockpit is never blank.
export { LazyChartView, LazyKpiTile, LazySparkline } from '../charts/lazy'
