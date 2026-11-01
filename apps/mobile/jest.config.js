// UTC+9:30 with no DST: a local midnight read through UTC (toISOString) lands on the previous day on every runner.
process.env.TZ = "Australia/Darwin"

module.exports = {
  preset: "@react-native/jest-preset",
  setupFiles: ["./jest.setup.js"]
}
