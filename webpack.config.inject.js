// webpack.config.inject.js

const path = require('path');

const dev = process.env.DEV === '1';

module.exports = {
  mode: dev ? 'development' : 'production',

  watch: dev,

  devtool: dev ? 'inline-source-map' : false,

  entry: {
    inject: './inject/src',
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

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'inject', 'build'),
  },
};
