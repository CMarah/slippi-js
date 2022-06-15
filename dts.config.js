// import { defineConfig } from 'dts-cli';
//
// export default defineConfig({
//   // This function will run for each entry/format/env combination
//   rollup(config, opts) {
//     console.log('HEREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE!', opts);
//     if (opts.format === "esm") {
//       config = { ...config, preserveModules: true };
//       config.output = {
//         ...config.output,
//         dir: "dist/",
//         entryFileNames: "[name].esm.js",
//       };
//       delete config.output.file;
//     }
//     return config;
//   },
// });
module.exports = {
  rollup(config, opts) {
    console.log("HEREEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE!", opts);
    if (opts.format === "esm") {
      config = { ...config, preserveModules: true };
      config.output = {
        ...config.output,
        dir: "dist/",
        entryFileNames: "[name].esm.js",
      };
      delete config.output.file;
    }
    return config;
  },
};
