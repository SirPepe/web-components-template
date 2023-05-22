import type { AttributeTransformer } from "./attributeTransformers"
import type { ClassAccessorDecorator } from "./types";

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

// Maps records of attribute metadata, namely symbols and a transformer
// function, to attributes names grouped by custom element constructors. This
// enables the attributeChangedCallback() to do the aforementioned filtering and
// also allows the callback to access the actual attribute data storage via the
// symbol.
const attributeMetadata = new Map<
  Function,
  Record<string, { key: symbol; parse: (input: unknown) => any }>
>();

//
const reactivityEventBus = new EventTarget();

//
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

// Define a custom element with a given tag name and also perform some
// additional setup the make @attribute work.
export function define<T extends CustomElementConstructor>(
  tagName: `${string}-${string}`
): (
  target: T,
  context: ClassDecoratorContext<T>
) => void {
  return function(
    target: T,
    context: ClassDecoratorContext<T>
  ): T {
    // Register the element with the custom element registry once *all* other
    // decorators have been applied (eg. when the class decorator initializer
    // runs).
    context.addInitializer(function() {
      window.customElements.get(tagName)
        ?? window.customElements.define(tagName, this);
    });

    //
    return class extends target {

      //
      static get observedAttributes(): string[] {
        return [
          ...(target as any).observedAttributes ?? [],
          ...observableAttributes
        ];
      }

      attributeChangedCallback(
        name: string,
        oldValue: string,
        newValue: string
      ): void {
        console.log("ACB", name, oldValue, newValue);
        // Bases custom element classes may or may not have defined an
        // attributeChangedCallback() themselves, but we can't know whether or
        // not this is the case. If an attributeChangedCallback() already
        // exists, we must call it to keep it working, but we can't check if
        // super contains "attributeChangedCallback" - only member access and
        // calls are valid syntax. Optional chaining the call works at runtime,
        // but TS does not know that this makes it irrelevant whether
        // "attributeChangedCallback" actually exists. So ignoring the following
        // line is the only remaining course of action.
        // @ts-ignore
        super.attributeChangedCallback?.(name, oldValue, newValue);
        // Everything below is just to handle @attribute
        if (oldValue === newValue) {
          return;
        }
        const relevantAttributes = attributeMetadata.get(this.constructor);
        if (relevantAttributes) {
          const names = Object.keys(relevantAttributes);
          if (names.includes(name)) {
            const key = relevantAttributes[name].key;
            const transformedValue = relevantAttributes[name].parse(newValue);
            if (this[key] !== transformedValue) {
              this[key] = transformedValue;
              reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
            }
          }
        }
      }
    };
  };
}

type AttrOptions = {
  default?: boolean;
}

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
  return function(_, context): ClassAccessorDecoratorResult<T, V> {
    if (context.kind !== "accessor") {
      throw new TypeError("@attribute is an accessor decorator");
    }

    // Accessor decorators can be applied to symbol accessors, but DOM attribute
    // names must be strings.
    const attrName = context.name;
    if (typeof attrName === "symbol") {
      throw new TypeError("Attribute names must be strings");
    }

    // For reasons outlined at the definition of potentiallyObservedAttributes,
    // we need to keep track of *all* reactive attributes that have been
    // declared by the @attribute decorator.
    if (isReactiveAttribute) {
      observableAttributes.add(attrName);
    }

    // Shared secret key for the actual place where attribute data gets stored.
    // It can't be stored in private fields, as those won't be accessible to
    // subclasses like the one the @define has to create in order to support
    // attribute changes.
    const key = Symbol();

    // Setup the attribute metadata when the decorator for a reactive attribute
    // initializes. This is the earliest point at which we know the element the
    // attribute that defined for.
    if (isReactiveAttribute) {
      context.addInitializer(function() {
        const metadata = attributeMetadata.get(this.constructor);
        if (!metadata) {
          attributeMetadata.set(this.constructor, { attrName: { key, parse } });
          return;
        }
        metadata[attrName] = { key, parse };
      });
    }

    // Ignore the private field and store the data behind the symbol while
    // keeping the attribute up to date.
    return {
      init(input) {
        const attrValue = this.getAttribute(attrName);
        if (attrValue !== null) {
          const value = parse(attrValue);
          this[key] = value;
          reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
          return value;
        }
        this[key] = validate(input);
        reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
        return input;
      },
      set (input) {
        input = validate(input);
        this[key] = input;
        const attrValue = stringify(input);
        if (isReactiveAttribute) {
          this.setAttribute(attrName, attrValue);
        }
        reactivityEventBus.dispatchEvent(new ReactivityEvent(this));
      },
      get() {
        return this[key];
      },
    }
  };
}

type Handler<T, K = string> = K extends keyof HTMLElementEventMap
  ? (this: T, event: HTMLElementEventMap[K]) => void
  : (this: T, event: Event) => void;

type HandleDecorator<T, K = string> =
  (value: Handler<T, K>, context: ClassMethodDecoratorContext<T, Handler<T, K>>) => void;

export function handle<T extends HTMLElement, K extends keyof HTMLElementEventMap>(type: K, selector?: string): HandleDecorator<T, K>;
export function handle<T extends HTMLElement>(type: string, selector?: string): HandleDecorator<T>;
export function handle<T extends HTMLElement>(type: string, selector?: string): HandleDecorator<T> {
  return function (value: Handler<T>, context: ClassMethodDecoratorContext<T, Handler<T>>): void {
    context.addInitializer(function() {
      if (!this.shadowRoot) {
        throw new Error("No shadow root to attach handler function to");
      }
      if (!selector) {
        this.shadowRoot.addEventListener(type, (evt) => value.call(this, evt))
      } else {
        this.shadowRoot.addEventListener(type, (evt) => {
          if (evt.target instanceof HTMLElement && evt.target.matches(selector)) {
            value.call(this, evt);
          }
        });
      }
    })
  }
}

type ReactiveDecorator<T extends HTMLElement> = (
  value: () => any,
  context: ClassMethodDecoratorContext<T, () => any>
) => void;

export function reactive<T extends HTMLElement>(): ReactiveDecorator<T> {
  return function (value, context): void {
    context.addInitializer(function() {
      reactivityEventBus.addEventListener("reactivity", (evt: any) => {
        if (evt.source === this) {
          value.call(this);
        }
      });
    })
  }
}
