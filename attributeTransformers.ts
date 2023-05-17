export type AttributeTransformer<V> = {
  from: (value: unknown) => V;
  to?: (value?: V | null) => string;
}

type NumberAttributeOptions = {
  min?: number;
  max?: number;
}

export function number(
  options: NumberAttributeOptions = {}
): AttributeTransformer<number> {
  const { min = -Infinity, max = Infinity } = options;
  return {
    from: function(value): number {
      const asNumber = Number(value);
      if (asNumber < min) {
        return min;
      }
      if (asNumber > max) {
        return max;
      }
      return asNumber;
    },
    to: String,
  };
};
