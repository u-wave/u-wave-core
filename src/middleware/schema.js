import fs from 'node:fs';
import Ajv from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import ValidationError from '../errors/ValidationError.js';

const ajv = new Ajv({
  coerceTypes: false,
  removeAdditional: true,
  useDefaults: true,
  ownProperties: true,
  allErrors: true,
});
addFormats(ajv);
ajv.addMetaSchema(JSON.parse(fs.readFileSync(new URL('../../node_modules/ajv/dist/refs/json-schema-draft-07.json', import.meta.url), 'utf8')));
ajv.addSchema(JSON.parse(fs.readFileSync(new URL('../schemas/definitions.json', import.meta.url), 'utf8')));

/** @type {import('ajv').ValidateFunction<unknown>} */
function alwaysTrue() {
  return true;
}
alwaysTrue.errors = null;

/**
 * @typedef {object} Schemas
 * @prop {import('ajv').SchemaObject} [body]
 * @prop {import('ajv').SchemaObject} [params]
 * @prop {import('ajv').SchemaObject} [query]
 * @param {Schemas} schemas
 * @returns {import('express').RequestHandler}
 */
function schema({ body, params, query }) {
  const validateBody = body ? ajv.compile(body) : alwaysTrue;
  const validateParams = params ? ajv.compile(params) : alwaysTrue;
  const validateQuery = query ? ajv.compile(query) : alwaysTrue;
  return (req, res, next) => {
    if (!validateParams(req.params)) {
      next(new ValidationError(validateParams.errors, ajv));
      return;
    }
    if (!validateQuery(req.query)) {
      next(new ValidationError(validateQuery.errors, ajv));
      return;
    }
    if (!validateBody(req.body)) {
      next(new ValidationError(validateBody.errors, ajv));
      return;
    }
    next();
  };
}

export default schema;
