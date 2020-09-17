// @flow

import { makeControllerInjector, IContextProvider } from '@stilt/http';
import Multer from '@koa/multer';
import RestError from './RestError';

export type UploadedFile = {
  fieldname: string,
  originalname: string,
  encoding: string,
  mimetype: string,
  buffer: Buffer,
  size: number,
};

// @Files(0, {
//   avatar: { maxCount: 1 },
//   file: 1, // equivalent to { maxCount: 1 }
//   gallery: { maxCount: 1, field: 'gallery2' }
// }, { limits: { fileSize: '2MB' } }) // get 3 files and store under avatar, file, gallery
// @Files(0, 'files', { limits: { fileSize: '2MB' } }) // get all files and store under 'files' key
export const Files = makeControllerInjector({
  dependencies: { contextProvider: IContextProvider },
  run: async (params, deps) => {
    const context = deps.contextProvider.getCurrentContext();

    const [fileConfigs, multerConfig] = params;

    const multer = Multer(multerConfig);

    if (typeof fileConfigs === 'string') {
      const middleware = multer.any();
      await middleware(context, val => val);

      return { [fileConfigs]: context.files };
    }

    const keys = Object.keys(fileConfigs);
    const aliases = Object.create(null);
    const middleware = multer.fields(keys.map(key => {

      const fileConfig = fileConfigs[key];
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
      await middleware(context, val => val);
      files = context.files;
    } catch (e) {
      if (e.code === 'LIMIT_UNEXPECTED_FILE') {
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
