// @ts-ignore: for ts-json-schema-geneartor
import type { JSONSchema7 } from "json-schema";
import type { Logger } from "../options.ts";
export type JSONSchema = JSONSchema7; // & { yahooFinanceType?: string };
import byType from "./types/index.ts";

export const getTypedDefinitions = (schema: unknown) =>
  (schema as JSONSchema).definitions;

export type ValidationError = {
  keyword?: string;
  instancePath?: string;
  schemaPath?: string;
  data?: unknown;
  schema?: unknown;
  message: string;
  params?: { [key: string]: unknown };
  subErrors?: ValidationError[];
};

export type ValidationCtx = {
  definitions: JSONSchema["definitions"];
  logger: Logger;
  logObj: (obj: unknown) => void;
};

export type Validator = (
  input: unknown,
  schema: JSONSchema,
  ctx: ValidationCtx,
  errors: ValidationError[],
  instancePath: string,
  dataCtx: DataCtx | undefined,
  schemaPath: string,
) => boolean;

export function set(
  dataCtx: DataCtx | undefined,
  value: unknown,
  instancePath: string,
) {
  if (dataCtx && dataCtx.parentData && dataCtx.parentDataProperty !== "") {
    // @ts-ignore: later
    dataCtx.parentData[dataCtx.parentDataProperty] = value;
  } else {
    throw new Error(
      'In "' +
        instancePath +
        '", cannot set value ' +
        JSON.stringify(value) +
        " to context " +
        JSON.stringify(dataCtx),
    );
  }
}

/*
function yahooFinanceType(
  data: unknown,
  schema: string,
  _definitions: JSONSchema["definitions"] | undefined,
  errors: ValidationError[],
  instancePath: string,
  dataCtx?: DataCtx,
  schemaPath: string = "",
) {
  if (schema === "DateInMs") {
    if (typeof data === "number") {
      return set(dataCtx, new Date(data), instancePath);
    } else {
      errors.push({
        // keyword: "yahooFinanceType",
        instancePath,
        schemaPath,
        message: "yahooFinanceDate/dateInMs: Expected a number",
        // params: { schema, data },
        schema,
        data,
      });
      return false;
    }
  } else {
    errors.push({
      instancePath,
      schemaPath,
      // keyword: "yahooFinanceType",
      message: "yahooFinanceType: no matching type",
      // params: { schema, data },
      data,
      schema,
    });
    return false;
  }

  // return true;
}
*/

function schemaFromSchemaOrSchemaKey(
  schemaOrSchemaKey: JSONSchema | string,
  definitions: JSONSchema["definitions"],
): [JSONSchema, string] {
  let schema: JSONSchema;
  let path: string = "";

  if (!definitions) {
    throw new Error("No definitions provided");
  }

  if (typeof schemaOrSchemaKey === "string") {
    const definition = schemaOrSchemaKey.match(/^#\/definitions\/(.*)$/)?.[1];
    if (!definition) {
      throw new Error("No such schema with key: " + schemaOrSchemaKey);
    }
    schema = definitions[definition] as JSONSchema;
    path = schemaOrSchemaKey;
    if (!schema) {
      throw new Error(`No such schema with key: ${definition}`);
    }
  } else {
    schema = schemaOrSchemaKey;
    if (schema.$id) path = schema.$id;
  }

  while (schema.$ref) {
    schema = definitions[
      schema.$ref.replace("#/definitions/", "")
    ] as JSONSchema;
    path = schema.$ref!;
  }

  return [schema as JSONSchema, path];
}

export interface DataCtx {
  parentData: unknown;
  parentDataProperty: number | string;
}

export default function validateAndCoerce(
  input: unknown,
  schemaOrSchemaKey: JSONSchema | string,
  ctx: ValidationCtx,
  errors: ValidationError[] = [],
  instancePath: string = "",
  dataCtx?: DataCtx,
  schemaPath: string | null = null,
) {
  const [schema, foundSchemaPath] = schemaFromSchemaOrSchemaKey(
    schemaOrSchemaKey,
    ctx.definitions,
  );
  if (foundSchemaPath) schemaPath = foundSchemaPath;

  if (schema.anyOf) {
    const allErrors: ValidationError[] = [];
    let _errors: ValidationError[] = [];
    /// Since yahooFinanceType can mutate, we need to save unmodified state.
    const serializedInput = JSON.stringify(input);
    let i = 0;
    for (const subSchema of schema.anyOf as JSONSchema[]) {
      const subSchemaPath = subSchema.$ref ||
        schemaPath + "/anyOf/" + (i++).toString();

      _errors = [];
      validateAndCoerce(
        input,
        subSchema,
        ctx,
        _errors,
        instancePath,
        dataCtx,
        subSchemaPath,
      );
      if (!_errors.length) break;

      // allErrors.push(subSchema);
      allErrors.push(..._errors);
      if (dataCtx?.parentData) {
        input = serializedInput === undefined
          ? undefined
          : JSON.parse(serializedInput);
        // @ts-ignore: it's ok
        dataCtx.parentData[dataCtx.parentDataProperty] = input;
      }
    }
    if (_errors.length) {
      errors.push({
        instancePath,
        schemaPath: schemaPath!, // ! because of "if null" check above
        message: "should match some schema in anyOf",
        data: input,
        // schema,
        subErrors: allErrors,
      });
      // return false;
      return errors;
    }
    /*
  } else if (schema.yahooFinanceType) {
    yahooFinanceType(
      input,
      schema.yahooFinanceType,
      definitions,
      errors,
      instancePath,
      dataCtx,
      schemaPath!, // ! because of "if null" check above
    );
  */
  } else {
    if (schema.type === undefined) {
      // This is actually a no-op.  With schema of {}, accept anything and everything.
      // console.log(`No type in ${instancePath}`);
      // throw new Error(`No type in ${instancePath}`);
      /*
      // TODO, need accesss to parent schema for this
      if (parentSchema.patternProperties)
        throw new Error(
          `patternProperties needed but not supported yet, ${instancePath}`,
        );
      */
    } else if (Array.isArray(schema.type)) {
      let _errors: ValidationError[] = [];
      for (const type of schema.type) {
        _errors = [];
        // @ts-ignore: another day
        const validator = byType[type];
        if (!validator) {
          throw new Error(
            `No validator for type ${JSON.stringify(type)} in ${instancePath}`,
          );
        }
        validator(
          input,
          schema,
          ctx,
          _errors,
          instancePath,
          dataCtx,
          schemaPath,
        );
        if (!_errors.length) break;
      }
      if (_errors.length) {
        errors.push({
          instancePath,
          message: `Expected one of ${schema.type.join(", ")}`,
          data: input,
        });
        // return false;
        return errors;
      }
    } else {
      // @ts-ignore: another day
      const validator = byType[schema.type];
      if (!validator) {
        throw new Error(
          `No validator for type ${
            JSON.stringify(schema.type)
          } in ${instancePath}`,
        );
      }
      validator(
        input,
        schema,
        ctx,
        errors,
        instancePath,
        dataCtx,
        schemaPath,
      );
    }
  }

  return errors;
}
