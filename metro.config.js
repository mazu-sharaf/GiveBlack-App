const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};

const blockList = [
  /\.local\/state\/workflow-logs\/.*/,
  /\.local\/skills\/.*/,
  /\.local\/tasks\/.*/,
];

config.resolver = {
  ...config.resolver,
  blockList: config.resolver?.blockList
    ? [...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : [config.resolver.blockList]), ...blockList]
    : blockList,
};

module.exports = config;
