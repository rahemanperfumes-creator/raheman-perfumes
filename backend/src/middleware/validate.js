import { unprocessable } from './error.js'

/**
 * Request validation, with `zod`.
 *
 * Each route declares the shape it accepts and gets a parsed, coerced value
 * back — so a controller never has to ask whether `limit` arrived as a string.
 * The schemas double as the API's documentation: reading one tells you exactly
 * what the endpoint takes.
 *
 * A failure is a **422** with a `fields` array, so a form can point at the input
 * that is wrong rather than showing one sentence for the whole body.
 */

/**
 * @param {'body'|'query'|'params'} source
 * @param {import('zod').ZodTypeAny} schema
 */
export const validate = (source, schema) => (req, _res, next) => {
  const result = schema.safeParse(req[source])
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || source,
      message: issue.message,
    }))
    return next(unprocessable(fields.map((field) => `${field.field}: ${field.message}`).join('; '), { fields }))
  }

  // `req.query` is a getter on Express 5 and a plain object on 4; assigning to it
  // is fine on 4, but writing the parsed value to a side channel keeps this
  // working either way.
  if (source === 'query') req.validatedQuery = result.data
  else req[source] = result.data

  return next()
}

export default validate
