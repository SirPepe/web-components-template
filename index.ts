function defineElement(
  tagName: `${string}-${string}`
): (
  _: unknown,
  context: ClassDecoratorContext<CustomElementConstructor>
) => void {
  return function(
    _: unknown,
    context: ClassDecoratorContext<CustomElementConstructor>
  ): void {
    context.addInitializer(function() {
      window.customElements.get(tagName)
        ?? window.customElements.define(tagName, this);
    });
  };
}

type AttributeOptions<Value> = {
  name?: string;
  toAttr?: (value: Value | null) => string;
  fromAttr: (value: string | null) => Value;
}

function attribute<This extends HTMLElement, Value>(args: AttributeOptions<Value>) {
  const toAttr = args.toAttr ?? String;
  const fromAttr = args.fromAttr;
  return function(
    value: ClassAccessorDecoratorTarget<This, Value>,
    context: ClassAccessorDecoratorContext<This, Value>
  ): ClassAccessorDecoratorResult<This, Value> {
    const attrName = args.name ?? context.name;
    if (typeof attrName === "symbol") {
      throw new TypeError("Attribute Names must be strings");
    }
    return {
      init(input) {
        const attrValue = this.getAttribute(attrName);
        if (attrValue !== null) {
          return fromAttr(attrValue);
        }
        return input;
      },
      set (input) {
        this.setAttribute(attrName, toAttr(input));
        return value.set.apply(this, [input]);
      },
      get() {
        return value.get.apply(this);
      },
    }
  };
}

const jsonAttributeOptions = {
  fromAttr(value: string | null): any {
    if (value) {
      return JSON.parse(value);
    }
    return null;
  },
  toAttr(value: any) {
    return JSON.stringify(value);
  }
}

export @defineElement("test-element") class TestElement extends HTMLElement {
  @attribute(jsonAttributeOptions) accessor data: any;
}

declare global {
  interface HTMLElementTagNameMap {
    "test-element": TestElement;
  }
}


const el = document.querySelector("test-element");

console.log({ data: el?.data })
