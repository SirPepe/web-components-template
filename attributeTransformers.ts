export type AttributeTransformer<V> = {
  // Turns unknown inputs (usually attribute values, that is, string | null)
  // into property values. Must never throw.
  parse: (value: unknown) => V;
  // Validates setter inputs. May throw for invalid values. Defaults to parse()
  validate?: (value: unknown) => V;
  // Turns property values into attributes. Defaults to String().
  stringify?: (value?: V | null) => string;
}

type NumberAttributeOptions<T extends number | bigint> = {
  min?: T;
  max?: T;
}

function validateNumber(min: number, max: number): (value: unknown) => number {
  return function validate(value: unknown) {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber)) {
      throw new Error(`Input ${value} can't be converted to a number`);
    }
    if (asNumber < min || asNumber > max) {
      throw new Error(`${asNumber} is out of range [${min}, ${max}]`);
    }
    return asNumber;
  }
}

export function number(
  options: NumberAttributeOptions<number> = {}
): AttributeTransformer<number> {
  const { min = -Infinity, max = Infinity } = options;
  return {
    parse(value): number {
      const asNumber = Number(value);
      if (asNumber <= min) {
        return min;
      }
      if (asNumber >= max) {
        return max;
      }
      return asNumber;
    },
    validate: validateNumber(min, max),
    stringify: String,
  };
};

export function int(
  options: NumberAttributeOptions<number> = {}
): AttributeTransformer<number> {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER
  } = options;
  return {
    parse(value): number {
      const asNumber = Number(value);
      if (asNumber <= min) {
        return Math.trunc(min);
      }
      if (asNumber >= max) {
        return Math.trunc(max);
      }
      return Math.trunc(asNumber);
    },
    validate: validateNumber(min, max),
    stringify: String,
  };
};
