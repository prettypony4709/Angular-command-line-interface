/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { runWebpack } from '@angular-devkit/build-webpack';
import { tags } from '@angular-devkit/core';
import * as path from 'path';
import { Observable, from } from 'rxjs';
import { concatMap, map } from 'rxjs/operators';
import { ScriptTarget } from 'typescript';
import webpack from 'webpack';
import { ExecutionTransformer } from '../../transforms';
import { NormalizedBrowserBuilderSchema, deleteOutputDir } from '../../utils';
import { i18nInlineEmittedFiles } from '../../utils/i18n-inlining';
import { I18nOptions } from '../../utils/i18n-options';
import { ensureOutputPaths } from '../../utils/output-paths';
import { purgeStaleBuildCache } from '../../utils/purge-cache';
import { assertCompatibleAngularVersion } from '../../utils/version';
import { generateI18nBrowserWebpackConfigFromContext } from '../../utils/webpack-browser-config';
import { getCommonConfig, getStylesConfig } from '../../webpack/configs';
import { webpackStatsLogger } from '../../webpack/utils/stats';
import { Schema as ServerBuilderOptions } from './schema';

/**
 * @experimental Direct usage of this type is considered experimental.
 */
export type ServerBuilderOutput = BuilderOutput & {
  baseOutputPath: string;
  /**
   * @deprecated in version 14. Use 'outputs' instead.
   */
  outputPaths: string[];
  /**
   * @deprecated in version 9. Use 'outputs' instead.
   */
  outputPath: string;

  outputs: {
    locale?: string;
    path: string;
  }[];
};

export { ServerBuilderOptions };

/**
 * @experimental Direct usage of this function is considered experimental.
 */
export function execute(
  options: ServerBuilderOptions,
  context: BuilderContext,
  transforms: {
    webpackConfiguration?: ExecutionTransformer<webpack.Configuration>;
  } = {},
): Observable<ServerBuilderOutput> {
  const root = context.workspaceRoot;

  // Check Angular version.
  assertCompatibleAngularVersion(root);

  const baseOutputPath = path.resolve(root, options.outputPath);
  let outputPaths: undefined | Map<string, string>;

  return from(initialize(options, context, transforms.webpackConfiguration)).pipe(
    concatMap(({ config, i18n, target }) => {
      return runWebpack(config, context, {
        webpackFactory: require('webpack') as typeof webpack,
        logging: (stats, config) => {
          if (options.verbose) {
            context.logger.info(stats.toString(config.stats));
          }
        },
      }).pipe(
        concatMap(async (output) => {
          const { emittedFiles = [], outputPath, webpackStats } = output;
          if (!webpackStats) {
            throw new Error('Webpack stats build result is required.');
          }

          let success = output.success;
          if (success && i18n.shouldInline) {
            outputPaths = ensureOutputPaths(baseOutputPath, i18n);

            success = await i18nInlineEmittedFiles(
              context,
              emittedFiles,
              i18n,
              baseOutputPath,
              Array.from(outputPaths.values()),
              [],
              outputPath,
              target <= ScriptTarget.ES5,
              options.i18nMissingTranslation,
            );
          }

          webpackStatsLogger(context.logger, webpackStats, config);

          return { ...output, success };
        }),
      );
    }),
    map((output) => {
      if (!output.success) {
        return output as ServerBuilderOutput;
      }

      return {
        ...output,
        baseOutputPath,
        outputPath: baseOutputPath,
        outputPaths: outputPaths || [baseOutputPath],
        outputs: (outputPaths &&
          [...outputPaths.entries()].map(([locale, path]) => ({
            locale,
            path,
          }))) || {
          path: baseOutputPath,
        },
      } as ServerBuilderOutput;
    }),
  );
}

export default createBuilder<ServerBuilderOptions, ServerBuilderOutput>(execute);

async function initialize(
  options: ServerBuilderOptions,
  context: BuilderContext,
  webpackConfigurationTransform?: ExecutionTransformer<webpack.Configuration>,
): Promise<{
  config: webpack.Configuration;
  i18n: I18nOptions;
  target: ScriptTarget;
}> {
  // Purge old build disk cache.
  await purgeStaleBuildCache(context);

  const originalOutputPath = options.outputPath;
  const { config, i18n, target } = await generateI18nBrowserWebpackConfigFromContext(
    {
      ...options,
      buildOptimizer: false,
      aot: true,
      platform: 'server',
    } as NormalizedBrowserBuilderSchema,
    context,
    (wco) => [getCommonConfig(wco), getStylesConfig(wco)],
  );

  let transformedConfig;
  if (webpackConfigurationTransform) {
    transformedConfig = await webpackConfigurationTransform(config);
  }

  if (options.deleteOutputPath) {
    deleteOutputDir(context.workspaceRoot, originalOutputPath);
  }

  return { config: transformedConfig || config, i18n, target };
}
