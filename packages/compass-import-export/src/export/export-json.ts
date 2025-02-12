import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { EJSON } from 'bson';
import type { Writable } from 'stream';
import toNS from 'mongodb-ns';
import type { DataService } from 'mongodb-data-service';
import { capMaxTimeMSAtPreferenceLimit } from 'compass-preferences-model';
import type { AggregationCursor, FindCursor } from 'mongodb';
import { objectToIdiomaticEJSON } from 'hadron-document';

import type {
  ExportAggregation,
  ExportQuery,
  ExportResult,
} from './export-types';
import { createDebug } from '../utils/logger';

const debug = createDebug('export-json');

type ExportJSONOptions = {
  output: Writable;
  abortSignal?: AbortSignal;
  input: FindCursor | AggregationCursor;
  progressCallback?: (index: number) => void;
  variant: 'default' | 'relaxed' | 'canonical';
};

function getEJSONOptionsForVariant(
  variant: 'default' | 'relaxed' | 'canonical'
) {
  if (variant === 'relaxed') {
    return {
      relaxed: true,
    };
  }
  return variant === 'canonical'
    ? {
        relaxed: false, // canonical
      }
    : undefined; // default
}

export async function exportJSON({
  output,
  abortSignal,
  input,
  progressCallback,
  variant,
}: ExportJSONOptions): Promise<ExportResult> {
  let docsWritten = 0;

  const ejsonOptions = getEJSONOptionsForVariant(variant);

  if (!abortSignal?.aborted) {
    output.write('[');
  }

  const docStream = new Transform({
    objectMode: true,
    transform: function (chunk: any, encoding, callback) {
      // NOTE: This count is used as the final documents written count,
      // however it does not, at this point, represent the count of documents
      // written to the file as this is an earlier point in the pipeline.
      ++docsWritten;
      progressCallback?.(docsWritten);
      try {
        const doc: string =
          variant === 'default'
            ? objectToIdiomaticEJSON(chunk, { indent: 2 })
            : EJSON.stringify(chunk, undefined, 2, ejsonOptions);
        const line = `${docsWritten > 1 ? ',\n' : ''}${doc}`;

        callback(null, line);
      } catch (err: any) {
        callback(err);
      }
    },
    final: function (callback) {
      this.push(']');
      callback(null);
    },
  });

  try {
    const inputStream = input.stream();
    await pipeline(
      [inputStream, docStream, output],
      ...(abortSignal ? [{ signal: abortSignal }] : [])
    );

    if (abortSignal?.aborted) {
      void input.close();
    } else {
      output.write(']\n', 'utf8');
    }
  } catch (err: any) {
    if (err.code === 'ABORT_ERR') {
      void input.close();
      return {
        docsWritten,
        aborted: true,
      };
    }

    throw err;
  }

  return {
    docsWritten,
    aborted: !!abortSignal?.aborted,
  };
}

export async function exportJSONFromAggregation({
  ns,
  aggregation,
  dataService,
  ...exportOptions
}: Omit<ExportJSONOptions, 'input'> & {
  ns: string;
  dataService: DataService;
  aggregation: ExportAggregation;
}) {
  debug('exportJSONFromAggregation()', { ns: toNS(ns) });

  const { stages, options: aggregationOptions = {} } = aggregation;
  aggregationOptions.maxTimeMS = capMaxTimeMSAtPreferenceLimit(
    aggregationOptions.maxTimeMS
  );
  const aggregationCursor = dataService.aggregateCursor(
    ns,
    stages,
    aggregationOptions
  );

  return await exportJSON({
    ...exportOptions,
    input: aggregationCursor,
  });
}

export async function exportJSONFromQuery({
  ns,
  query = { filter: {} },
  dataService,
  ...exportOptions
}: Omit<ExportJSONOptions, 'input'> & {
  ns: string;
  dataService: DataService;
  query?: ExportQuery;
}) {
  debug('exportJSONFromQuery()', { ns: toNS(ns) });

  const findCursor = dataService.findCursor(ns, query.filter ?? {}, {
    projection: query.projection,
    sort: query.sort,
    limit: query.limit,
    skip: query.skip,
  });

  return await exportJSON({
    ...exportOptions,
    input: findCursor,
  });
}
