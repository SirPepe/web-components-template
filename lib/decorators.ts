import type { AttributeTransformer } from "./transformers";
import type { ClassAccessorDecorator, HandleDecorator, Handler } from "./types";

// Defines a custom element with a given tag name *once* any only *after* other
// decorators have been applied.
export function define<T extends CustomElementConstructor>(
  tagName: `${string}-${string}`
): (target: T, context: ClassDecoratorContext<T>) => void {
  return function (_: T, context: ClassDecoratorContext<T>): void {
    if (context.kind !== "class") {
      throw new TypeError("@define is a class decorator");
    }
    context.addInitializer(function () {
      window.customElements.get(tagName) ??
        window.customElements.define(tagName, this);
    });
  };
}

type AttrOptions = {
  default?: boolean;
};

// Accessor decorator @attr
export function attr<T extends HTMLElement, V>(
  transformer: AttributeTransformer<V>,
  options: AttrOptions = {}
): ClassAccessorDecorator<T, V> {
  const parse = transformer.parse;
  const validate = transformer.validate ?? transformer.parse;
  const stringify = transformer.stringify ?? String;
  const isReactiveAttribute = options.default !== true;
  return function ({ get, set }, context): ClassAccessorDecoratorResult<T, V> {
    if (context.kind !== "accessor") {
      throw new TypeError("@attr is an accessor decorator");
    }

    // Accessor decorators can be applied to symbol accessors, but DOM attribute
    // names must be strings.
    const attrName = context.name;
    if (typeof attrName === "symbol") {
      throw new TypeError("Attribute names for @attr must be strings");
    }

    // Accessor decorators can be applied to private fields, but DOM APIs must
    // be public.
    if (context.private) {
      throw new TypeError("Attributes defined by @attr must not be private");
    }

    // Makes the attribute reactive via MutationObserver. Unfortunately this
    // makes the attribute reactions observably asynchronous (in contrast to
    // attributeChangedCallback(), which is usually not *observably*
    // asynchronous), but this is the only way to attach attribute reactivity in
    // a non-intrusive any simple way.
    if (isReactiveAttribute) {
      context.addInitializer(function () {
        new MutationObserver((records) => {
          for (const record of records) {
            const newValue = this.getAttribute(attrName);
            if (newValue !== record.oldValue) {
              set.call(this, parse(newValue));
              reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
            }
          }
        }).observe(this, { attributes: true, attributeFilter: [attrName] });
      });
    }

    return {
      init(input) {
        const attrValue = this.getAttribute(attrName);
        if (attrValue !== null) {
          return parse(attrValue);
        }
        return validate(input);
      },
      set(input) {
        const newValue = validate(input);
        set.call(this, newValue);
        if (isReactiveAttribute) {
          this.setAttribute(attrName, stringify(newValue));
        }
        reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
      },
      get() {
        return get.call(this);
      },
    };
  };
}

export function handle<
  T extends HTMLElement,
  K extends keyof HTMLElementEventMap
>(type: K, selector?: string): HandleDecorator<T, K>;
export function handle<T extends HTMLElement>(
  type: string,
  selector?: string
): HandleDecorator<T>;
export function handle<T extends HTMLElement>(
  type: string,
  selector?: string
): HandleDecorator<T> {
  return function (
    value: Handler<T>,
    context: ClassMethodDecoratorContext<T, Handler<T>>
  ): void {
    context.addInitializer(function () {
      if (!this.shadowRoot) {
        throw new Error("No shadow root to attach handler function to");
      }
      if (!selector) {
        this.shadowRoot.addEventListener(type, (evt) => value.call(this, evt));
      } else {
        this.shadowRoot.addEventListener(type, (evt) => {
          if (
            evt.target instanceof HTMLElement &&
            evt.target.matches(selector)
          ) {
            value.call(this, evt);
          }
        });
      }
    });
  };
}

// For simplicity's sake, all elements share an event bus for reactivity events
// dispatched to support @reactive
const reactivityEventBus = new EventTarget();

// Implements reactivity notifications for @reactive
class ReactivityEvent extends Event {
  #source: HTMLElement;

  constructor(source: HTMLElement) {
    super("reactivity");
    this.#source = source;
  }

  get source(): HTMLElement {
    return this.#source;
  }
}

type ReactiveDecorator<T extends HTMLElement> = (
  value: () => any,
  context: ClassMethodDecoratorContext<T, () => any>
) => void;

export function reactive<T extends HTMLElement>(): ReactiveDecorator<T> {
  return function (value, context): void {
    context.addInitializer(function () {
      // Call the reactive function once after everything else has initialized.
      // Since accessors initialize *after* decorator initializers, the initial
      // call needs to be delayed.
      window.requestAnimationFrame(() => value.call(this));
      // Listen for subsequent reactivity events
      reactivityEventBus.addEventListener("reactivity", (evt: any) => {
        if (evt.source === this) {
          value.call(this);
        }
      });
    });
  };
}
