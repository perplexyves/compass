import fs from 'fs';
import type { ResolveOptions, WebpackPluginInstance } from 'webpack';
import { merge } from 'webpack-merge';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error no types exist for this library
import DuplicatePackageCheckerPlugin from '@cerner/duplicate-package-checker-webpack-plugin';
import path from 'path';
import { builtinModules } from 'module';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import { WebpackPluginStartElectron } from './webpack-plugin-start-electron';
import type { ConfigArgs, WebpackConfig, WebpackCLIArgs } from './args';
import { isServe, webpackArgsWithDefaults } from './args';
import {
  javascriptLoader,
  nodeLoader,
  sourceLoader,
  cssLoader,
  lessLoader,
  assetsLoader,
  resourceLoader,
  sharedObjectLoader,
} from './loaders';
import {
  entriesToNamedEntries,
  toCommonJsExternal,
  entriesToHtml,
  getLibraryNameFromCwd,
} from './util';
import { sharedExternals, pluginExternals } from './externals';
import { WebpackPluginMulticompilerProgress } from './webpack-plugin-multicompiler-progress';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const sharedResolveOptions = (
  target: ConfigArgs['target']
): Pick<
  ResolveOptions,
  'mainFields' | 'exportsFields' | 'extensions' | 'alias'
> => {
  if (typeof target === 'string') {
    target = [target];
  }
  return {
    // This replicates webpack behavior with additional special `compass:` keys
    // taking priority over the default ones that webpack uses
    //
    // See https://webpack.js.org/configuration/resolve/#resolvemainfields
    mainFields:
      target?.includes('web') || target?.includes('webworker')
        ? [
            'compass:browser',
            'compass:module',
            'compass:main',
            'browser',
            'module',
            'main',
          ]
        : ['compass:module', 'compass:main', 'module', 'main'],
    exportsFields: ['compass:exports', 'exports'],
    extensions: ['.jsx', '.tsx', '.ts', '...'],
    alias: {
      // Removes `browserslist` that is pulled in by `babel` and is unnecessary
      // as well as being a particularly large dependency.
      browserslist: false,
    },
  };
};

export function createElectronMainConfig(
  args: Partial<ConfigArgs>
): WebpackConfig {
  const opts = webpackArgsWithDefaults(args, { target: 'electron-main' });
  const namedEntry = entriesToNamedEntries(opts.entry);

  const config = {
    entry: namedEntry,
    devtool: opts.devtool,
    output: {
      path: opts.outputPath,
      filename: opts.outputFilename ?? '[name].[contenthash].main.js',
      assetModuleFilename: 'assets/[name].[hash][ext]',
      strictModuleErrorHandling: true,
      strictModuleExceptionHandling: true,
    },
    mode: opts.mode,
    target: opts.target,
    module: {
      rules: [
        javascriptLoader(opts),
        nodeLoader(opts),
        resourceLoader(opts),
        sharedObjectLoader(opts),
        sourceLoader(opts),
      ],
    },
    node: false as const,
    externals: toCommonJsExternal(sharedExternals),
    resolve: {
      // To avoid resolving the `browser` field
      aliasFields: [],
      ...sharedResolveOptions(opts.target),
    },
    plugins: [new WebpackPluginMulticompilerProgress()],
  };

  return merge<WebpackConfig>(
    config,
    opts.mode === 'development'
      ? {
          output: {
            filename: opts.outputFilename ?? '[name].main.js',
            assetModuleFilename: 'assets/[name][ext]',
          },
        }
      : {},
    isServe(opts) ? { plugins: [new WebpackPluginStartElectron()] } : {},
    opts.analyze
      ? {
          plugins: [
            // Plugin types are not matching Webpack 5, but they work
            new BundleAnalyzerPlugin({
              logLevel: 'silent',
              analyzerPort: 'auto',
            }) as unknown as WebpackPluginInstance,

            new DuplicatePackageCheckerPlugin(),
          ],
        }
      : {}
  );
}

export function createElectronRendererConfig(
  args: Partial<ConfigArgs>
): WebpackConfig {
  const opts = webpackArgsWithDefaults(args, { target: 'electron-renderer' });
  const entries = entriesToNamedEntries(opts.entry);

  const config = {
    entry: entries,
    devtool: opts.devtool,
    output: {
      path: opts.outputPath,
      filename: opts.outputFilename ?? '[name].[contenthash].renderer.js',
      assetModuleFilename: 'assets/[name].[hash][ext]',
      library: getLibraryNameFromCwd(opts.cwd),
      libraryTarget: 'umd',
      strictModuleErrorHandling: true,
      strictModuleExceptionHandling: true,
    },
    mode: opts.mode,
    target: opts.target,
    module: {
      rules: [
        javascriptLoader(opts),
        nodeLoader(opts),
        cssLoader(opts),
        lessLoader(opts),
        assetsLoader(opts),
        sharedObjectLoader(opts),
        sourceLoader(opts),
      ],
    },
    plugins: [
      ...entriesToHtml(entries),
      new WebpackPluginMulticompilerProgress(),
    ],
    node: false as const,
    externals: toCommonJsExternal(sharedExternals),
    resolve: {
      // To avoid resolving the `browser` field
      aliasFields: [],
      ...sharedResolveOptions(opts.target),
    },
  };

  return merge<WebpackConfig>(
    config,
    opts.mode === 'development'
      ? {
          output: {
            filename: opts.outputFilename ?? '[name].renderer.js',
            assetModuleFilename: 'assets/[name][ext]',
          },
        }
      : {},
    opts.mode === 'production'
      ? {
          plugins: [
            new MiniCssExtractPlugin(),
          ] as unknown as WebpackPluginInstance[],
        }
      : {},
    isServe(opts)
      ? {
          devServer: {
            magicHtml: false,
            port: opts.devServerPort,
            devMiddleware: {
              // It's slower than in-memory fs, but required so that we can
              // start the electron app
              writeToDisk: true,
            },
            client: {
              overlay: {
                errors: true,
                warnings: false,
              },
            },
            https: false,
            hot: opts.hot,
          },
          plugins: [
            new WebpackPluginStartElectron() as WebpackPluginInstance,
          ].concat(
            opts.hot
              ? [
                  // Plugin types are not matching Webpack 5, but they work
                  new ReactRefreshWebpackPlugin() as unknown as WebpackPluginInstance,
                ]
              : []
          ),
        }
      : {},
    opts.analyze
      ? {
          plugins: [
            // Plugin types are not matching Webpack 5, but they work
            new BundleAnalyzerPlugin({
              logLevel: 'silent',
              analyzerPort: 'auto',
            }) as unknown as WebpackPluginInstance,

            new DuplicatePackageCheckerPlugin(),
          ],
        }
      : {}
  );
}

export function createWebConfig(args: Partial<ConfigArgs>): WebpackConfig {
  const opts = webpackArgsWithDefaults(args, { target: 'web' });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { peerDependencies } = require(path.join(opts.cwd, 'package.json')) as {
    peerDependencies: Record<string, string>;
  };

  return {
    entry: entriesToNamedEntries(opts.entry),
    devtool: opts.devtool,
    output: {
      path: opts.outputPath,
      filename: opts.outputFilename ?? '[name].js',
      assetModuleFilename: 'assets/[name][ext]',
      library: getLibraryNameFromCwd(opts.cwd),
      libraryTarget: 'umd',
      // These two options are subtly different, and while
      // `strictModuleExceptionHandling` is deprecated, it is the only
      // one that actually gives us the right behavior currently.
      // https://github.com/webpack/webpack/blob/3ad4fcac25a976277f2d9cceb37bc81602e96b13/lib/javascript/JavascriptModulesPlugin.js#L1326-L1346
      // Note that hot module reloading turns these on by default,
      // so this is only affecting production builds and not the
      // typical development mode that we work in.
      strictModuleErrorHandling: true,
      strictModuleExceptionHandling: true,
    },
    mode: opts.mode,
    target: opts.target,
    module: {
      rules: [
        javascriptLoader(opts, true),
        nodeLoader(opts),
        cssLoader(opts, true),
        lessLoader(opts),
        assetsLoader(opts),
        sourceLoader(opts),
      ],
    },
    // This follows current Compass plugin behavior and is here more or less to
    // keep compat for the external plugin users
    externals: {
      ...toCommonJsExternal(sharedExternals),
      ...toCommonJsExternal(Object.keys(peerDependencies)),
      ...toCommonJsExternal(builtinModules),
    },
    resolve: {
      ...sharedResolveOptions(opts.target),
    },
  };
}

export function compassPluginConfig(
  _env: WebpackCLIArgs['env'],
  _args: Partial<WebpackCLIArgs>
): WebpackConfig[] {
  const args = webpackArgsWithDefaults(_args);
  const opts = { ...args, hot: true };

  process.env.NODE_ENV = opts.nodeEnv;

  if (isServe(opts)) {
    const sandboxMain = path.join(opts.cwd, 'electron', 'index.js');
    const sandboxRenderer = path.join(
      opts.cwd,
      'electron',
      'renderer',
      'index.js'
    );

    try {
      fs.statSync(sandboxMain);
      fs.statSync(sandboxRenderer);
    } catch (e) {
      throw new Error(
        `Compass plugin is missing sandbox entry points. To be able to run the plugin in a sandbox outside of Compass, please add ./electron/index.ts and ./electron/renderer/index.ts entry points`
      );
    }

    return [
      merge(
        createElectronMainConfig({
          ...opts,
          entry: sandboxMain,
        }),
        { externals: toCommonJsExternal(pluginExternals) }
      ),
      merge(
        createElectronRendererConfig({
          ...opts,
          entry: sandboxRenderer,
        }),
        { externals: toCommonJsExternal(pluginExternals) }
      ),
    ];
  }

  const entry = fs.existsSync(path.join(opts.cwd, 'src', 'index.ts'))
    ? path.join(opts.cwd, 'src', 'index.ts')
    : path.join(opts.cwd, 'src', 'index.js');

  return [
    merge(
      createElectronRendererConfig({
        ...opts,
        entry,
        outputFilename: 'index.js',
      }),
      { externals: toCommonJsExternal(pluginExternals) }
    ),
    merge(
      createWebConfig({
        ...opts,
        entry,
        outputFilename: 'browser.js',
      }),
      { externals: toCommonJsExternal(pluginExternals) }
    ),
  ];
}

export { sharedExternals, pluginExternals };
export { webpackArgsWithDefaults, isServe } from './args';
export { default as webpack } from 'webpack';
export { merge } from 'webpack-merge';
