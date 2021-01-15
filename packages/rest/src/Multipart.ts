import Multer, { Options as MulterOptions } from '@koa/multer';
import { makeControllerInjector, IContextProvider, ContextProvider } from '@stilt/http';
import RestError from './RestError';

export type UploadedFile = {
  fieldname: string,
  originalname: string,
  encoding: string,
  mimetype: string,
  buffer: Buffer,
  size: number,
};

export type TFilesArgs = [
  /**
   * The file config can either be:
   * - A file name (string): This fileName must match the multipart key and will be provided using the same key to the parameter bag.
   * - A configuration object
   */
  fileConfigs: string | { [fileName: string]: number | { field?: string, maxCount?: number } },
  multerConfig?: MulterOptions,
];

type TFilesDeps = {
  contextProvider: ContextProvider,
};

// @Files(0, {
//   avatar: { maxCount: 1 },
//   file: 1, // equivalent to { maxCount: 1 }
//   gallery: { maxCount: 1, field: 'gallery2' }
// }, { limits: { fileSize: '2MB' } }) // get 3 files and store under avatar, file, gallery
// @Files(0, 'files', { limits: { fileSize: '2MB' } }) // get all files and store under 'files' key
export const Files = makeControllerInjector<TFilesArgs, TFilesDeps>({
  dependencies: { contextProvider: IContextProvider },
  run: async (params, deps) => {
    const context = deps.contextProvider.getCurrentContext();

    const [fileConfigs, multerConfig] = params;

    const multer = Multer(multerConfig);

    if (typeof fileConfigs === 'string') {
      const middleware = multer.any();
      // @ts-ignore
      await middleware(context, val => val);

      // @ts-ignore
      return { [fileConfigs]: context.files };
    }

    const keys = Object.keys(fileConfigs);
    const aliases = Object.create(null);
    const middleware = multer.fields(keys.map(key => {

      const fileConfig = fileConfigs[key];
      // @ts-ignore
      const field = fileConfig?.field ?? key;

      if (field !== key) {
        aliases[field] = key;
      }

      return {
        name: field,
        value: typeof fileConfig === 'number' ? fileConfig : (fileConfig?.maxCount ?? 1),
      };
    }));

    let files;
    try {
      // @ts-ignore
      await middleware(context, val => val);
      // @ts-ignore
      files = context.files;
    } catch (e) {
      if (e.code === 'LIMIT_UNEXPECTED_FILE') {
        // @ts-ignore
        const validFields = keys.map(key => fileConfigs[key]?.field ?? key);
        throw new RestError(`Unexpected file ${JSON.stringify(e.field)}. Accepted file fields are ${validFields.map(val => JSON.stringify(val)).join(', ')}`)
          .withCode('ERR_UNEXPECTED_FILE')
          .withStatus(400);
      }

      if (e.code === 'LIMIT_FILE_SIZE') {
        const field = e.field;
        const maxSize = multerConfig?.limits?.fileSize;

        throw new RestError(`File ${JSON.stringify(field)} is too large. Max file size is ${maxSize} bytes`)
          .withCode('ERR_FILE_TOO_LARGE')
          .withStatus(400);
      }

      throw e;
    }

    // this happens if the front doesn't send anything
    if (files == null) {
      return {};
    }

    for (const field of Object.keys(files)) {
      let key = field;
      if (aliases[field]) {
        key = aliases[field];
        files[key] = files[field];
        delete files[field];
      }

      const fileConfig = fileConfigs[key];
      const maxFiles = typeof fileConfig === 'number' ? fileConfig : (fileConfig?.maxCount ?? 1);

      if (maxFiles === 1) {
        files[key] = files[key][0];
      }
    }

    return files;
  },
});
