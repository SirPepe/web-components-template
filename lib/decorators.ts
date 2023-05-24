import type { AttributeTransformer } from "./transformers";
import type { ClassAccessorDecorator } from "./types";

// Class decorator @define defines a custom element with a given tag name *once*
// and only *after* other decorators have been applied.
export function define<T extends CustomElementConstructor>(
  tagName: `${string}-${string}`
): (target: T, context: ClassDecoratorContext<T>) => void {
  return function (_: T, context: ClassDecoratorContext<T>): void {
    if (context.kind !== "class") {
      throw new TypeError(`Class decorator @define used on ${context.kind}`);
    }
    context.addInitializer(function () {
      window.customElements.get(tagName) ??
        window.customElements.define(tagName, this);
    });
  };
}

// Method decorator @reactive calls the method is was applied onto every time a
// property defined with @prop or an attribute defined with @attr changes its
// value.

// Reactivity notifications for @reactive
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

// All elements that use @reactive share an event bus to keep things simple.
const reactivityEventBus = new EventTarget();
let reactivityDispatchHandle: number | null = null;
const reactivityTargets = new Set<HTMLElement>();
function enqueueReactivityEvent(target: HTMLElement): void {
  reactivityTargets.add(target);
  if (reactivityDispatchHandle === null) {
    reactivityDispatchHandle = requestAnimationFrame(() => {
      for (const target of reactivityTargets) {
        reactivityEventBus.dispatchEvent(new ReactivityEvent(target));
      }
      reactivityDispatchHandle = null;
      reactivityTargets.clear();
    });
  }
}

type ReactiveDecorator<T extends HTMLElement> = (
  value: () => any,
  context: ClassMethodDecoratorContext<T, () => any>
) => void;

export function reactive<T extends HTMLElement>(): ReactiveDecorator<T> {
  return function (value, context): void {
    if (context.kind !== "method") {
      throw new TypeError(`Method decorator @reactive used on ${context.kind}`);
    }
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

// Accessor decorator @attr() defines a DOM attribute backed by an accessor.
// Because attributes are public by definition, it can't be applied to private
// accessors or symbol accessors.

type AttrOptions = {
  reflective?: boolean; // defaults to true
};

export function attr<T extends HTMLElement, V>(
  transformer: AttributeTransformer<V>,
  options: AttrOptions = {}
): ClassAccessorDecorator<T, V> {
  const parse = transformer.parse;
  const validate = transformer.validate ?? transformer.parse;
  const stringify = transformer.stringify ?? String;
  const isReflectiveAttribute = options.reflective !== false;
  return function ({ get, set }, context): ClassAccessorDecoratorResult<T, V> {
    if (context.kind !== "accessor") {
      throw new TypeError(`Accessor decorator @attr used on ${context.kind}`);
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
    if (isReflectiveAttribute) {
      context.addInitializer(function () {
        new MutationObserver((records) => {
          for (const record of records) {
            const newValue = this.getAttribute(attrName);
            if (newValue !== record.oldValue) {
              set.call(this, parse(newValue));
              enqueueReactivityEvent(this);
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
        if (isReflectiveAttribute) {
          this.setAttribute(attrName, stringify(newValue));
        }
        enqueueReactivityEvent(this);
      },
      get() {
        return get.call(this);
      },
    };
  };
}

// Accessor decorator @prop() returns a normal accessor, but with validation and
// reactivity added.

export function prop<T extends HTMLElement, V>(
  transformer: AttributeTransformer<V>
): ClassAccessorDecorator<T, V> {
  const validate = transformer.validate ?? transformer.parse;
  return function ({ get, set }, context): ClassAccessorDecoratorResult<T, V> {
    if (context.kind !== "accessor") {
      throw new TypeError(`Accessor decorator @prop used on ${context.kind}`);
    }
    return {
      init(input) {
        return validate(input);
      },
      set(input) {
        const newValue = validate(input);
        set.call(this, newValue);
        enqueueReactivityEvent(this);
      },
      get() {
        return get.call(this);
      },
    };
  };
}

// Method decorator @handle attaches event listeners to the shadow DOM,
// optionally filtered by a selector.

export type Handler<T, K = string> = K extends keyof HTMLElementEventMap
  ? (this: T, event: HTMLElementEventMap[K]) => void
  : (this: T, event: Event) => void;

export type HandleDecorator<T, K = string> = (
  value: Handler<T, K>,
  context: ClassMethodDecoratorContext<T, Handler<T, K>>
) => void;

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
    if (context.kind !== "method") {
      throw new TypeError(`Method decorator @attr used on ${context.kind}`);
    }
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
            evt.target.closest(selector)
          ) {
            value.call(this, evt);
          }
        });
      }
    });
  };
}

// Class field decorator @debounce() debounces functions.

/* eslint-disable */
type Debounceable<A extends unknown[]> = (...args: A[]) => void;
type DebounceDecoratorCtx<A extends unknown[]> = ClassFieldDecoratorContext<
  unknown,
  Debounceable<A>
>;
type DebounceDecoratorResult<A extends unknown[]> = (
  func: Debounceable<A>
) => Debounceable<A>;
/* eslint-enable */

export function debounce<A extends unknown[]>(
  time = 1000
): (_: unknown, ctx: DebounceDecoratorCtx<A>) => DebounceDecoratorResult<A> {
  return function debounceDecorator(value, ctx) {
    if (ctx.kind !== "field") {
      throw new TypeError("@debounce is a field decorator");
    }
    return function init(func: Debounceable<A>): Debounceable<A> {
      if (typeof func !== "function") {
        throw new TypeError("@debounce can only be applied to functions");
      }
      let handle: number | undefined = undefined;
      return function (...args: any[]): any {
        if (typeof handle !== "undefined") {
          window.clearTimeout(handle);
        }
        handle = window.setTimeout(() => {
          handle = undefined;
          func(...args);
        }, time);
      };
    };
  };
}
