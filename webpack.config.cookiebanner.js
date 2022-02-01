// webpack.config.cookiebanner.js

const path = require('path');

const dev = process.env.DEV === '1';

module.exports = {
  mode: dev ? 'development' : 'production',

  watch: dev,

  devtool: dev ? 'inline-source-map' : false,

  entry: {
    preload: './cookiebanner/src/preload.ts',
  },

  module: {
    rules: [
      {
        test: /\.txt$/,
        include: path.resolve(__dirname, 'res'),
        use: [
          {
            loader: 'raw-loader',
          },
        ],
      },
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },

  externals: {
    keytar: `require('keytar')`,
    electron: 'require("electron")',
    fs: 'require("fs")',
    os: 'require("os")',
    path: 'require("path")',
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'cookiebanner', 'build'),
  },
};
