const path = require("path");

module.exports = {
  entry: "./src/main.ts",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      { test: /\.wgsl$/, use: "raw-loader" },
    ],
  },
  resolve: {
    extensions: [".ts", ".js", ".wgsl"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
};
