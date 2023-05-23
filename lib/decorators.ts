import type { AttributeTransformer } from "./transformers";
import type { ClassAccessorDecorator, HandleDecorator, Handler } from "./types";

// Stores *all* attributes defined via @attr. Attribute observation on custom
// elements works only when we declare a static getter for the list of
// attributes on the component class. This getter gets called *before* the the
// decorators initialize, but after the decorator functions are evaluated. This
// enables us to store all attribute names in this set, but they are at this
// point not yet associated with any particular element class. The
// attributeChangedCallback() has to perform some additional filtering to ensure
// that it only gets executes its attribute reflection logic for attributes that
// actually concern the element in question.
const observableAttributes = new Set<string>();

// Keeps track of attribute event handlers by element instance. Each record that
// maps attribute names to handler functions is lazily initialized be the first
// call to @attr's initializer for any element instance.
type AttributeHandlers = Record<string, (value: string | undefined) => any>;
const attributeChangedHandlers = new WeakMap<HTMLElement, AttributeHandlers>();

// Defines a custom element with a given tag name and also perform some
// additional setup the make @attr work.
export function define<T extends CustomElementConstructor>(
  tagName: `${string}-${string}`
): (target: T, context: ClassDecoratorContext<T>) => void {
  return function (target: T, context: ClassDecoratorContext<T>): void {
    if (context.kind !== "class") {
      throw new TypeError("@define is a class decorator");
    }

    // Register the element with the custom element registry once *all* other
    // decorators have been applied (eg. when the class decorator initializer
    // runs).
    context.addInitializer(function () {
      window.customElements.get(tagName) ??
        window.customElements.define(tagName, this);
    });

    // Extend the original observed attributes as defines on target by *all*
    // observable attributes added by @attr. See the comment on the definition
    // for observableAttributes for details. Keep the original observed
    // attributes around to decide whether or not to call a possible original
    // attributeChangedCallback()
    const originalObservedAttributes = new Set<string>(
      (target as any).observedAttributes ?? []
    );
    Object.defineProperty(target, "observedAttributes", {
      get(): string[] {
        return [...originalObservedAttributes, ...observableAttributes];
      },
    });

    // Custom elements may or may not have defined an attributeChangedCallback()
    // for themselves. If an attributeChangedCallback() already exists, we must
    // call it to keep it working if the attribute that has changed was part of
    // the original observed attributes.
    const originalAttributeChangedCallback =
      target.prototype.attributeChangedCallback;
    Object.defineProperty(target.prototype, "attributeChangedCallback", {
      value: function attributeChangedCallback(
        name: string,
        oldValue: string | undefined,
        newValue: string | undefined
      ): void {
        // Handles a possible previously-existing attributeChangedCallback()
        if (
          typeof originalAttributeChangedCallback === "function" &&
          originalObservedAttributes.has(name)
        ) {
          originalAttributeChangedCallback.call(this, name, oldValue, newValue);
        }
        // Deals with handlers added by @attr
        if (oldValue === newValue) {
          return;
        }
        attributeChangedHandlers.get(this)?.[name]?.call(this, newValue);
      },
    });
  };
}

type AttrOptions = {
  default?: boolean;
};

// Accessor decorator @attr. Looks simple when used, but requires some
// substantial JavaScript gymnastics to get working properly.
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

    // For reasons outlined at the definition of potentiallyObservedAttributes,
    // we need to keep track of *all* reactive attributes that have been
    // declared by the @attribute decorator.
    if (isReactiveAttribute) {
      observableAttributes.add(attrName);
    }

    // Setup the attribute metadata when the decorator for a reactive attribute
    // initializes. This is the earliest point at which we know the element the
    // attribute that defined for.
    if (isReactiveAttribute) {
      context.addInitializer(function () {
        function changeHandler(this: T, attrValue: string | undefined): void {
          set.call(this, parse(attrValue));
          reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
        }
        const handlers = attributeChangedHandlers.get(this);
        if (!handlers) {
          attributeChangedHandlers.set(this, { [attrName]: changeHandler });
          return;
        }
        handlers[attrName] = changeHandler;
      });
    }

    return {
      // Initialize the value from the attribute, if available
      init(input) {
        const attrValue = this.getAttribute(attrName);
        if (attrValue !== null) {
          return parse(attrValue);
        }
        return validate(input);
      },
      // Update the attribute if reactive
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
