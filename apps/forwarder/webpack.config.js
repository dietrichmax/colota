import path from "path"
import { fileURLToPath } from "url"
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  entry: "./src/server.ts",
  target: "node",
  mode: "production",
  output: {
    filename: "server.cjs",
    path: path.resolve(__dirname, "dist"),
    clean: true
  },
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/
      }
    ]
  },
  ignoreWarnings: [{ module: /express\/lib\/view\.js/ }]
}
