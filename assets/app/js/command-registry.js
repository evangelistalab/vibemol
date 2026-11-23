(function (global) {
  'use strict';

  const types = {
    object: isObject,
    array: Array.isArray,
    string: value => typeof value === 'string',
    number: Number.isFinite,
    integer: Number.isInteger,
    boolean: value => typeof value === 'boolean',
    null: value => value === null,
  };
  const scalarTypes = new Set(['string', 'number', 'integer', 'boolean', 'null']);
  const fieldsByType = {
    object: ['properties', 'required', 'additionalProperties'],
    array: ['items', 'minItems', 'maxItems'],
    number: ['minimum', 'maximum'],
    integer: ['minimum', 'maximum'],
  };
  const identifier = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
  const targetPath = /^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9]*$/;

  function isObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }

  function isJson(value, ancestors = new Set()) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string' || Number.isFinite(value)) return true;
    if ((!isObject(value) && !Array.isArray(value)) || ancestors.has(value)) return false;
    const path = new Set(ancestors).add(value);
    const keys = Object.keys(value);
    if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, i) => key !== String(i)))) return false;
    return keys.every(key => {
      const entry = Object.getOwnPropertyDescriptor(value, key);
      return Object.hasOwn(entry, 'value') && isJson(entry.value, path);
    });
  }

  function sameJson(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Array.isArray(left) !== Array.isArray(right)) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
      && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
  }

  function checkSchema(schema, path) {
    if (!isObject(schema) || !Object.prototype.propertyIsEnumerable.call(schema, 'type')) {
      throw new TypeError(`Invalid schema type at ${path}`);
    }
    const { type } = schema;
    const union = Array.isArray(type);
    const valid = union
      ? type.length >= 2 && new Set(type).size === type.length && type.every(name => scalarTypes.has(name))
      : typeof type === 'string' && Object.hasOwn(types, type);
    if (!valid) throw new TypeError(`Invalid schema type at ${path}`);
    const fields = union
      ? (type.includes('number') || type.includes('integer') ? fieldsByType.number : [])
      : fieldsByType[type] || [];
    const allowed = ['type', 'enum', ...fields];
    for (const key of Object.keys(schema)) {
      if (!allowed.includes(key)) throw new TypeError(`Unsupported schema keyword "${key}" at ${path}`);
    }
    if (Object.hasOwn(schema, 'enum') && (!Array.isArray(schema.enum) || !schema.enum.length)) {
      throw new TypeError(`Invalid enum at ${path}`);
    }
    if (Object.hasOwn(schema, 'properties')) {
      if (!isObject(schema.properties)) throw new TypeError(`Invalid properties at ${path}`);
      for (const [key, child] of Object.entries(schema.properties)) checkSchema(child, `${path}.properties.${key}`);
    }
    if (Object.hasOwn(schema, 'required') && (!Array.isArray(schema.required)
      || schema.required.some(key => typeof key !== 'string')
      || new Set(schema.required).size !== schema.required.length)) {
      throw new TypeError(`Invalid required list at ${path}`);
    }
    if (Object.hasOwn(schema, 'additionalProperties') && schema.additionalProperties !== false) {
      throw new TypeError(`Only additionalProperties: false is supported at ${path}`);
    }
    if (Object.hasOwn(schema, 'items')) checkSchema(schema.items, `${path}.items`);
    for (const [min, max, validBound] of [
      ['minimum', 'maximum', Number.isFinite],
      ['minItems', 'maxItems', count => Number.isInteger(count) && count >= 0],
    ]) {
      if ([min, max].some(key => Object.hasOwn(schema, key) && !validBound(schema[key])) || schema[min] > schema[max]) {
        throw new TypeError(`Invalid ${min}/${max} at ${path}`);
      }
    }
  }

  function validateValue(schema, params) {
    const errors = [];
    function validate(rule, value, path) {
      const report = message => errors.push({ path, message });
      const names = Array.isArray(rule.type) ? rule.type : [rule.type];
      if (!names.some(name => types[name](value))) {
        report(`Expected ${names.join(' or ')}`);
        return;
      }
      if (rule.enum && !rule.enum.some(choice => sameJson(value, choice))) report('Expected one of the enum values');
      if (typeof value === 'number') {
        if (Object.hasOwn(rule, 'minimum') && value < rule.minimum) report(`Expected a value of at least ${rule.minimum}`);
        if (Object.hasOwn(rule, 'maximum') && value > rule.maximum) report(`Expected a value of at most ${rule.maximum}`);
      }
      if (rule.type === 'object') {
        const properties = rule.properties || {};
        for (const key of rule.required || []) {
          if (!Object.hasOwn(value, key)) errors.push({ path: `${path}.${key}`, message: 'Required property' });
        }
        for (const key of Object.keys(value)) {
          const childPath = `${path}.${key}`;
          if (Object.hasOwn(properties, key)) validate(properties[key], value[key], childPath);
          else if (rule.additionalProperties === false) errors.push({ path: childPath, message: 'Unexpected property' });
        }
      }
      if (rule.type === 'array') {
        if (value.length < rule.minItems) report(`Expected at least ${rule.minItems} items`);
        if (value.length > rule.maxItems) report(`Expected at most ${rule.maxItems} items`);
        if (rule.items) {
          for (let i = 0; i < value.length; i++) validate(rule.items, value[i], `${path}[${i}]`);
        }
      }
    }
    validate(schema, params, '$');
    return errors.length ? { ok: false, errors } : { ok: true };
  }

  function validateParams(schema, params) {
    try {
      if (!isJson(schema)) throw new TypeError('Expected a plain JSON schema');
      checkSchema(schema, '$');
      return validateValue(schema, params);
    } catch (error) {
      return { ok: false, errors: [{ path: '$', message: errorString(error, 'message', 'Validation failed') }] };
    }
  }

  class Unavailable extends Error {}

  function targetMember(path) {
    const [namespace, member] = path.split('.');
    const owner = global[namespace];
    const value = owner?.[member];
    if (value == null) throw new Unavailable(`${path} is unavailable`);
    return { owner, value };
  }

  const api = Object.freeze({
    read: path => targetMember(path).value,
    call(path, ...args) {
      const { owner, value } = targetMember(path);
      if (typeof value !== 'function') throw new Unavailable(`${path} is unavailable`);
      return Reflect.apply(value, owner, args);
    },
  });

  function failure(code, message, details) {
    return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
  }

  function commandResult(result, outcome) {
    if (outcome === 'value') return { ok: true, value: result };
    if (isObject(result) && Object.hasOwn(result, 'ok')) {
      const hasValue = Object.hasOwn(result, 'value');
      const hasError = Object.hasOwn(result, 'error');
      if (result.ok === true && hasValue && !hasError) return { ok: true, value: result.value };
      if (result.ok === false && hasError && !hasValue) {
        const reason = result.error;
        if (typeof reason === 'string') return failure('rejected', reason, reason);
        if (isObject(reason)) return failure('rejected', errorString(reason, 'message', 'Command rejected'), reason);
      }
    }
    return failure('failed', 'Malformed command outcome envelope', { code: 'malformed-envelope' });
  }

  function errorString(error, key, fallback) {
    try {
      const value = error?.[key];
      return typeof value === 'string' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function createCommandRegistry(definitions) {
    if (!Array.isArray(definitions)) throw new TypeError('Expected a list of command definitions');
    const commands = new Map();
    for (const definition of definitions) {
      if (!isObject(definition)) throw new TypeError('Expected a command definition object');
      const { id, title, params, mutates, target, run, outcome = 'value' } = definition;
      if (typeof id !== 'string' || !identifier.test(id) || typeof title !== 'string' || !title.trim()
        || typeof mutates !== 'boolean' || typeof target !== 'string' || !targetPath.test(target)
        || typeof run !== 'function' || (outcome !== 'value' && outcome !== 'envelope')
        || !isObject(params) || params.type !== 'object' || !isJson(params)) {
        throw new TypeError('Invalid command definition');
      }
      if (commands.has(id)) throw new TypeError(`Duplicate command id "${id}"`);
      checkSchema(params, id);
      commands.set(id, { descriptor: structuredClone({ id, title, params, mutates, target }), run, outcome });
    }
    const ids = [...commands.keys()].sort();

    async function run(id, params = {}) {
      const command = commands.get(id);
      if (!command) return failure('unknown-command', 'Unknown command id');
      try {
        let owned;
        try {
          if (!isJson(params)) throw new TypeError('Expected plain JSON data');
          owned = structuredClone(params);
        } catch {
          return failure('invalid-params', 'Invalid command parameters', [{ path: '$', message: 'Expected cloneable JSON data' }]);
        }
        const validation = validateValue(command.descriptor.params, owned);
        if (!validation.ok) return failure('invalid-params', 'Invalid command parameters', validation.errors);
        targetMember(command.descriptor.target);
        const result = commandResult(await command.run(owned, api), command.outcome);
        try {
          return structuredClone(result);
        } catch (error) {
          return failure('failed', 'Command result is not cloneable', {
            code: 'non-serializable-result', name: errorString(error, 'name', 'Error'),
          });
        }
      } catch (error) {
        // A thrown value can be a proxy whose prototype or properties throw.
        try {
          if (error instanceof Unavailable) return failure('not-available', error.message);
        } catch { /* Use the normal failure envelope below. */ }
        return failure('failed', errorString(error, 'message', 'Command failed'), { name: errorString(error, 'name', 'Error') });
      }
    }

    return Object.freeze({
      list: () => ids.map(id => structuredClone(commands.get(id).descriptor)),
      describe: id => commands.has(id) ? structuredClone(commands.get(id).descriptor) : null,
      run,
    });
  }

  global.VibeMolCommandRegistry = Object.freeze({ createCommandRegistry, validateParams });
})(typeof window === 'undefined' ? globalThis : window);
